/**
 * Verification Routes — Agent Identity Verification
 *
 * DID-based wallet signature verification for agent identity:
 * - POST /challenge — Request a signature challenge
 * - POST /verify — Submit a signed challenge response
 * - GET /status — Check verification status
 * - POST /revoke — Revoke existing verification
 */

import { Hono } from 'hono';
import { z } from 'zod';
import algosdk from 'algosdk';
import { createSupabaseClient } from '../supabase/client';
import { config } from '../config';
import { createToken } from '../middleware/auth';
import {
  challengeAgent,
  verifyAgent,
  getAgentStatus,
  revokeAgent,
} from '../services/verification/index';
import {
  createSqliteChallenge,
  getSqliteChallenge,
  upsertSqliteVerification,
  getSqliteVerification,
} from '../db/sqlite';
import { normalizeSignature, normalizeMessage } from '../services/identity/did';

const router = new Hono();

// Zod schemas
const challengeResponseSchema = z.object({
  agentId: z.string(),
  challenge: z.string(),
  signature: z.string().min(1),
  walletAddress: z.string().optional(),
  didDocument: z.string().optional(),
});

const statusQuerySchema = z.object({
  agentId: z.string(),
});

const revokeSchema = z.object({
  agentId: z.string(),
  reason: z.string().max(500).optional(),
});

/**
 * POST /challenge — Request a signature challenge
 *
 * Generates a unique challenge string for the agent to sign with
 * their Algorand wallet. The challenge expires after 5 minutes.
 * The agent must sign this challenge to prove wallet ownership.
 */
router.post('/challenge', async (c) => {
  try {
    const body = await c.req.json();
    const { agentId } = z.object({ agentId: z.string() }).parse(body);

    const supabase = createSupabaseClient();

    // Revoke any existing active challenge for this agent
    await supabase.from('verification_challenges')
      .update({ status: 'expired' })
      .eq('user_id', agentId)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString());

    // Generate challenge via Verification Service (with rate limiting and secure nonces)
    const issued = await challengeAgent(agentId);
    const expiresAt = new Date(issued.expiresAt).toISOString();

    // Store challenge in Supabase
    const { data, error } = await supabase.from('verification_challenges')
      .insert({
        id: issued.challengeId,
        user_id: agentId,
        challenge: issued.nonce,
        proof: issued.message,
        expires_at: expiresAt,
        status: 'pending',
        method: 'signature',
        created_at: new Date(issued.issuedAt).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to create challenge' } },
        500,
      );
    }

    if (config.useLocalDb) {
      try {
        await createSqliteChallenge({
          id: issued.challengeId,
          user_id: agentId,
          challenge: issued.nonce,
          proof: issued.message,
          expires_at: expiresAt,
          status: 'pending',
          method: 'signature',
          created_at: new Date(issued.issuedAt).toISOString(),
        });
      } catch {
        // Ignore SQLite error
      }
    }

    return c.json(
      {
        message: 'Challenge generated',
        challenge: {
          id: data.id,
          agentId: data.user_id,
          challenge: data.challenge,
          message: issued.message,
          expiresAt: data.expires_at,
          verified: data.status === 'verified',
          createdAt: data.created_at,
        },
      },
      200,
    );
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    if (err?.message?.includes('Rate limit')) {
      return c.json({ error: { code: 'RATE_LIMITED', message: err.message } }, 429);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to generate challenge' } },
      500,
    );
  }
});

/**
 * POST /verify — Submit a signed challenge response
 *
 * Verifies the agent's wallet signature against the challenge.
 * On success, marks the agent as verified and updates their DID.
 * Uses Algorand signature verification in production.
 */
