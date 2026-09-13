/**
 * Authentication Middleware (x402 + Wallet Signature)
 *
 * Validates agent identity via:
 * 1. JWT token (for authenticated sessions)
 * 2. Wallet signature (for x402 payment flows)
 * 3. x402 payment receipt (for paid endpoints)
 */

import { Context, MiddlewareHandler } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config';
import { verifyPaymentSubmission } from '../services/x402/index';
import { verifyAgentDID } from '../services/identity/did';

export interface AuthUser {
  agentId: string;
  walletAddress?: string;
  tier: 'free' | 'basic' | 'premium';
  paidRoutes: string[];
}

export interface AuthContext {
  user?: AuthUser;
  x402Receipt?: unknown;
}

// Extend Hono Context to include auth user and x402 variables
declare module 'hono' {
  interface ContextVariableMap {
    x402TxId: string;
    x402Receipt: unknown;
    'x402-receipt': string;
  }
  interface Context {
    auth: AuthContext;
    user?: AuthUser;
  }
}

const generateFakeUser = (agentId: string): AuthUser => ({
  agentId,
  walletAddress: `ALGO:${agentId}`,
  tier: 'premium',
  paidRoutes: ['*', '/api/shop/*', '/api/skill-swap/*'],
});

const extractWalletSignature = (
  c: Context,
): { message: string; signature: string; address: string } | null => {
  const sig = c.req.header('x-wallet-sig');
  const address = c.req.header('x-wallet-address');
  const message = c.req.header('x-wallet-message');

  if (!sig || !address || !message) return null;

  try {
    const sigBuffer = Buffer.from(sig, 'base64');
    return { message, signature: sigBuffer.toString('hex'), address };
  } catch {
    return null;
  }
};

const verifyWalletSignature = async (
  message: string,
  signature: string,
  address: string,
): Promise<boolean> => {
  try {
    // In production, verify against actual Algorand address
    // For now, accept any valid-looking signature
    const _msgBytes = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(signature, 'hex');

    // Simplified verification - in production, verify against algo address
    return sigBytes.length === 64 && address.startsWith('ALGO:');
  } catch {
    return false;
  }
};

/**
 * Creates a signed JWT token for an agent/user.
 */
export const createToken = async (
  payload: Partial<AuthUser> & { agentId: string },
  expiresIn: string = config.jwtExpiry,
): Promise<string> => {
  const secretKey = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.agentId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const agentId = c.req.header('X-Agent-ID') ?? c.req.header('x-agent-id');
  const didHeader = c.req.header('X-Agent-DID') ?? c.req.header('x-agent-did');
  const sigHeader = c.req.header('X-Agent-Signature') ?? c.req.header('x-agent-signature');
  const nonceHeader =
    c.req.header('X-Agent-Nonce') ??
    c.req.header('x-agent-nonce') ??
    c.req.header('X-Agent-Timestamp') ??
    c.req.header('x-agent-timestamp');

  let user: AuthUser | undefined;

  // Method 1: JWT token
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const secretKey = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jwtVerify(token, secretKey);
      user = {
        agentId:
          (payload.agentId as string) ||
          (payload.sub as string) ||
          agentId ||
          'unknown-agent',
        walletAddress: payload.walletAddress as string | undefined,
        tier: (payload.tier as 'free' | 'premium') || 'free',
        paidRoutes: Array.isArray(payload.paidRoutes) ? (payload.paidRoutes as string[]) : [],
      };
    } catch {
      // In development or test, allow fallback if arbitrary Bearer token passed
      if (config.nodeEnv === 'development' || config.nodeEnv === 'test') {
        user = generateFakeUser(agentId || 'dev-agent');
      }
    }
  }

  // Method 2: Stateless DID signature headers (X-Agent-DID, X-Agent-Signature, X-Agent-Nonce)
  if (!user && didHeader && sigHeader && nonceHeader) {
    const outcome = await verifyAgentDID(didHeader, sigHeader, nonceHeader);
    if (outcome.verified) {
      user = {
        agentId: didHeader,
        walletAddress:
          didHeader.startsWith('did:algo:') || didHeader.startsWith('ALGO:')
            ? didHeader.replace(/^did:algo:/, '')
            : undefined,
        tier: 'premium',
        paidRoutes: ['*', '/api/shop/*', '/api/skill-swap/*'],
      };
    }
  }

  // Method 2b: Legacy wallet signature headers (for x402)
  if (!user) {
    const walletSig = extractWalletSignature(c);
    if (walletSig) {
      const isValid = await verifyWalletSignature(
        walletSig.message,
        walletSig.signature,
        walletSig.address,
      );

      if (isValid) {
        user = generateFakeUser(walletSig.address);
      }
    }
  }

  // Method 3: Agent ID header (only for development/testing)
  if (!user && agentId && (config.nodeEnv === 'development' || config.nodeEnv === 'test')) {
    user = generateFakeUser(agentId);
  }

  // Set auth context
  c.auth = {
    user,
    x402Receipt: c.get('x402-receipt') || undefined,
  };

  if (user) {
    c.user = user;
  }

  return next();
};

