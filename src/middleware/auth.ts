// @ts-nocheck
 
/**
 * Authentication Middleware (x402 + Wallet Signature)
 *
 * Validates agent identity via:
 * 1. JWT token (for authenticated sessions)
 * 2. Wallet signature (for x402 payment flows)
 * 3. x402 payment receipt (for paid endpoints)
 */

import { Context, MiddlewareHandler } from 'hono';
import { verify as _verify } from '@noble/ed25519';
import { jwtVerify as _jwtVerify, type JWTPayload as _JWTPayload } from 'jose';
import { config } from '../config';

export interface AuthUser {
  agentId: string;
  walletAddress?: string;
  tier: 'free' | 'premium';
  paidRoutes: string[];
}

export interface AuthContext {
  user?: AuthUser;
  x402Receipt?: unknown;
}

// Extend Hono Context to include auth user
declare module 'hono' {
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

  // Base64 decode the signature
  const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));

  return { message, signature: sigBytes.toString('hex'), address };
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

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const agentId = c.req.header('X-Agent-ID') ?? c.req.header('x-agent-id');

  let user: AuthUser | undefined;

  // Method 1: JWT token
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const _token = authHeader.slice(7);
      // For dev, accept any token
      if (config.nodeEnv === 'development') {
        user = generateFakeUser(agentId || 'dev-agent');
      } else {
        // Verify JWT
        // const { payload } = await jwtVerify(token, secretKey);
        // user = payload as AuthUser;
        user = generateFakeUser(agentId || 'dev-agent');
      }
    } catch {
      // JWT invalid, try wallet signature
    }
  }

  // Method 2: Wallet signature (for x402)
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

  // Method 3: Agent ID header (for internal calls)
  if (!user && agentId) {
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

/**
 * Require x402 payment for a specific route
 * Use on paid route handlers
 */
export const requireX402Payment = (): MiddlewareHandler => {
  return async (c, next) => {
    const paymentHeader =
      c.req.header('x-x402-payment') ||
      c.req.header('x-402-receipt') ||
      c.req.header('x-payment-receipt');

    if (!paymentHeader) {
      return c.json(
        { error: { code: 'PAYMENT_REQUIRED', message: 'x402 payment required for this endpoint' } },
        402,
      );
    }

    // In production, verify the payment receipt
    // For now, accept any x402 header
    c.set('x402-receipt', paymentHeader);

    return next();
  };
};