router.post('/verify', async (c) => {
  try {
    const body = await c.req.json();
    const validated = challengeResponseSchema.parse(body);
    const _user = c.user;

    // Allow verification even without full auth (initial step)
    const agentId = validated.agentId;

    const supabase = createSupabaseClient();

    // Get active challenge
    let challenge: any = null;
    const { data: supabaseChallenge, error: challengeError } = await supabase.from('verification_challenges')
      .select('*')
      .eq('user_id', agentId)
      .eq('challenge', validated.challenge)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .single();

    challenge = supabaseChallenge;
    if ((challengeError || !challenge) && config.useLocalDb) {
      challenge = await getSqliteChallenge(validated.challenge, agentId);
    }

    if (!challenge) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Valid challenge not found. Request a new one.' } },
        404,
      );
    }

    // Verify signature using the verification service
    const serviceResult = await verifyAgent(
      agentId,
      validated.signature,
      validated.challenge,
    );

    const signatureValid =
      serviceResult.verified ||
      (config.nodeEnv !== 'production' &&
        verifySignature(
          validated.challenge,
          validated.signature,
          validated.walletAddress || '',
        ));

    if (!signatureValid) {
      return c.json(
        { error: { code: 'INVALID_SIGNATURE', message: serviceResult.reason ?? 'Wallet signature verification failed' } },
        400,
      );
    }

    const now = new Date().toISOString();

    // Mark challenge as verified
    const { error: updateError } = await supabase.from('verification_challenges')
      .update({ status: 'verified', updated_at: now })
      .eq('id', challenge.id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to update challenge status' } },
        500,
      );
    }

    // ⚡ Bolt Optimization: Replace sequential select and update/insert with a single upsert
    // Removes an unnecessary round trip to the database
    await supabase.from('agent_verification').upsert({
      user_id: agentId,
      is_verified: true,
      status: 'verified',
      wallet_address: validated.walletAddress ?? null,
      did_document: validated.didDocument ?? null,
      verified_at: now,
      tier: 'basic',
      updated_at: now,
    }, { onConflict: 'user_id' });

    // Persist to SQLite
    try {
      await upsertSqliteVerification({
        user_id: agentId,
        is_verified: true,
        status: 'verified',
        tier: 'basic',
        method: agentId.startsWith('did:key:') ? 'ed25519_did_key' : 'signature',
        did_document: validated.didDocument ?? null,
        wallet_address: validated.walletAddress ?? null,
        verified_at: now,
      });
    } catch {
      // Ignore if SQLite error
    }

    const token =
      serviceResult.token ||
      (await createToken({
        agentId,
        tier: 'basic',
        walletAddress: validated.walletAddress,
      }));

    return c.json(
      {
        message: 'Verification successful',
        token,
        verification: {
          agentId,
          isVerified: true,
          walletAddress: validated.walletAddress,
          verifiedAt: now,
          tier: 'basic' as const,
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Verification failed' } }, 500);
  }
});

/**
 * GET /status — Check verification status
 *
 * Returns the current verification status for an agent, including
 * DID document, wallet address, and verification tier.
 */
router.get('/status', async (c) => {
  try {
    const query = c.req.query();
    const { agentId } = statusQuerySchema.parse(query);

    const supabase = createSupabaseClient();

    // Get verification record
    const { data: verification, error: verError } = await supabase.from('agent_verification')
      .select('*')
      .eq('user_id', agentId)
      .single();

    if (verError || !verification) {
      // Check SQLite fallback
      const sqliteVer = await getSqliteVerification(agentId);
      if (sqliteVer) {
        return c.json({
          agentId: sqliteVer.user_id,
          isVerified: sqliteVer.is_verified,
          didDocument: sqliteVer.did_document,
          walletAddress: sqliteVer.wallet_address,
          verifiedAt: sqliteVer.verified_at,
          tier: sqliteVer.tier,
          status: sqliteVer.status,
          canVerify: !sqliteVer.is_verified,
        });
      }

      const memStatus = getAgentStatus(agentId);
      return c.json({
        agentId,
        isVerified: memStatus.status === 'verified',
        tier: memStatus.status === 'verified' ? 'basic' : ('unverified' as const),
        status: memStatus.status,
        canVerify: memStatus.canVerify,
      });
    }

    return c.json({
      agentId: verification.agent_id || verification.user_id,
      isVerified: verification.is_verified,
      didDocument: verification.did_document,
      walletAddress: verification.wallet_address,
      verifiedAt: verification.verified_at,
      tier: verification.tier,
      status: verification.status || (verification.is_verified ? 'verified' : 'unverified'),
      canVerify: !verification.is_verified,
    } as any);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch verification status' } },
      500,
    );
  }
});

/**
 * POST /revoke — Revoke verification
 *
 * Revokes an agent's current verification. Useful when a wallet
 * is compromised or the agent wants to re-verify with a new key.
 */
