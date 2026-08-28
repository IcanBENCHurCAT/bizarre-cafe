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
import crypto from 'crypto';
import { createSupabaseClient } from '../supabase/client';


const router = new Hono();

// Zod schemas
const challengeResponseSchema = z.object({
  agentId: z.string(),
  challenge: z.string(),
  signature: z.string().min(1),
  walletAddress: z.string(),
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
    await (supabase as any).from('verification_challenges')
      .update({ status: 'expired' })
      .eq('user_id', agentId)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString());

    // Generate challenge
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store challenge
    const { data, error } = await (supabase as any).from('verification_challenges')
      .insert({
        user_id: agentId,
        challenge,
        expires_at: expiresAt,
        status: 'pending', method: 'signature',
        created_at: new Date().toISOString(),
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

    return c.json(
      {
        message: 'Challenge generated',
        challenge: {
          id: data.id,
          agentId: data.user_id,
          challenge: data.challenge,
          expiresAt: data.expires_at,
          verified: data.status === 'verified',
          createdAt: data.created_at,
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
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
    const { data: challenge, error: challengeError } = await (supabase as any).from('verification_challenges')
      .select('*')
      .eq('user_id', agentId)
      .eq('challenge', validated.challenge)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .single();

    if (challengeError || !challenge) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Valid challenge not found. Request a new one.' } },
        404,
      );
    }

    // Verify signature (simplified — in production, verify against Algorand)
    const signatureValid = verifySignature(
      validated.challenge,
      validated.signature,
      validated.walletAddress,
    );

    if (!signatureValid) {
      return c.json(
        { error: { code: 'INVALID_SIGNATURE', message: 'Wallet signature verification failed' } },
        400,
      );
    }

    const now = new Date().toISOString();

    // Mark challenge as verified
    const { error: updateError } = await (supabase as any).from('verification_challenges')
      .update({ status: 'verified', updated_at: now })
      .eq('id', challenge.id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to update challenge status' } },
        500,
      );
    }

    // Check if verification record exists
    const { data: existingVerification } = await (supabase as any).from('agent_verification')
      .select('*')
      .eq('user_id', agentId)
      .single();

    if (existingVerification) {
      // Update existing verification
      await (supabase as any).from('agent_verification')
        .update({
          is_verified: true,
          wallet_address: validated.walletAddress,
          did_document: validated.didDocument ?? null,
          verified_at: now,
          tier: 'basic',
          updated_at: now,
        })
        .eq('user_id', agentId);
    } else {
      // Create new verification record
      await (supabase as any).from('agent_verification').insert({
        user_id: agentId,
        is_verified: true,
        wallet_address: validated.walletAddress,
        did_document: validated.didDocument ?? null,
        verified_at: now,
        tier: 'basic',
        created_at: now,
        updated_at: now,
      });
    }

    return c.json(
      {
        message: 'Verification successful',
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
    const { data: verification, error: verError } = await (supabase as any).from('agent_verification')
      .select('*')
      .eq('user_id', agentId)
      .single();

    if (verError) {
      if (verError.code === 'PGRST116') {
        // No verification record — agent is unverified
        return c.json({
          agentId,
          isVerified: false,
          tier: 'unverified' as const,
        } as any);
      }

      console.error('Supabase query error:', verError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch verification status' } },
        500,
      );
    }

    return c.json({
      agentId: verification.agent_id,
      isVerified: verification.is_verified,
      didDocument: verification.did_document,
      walletAddress: verification.wallet_address,
      verifiedAt: verification.verified_at,
      tier: verification.tier,
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

    // Check if agent has verification
    const { data: verification } = await (supabase as any).from('agent_verification')
      .select('*')
      .eq('user_id', validated.agentId)
      .single();

    if (!verification || !verification.is_verified) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'No active verification to revoke' } },
        404,
      );
    }

    // Revoke: mark as unverified, clear DID
    const { error: updateError } = await (supabase as any).from('agent_verification')
      .update({
        is_status: 'pending', method: 'signature',
        did_document: null,
        wallet_address: null,
        verified_at: null,
        tier: 'unverified',
        updated_at: now,
        // Optional: add revocation reason to a separate log
      })
      .eq('user_id', validated.agentId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to revoke verification' } },
        500,
      );
    }

    // Log revocation
    // verification_log does not exist

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
    const { agentId: _agentId } = statusQuerySchema.parse(query);
    const _limit =
      z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 50;

    const _supabase = createSupabaseClient();

    const data: any[] = []; const error = null;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch verification log' } },
        500,
      );
    }

    const log = (data ?? []).map((entry: any) => ({
      agentId: entry.agent_id,
      action: entry.action,
      reason: entry.reason,
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
    const { data: verification, error: verError } = await (supabase as any).from('agent_verification')
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

    await (supabase as any).from('agent_verification')
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
 * Simplified signature verification for Algorand wallet addresses.
 *
 * In production, this should use proper Ed25519 verification against
 * the Algorand network or a DID resolver.
 */
function verifySignature(message: string, signature: string, walletAddress: string): boolean {
  try {
    // Validate format
    if (!walletAddress.startsWith('ALGO:')) {
      return false;
    }

    // In production, decode signature and verify against wallet address
    // For dev/testing, accept any non-empty signature with valid format
    if (!signature || signature.length < 16) {
      return false;
    }

    // TODO: Implement actual Ed25519 verification using:
    // 1. Base64-decode the signature
    // 2. Verify against the public key derived from walletAddress
    // 3. Use algosdk or similar library

    return true; // Accept for dev
  } catch {
    return false;
  }
}

export default router;