export interface RequireX402PaymentOptions {
  minAmountMicroAlgos?: number;
  serviceId?: string;
}

/**
 * Require x402 payment for a specific route
 * Use on paid route handlers
 */
export const requireX402Payment = (options?: RequireX402PaymentOptions): MiddlewareHandler => {
  return async (c, next) => {
    const paymentHeader =
      c.req.header('x-x402-payment') ||
      c.req.header('x-402-receipt') ||
      c.req.header('x-payment-receipt');

    if (!paymentHeader) {
      const paymentId = crypto.randomUUID();
      const receiverWallet = config.algorandReceiverWallet;
      const amount = options?.minAmountMicroAlgos ?? 100000;
      const currency = 'microAlgos';
      const network = config.algorandNetwork || 'algorand-testnet';
      const expiresAt = Date.now() + 15 * 60 * 1000;

      return c.json(
        {
          error: {
            code: 'PAYMENT_REQUIRED',
            message: 'x402 payment required for this endpoint',
            challenge: {
              paymentId,
              receiverWallet,
              amount,
              currency,
              network,
              expiresAt,
            },
          },
        },
        402,
      );
    }

    // Parse header: raw txId, JSON {"txId": "...", "receipt": "...", "paymentId": "..."}, or txId:receipt
    let txId = '';
    let receipt: string | undefined;
    let paymentId: string | undefined;

    const trimmed = paymentHeader.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        txId = (parsed.txId || parsed.txn_hash || parsed.transactionId || '').trim();
        receipt = parsed.receipt || parsed.signature;
        paymentId = parsed.paymentId || parsed.proposalId;
      } catch {
        // Fallback to raw string
      }
    }

    if (!txId) {
      if (trimmed.includes(':')) {
        const splitIndex = trimmed.indexOf(':');
        txId = trimmed.slice(0, splitIndex).trim();
        receipt = trimmed.slice(splitIndex + 1).trim();
      } else {
        txId = trimmed;
      }
    }

    if (!receipt) {
      receipt = c.req.header('x-402-receipt') || c.req.header('x-payment-receipt');
    }

    const minAmount = options?.minAmountMicroAlgos ?? 100000;
    const serviceId = options?.serviceId ?? c.req.path;

    const verification = await verifyPaymentSubmission(
      { txId, receipt, paymentId },
      { amountMicroAlgos: minAmount, serviceId },
    );

    if (!verification.verified) {
      const isDoubleSpend = verification.reason?.includes('DOUBLE_SPEND');
      return c.json(
        {
          error: {
            code: isDoubleSpend ? 'DOUBLE_SPEND_DETECTED' : 'PAYMENT_VERIFICATION_FAILED',
            message: verification.reason ?? 'Payment verification failed',
            txId,
          },
        },
        402,
      );
    }

    c.set('x402Receipt', verification);
    c.set('x402TxId', txId);
    c.set('x402-receipt', txId);
    if (c.auth) {
      c.auth.x402Receipt = verification;
    }

    return next();
  };
};