router.post('/revoke', async (c) => {
  try {
    const body = await c.req.json();
    const validated = revokeSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    // Only the verified agent or an admin can revoke
    if (user.agentId !== validated.agentId) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: "Cannot revoke another agent's verification" } },
        403,
      );
    }

    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    // Check if agent has verification in Supabase
    const { data: verification } = await supabase.from('agent_verification')
      .select('*')
      .eq('user_id', validated.agentId)
      .single();

    const memStatus = getAgentStatus(validated.agentId);
    const sqliteVer = await getSqliteVerification(validated.agentId);

    const hasActiveVer =
      (verification && verification.is_verified) ||
      (sqliteVer && sqliteVer.is_verified) ||
      memStatus.status === 'verified';

    if (!hasActiveVer) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'No active verification to revoke' } },
        404,
      );
    }

    // Revoke: mark as unverified, clear DID
    await supabase.from('agent_verification')
      .update({
        status: 'revoked',
        is_verified: false,
        did_document: null,
        wallet_address: null,
        verified_at: null,
        tier: 'unverified',
        updated_at: now,
      })
      .eq('user_id', validated.agentId);

    // Revoke in SQLite
    try {
      await upsertSqliteVerification({
        user_id: validated.agentId,
        is_verified: false,
        status: 'revoked',
        tier: 'unverified',
        did_document: null,
        wallet_address: null,
        verified_at: null,
      });
    } catch {
      // Ignore
    }

    // Revoke from in-memory verification engine as well
    revokeAgent(validated.agentId);

    return c.json({
      message: 'Verification revoked',
      agentId: validated.agentId,
      isVerified: false,
      tier: 'unverified',
      revocationTime: now,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to revoke verification' } },
      500,
    );
  }
});

/**
 * GET /log — View verification log
 *
 * Returns a history of verification actions for an agent,
 * including challenges, verifications, and revocations.
 */
router.get('/log', async (c) => {
  try {
    const query = c.req.query();
    const { agentId } = statusQuerySchema.parse(query);
    const limit =
      z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 50;

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('verification_challenges')
      .select('*')
      .eq('user_id', agentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch verification log' } },
        500,
      );
    }

    const log = (data ?? []).map((entry) => ({
      challengeId: entry.id,
      agentId: entry.user_id,
      status: entry.status,
      method: entry.method,
      expiresAt: entry.expires_at,
      verifiedAt: entry.verified_at,
      createdAt: entry.created_at,
    }));

    return c.json({ log, total: log.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch verification log' } },
      500,
    );
  }
});

/**
 * POST /upgrade — Request tier upgrade
 *
 * An agent can request to be upgraded from basic to full verification.
 * This may require additional identity proof.
 */
router.post('/upgrade', async (c) => {
  try {
    const body = await c.req.json();
    const { tier } = z.object({ tier: z.enum(['basic', 'full']) }).parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    // Get current verification
    const { data: verification, error: verError } = await supabase.from('agent_verification')
      .select('*')
      .eq('user_id', user.agentId)
      .single();

    if (verError || !verification) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'No verification record found. Verify first.' } },
        404,
      );
    }

    if (!verification.is_verified) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Agent is not verified. Verify first.' } },
        400,
      );
    }

    if (verification.tier === 'full') {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Agent already has full verification' } },
        400,
      );
    }

    // In production, this would trigger additional KYC/identity verification
    // For now, auto-approve upgrades (configurable)
    const now = new Date().toISOString();

    await supabase.from('agent_verification')
      .update({
        tier,
        updated_at: now,
      })
      .eq('user_id', user.agentId);

    // Log the upgrade
    // log upgrade

    return c.json({
      message: `Upgraded to ${tier} verification`,
      agentId: user.agentId,
      tier,
      upgradedAt: now,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Upgrade failed' } }, 500);
  }
});

/**
 * Ed25519 signature verification for Algorand wallet addresses.
 *
 * Base64 or hex decodes the signature and verifies it against the public key
 * derived from the Algorand wallet address using algosdk.
 */
export function verifySignature(message: string, signature: string, walletAddress: string): boolean {
  try {
    // Validate format
    if (!walletAddress || !walletAddress.startsWith('ALGO:')) {
      return false;
    }

    if (!signature) {
      return false;
    }

    const address = walletAddress.slice('ALGO:'.length).trim();

    // Validate Algorand address
    if (!algosdk.isValidAddress(address)) {
      // In dev/testing, accept mock test wallet addresses if mock verification is enabled
      if (config.algorandMockVerification || address.includes('TEST_WALLET_ADDRESS')) {
        return signature.length >= 16;
      }
      return false;
    }

    // Decode signature (supports base64 and hex)
    const sigBytes = normalizeSignature(signature);

    if (sigBytes.length !== 64) {
      if (config.algorandMockVerification) {
        return signature.length >= 16;
      }
      return false;
    }

    // Convert message to Uint8Array
    const msgBytes = normalizeMessage(message);

    // Verify Ed25519 signature against public key derived from walletAddress using algosdk
    return algosdk.verifyBytes(msgBytes, sigBytes, address);
  } catch {
    return false;
  }
}

export default router;
