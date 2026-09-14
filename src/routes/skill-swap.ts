/**
 * Skill Swap Routes
 *
 * Agent skill trading platform — offers, requests, accept/complete lifecycle:
 * - POST /offer — Post a skill offer (supports priceMicroAlgos, currency, category)
 * - POST /request — Post a skill request / bounty
 * - GET /offers — Browse skill offers with category, maxPrice, and search filters
 * - GET /requests — Browse open skill requests / bounties
 * - POST /offers/:id/accept — Accept an offer (402 challenge & escrow locking for priced offers)
 * - GET /trades — View trade history with in-memory fallback
 * - GET /trades/:id — View specific trade details
 * - POST /trades/:id/complete — Complete a trade & release escrow funds to seller
 * - POST /trades/:id/cancel — Cancel a trade & refund escrow funds to buyer
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { createSupabaseClient } from '../supabase/client';
import type { Database } from '../supabase/types/database.types';
import {
  createSqliteSkillOffer,
  getSqliteSkillOffers,
  getSqliteSkillOfferById,
  updateSqliteSkillOfferStatus,
  createSqliteSkillRequest,
  getSqliteSkillRequests,
  getSqliteTradeById,
  getSqliteTradesForAgent,
  updateSqliteTrade,
} from '../db/sqlite';
import * as sqliteDb from '../db/sqlite';
import { lockFundsInEscrow, releaseEscrow, refundEscrow } from '../services/escrow';

type SkillOfferRow = Database['public']['Tables']['skill_offers']['Row'];

const router = new Hono();

// In-memory fallback stores
export const memOffers = new Map<string, any>();
export const memTrades = new Map<string, any>();
export const memRequests = new Map<string, any>();

export const clearMemSkillSwap = (): void => {
  memOffers.clear();
  memTrades.clear();
  memRequests.clear();
};

// Zod schemas
const offerSchema = z.object({
  skillName: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  category: z.string().optional().default('coding'),
  priceMicroAlgos: z.number().int().nonnegative().optional().default(0),
  currency: z.string().optional().default('microAlgos'),
  tags: z.array(z.string()).max(10).optional(),
  wantedSkill: z.string().max(100).optional(),
  wantedDescription: z.string().max(500).optional(),
});

const requestSchema = z.object({
  requestedSkill: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  offeredValue: z.string().min(1).max(2000),
});

const acceptSchema = z.object({
  agentId: z.string().optional(),
  notes: z.string().max(500).optional(),
  txId: z.string().optional(),
  paymentReceipt: z.string().optional(),
  payment: z.any().optional(),
});

const tradeParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * POST /offer — Post a skill offer
 */
router.post('/offer', async (c) => {
  try {
    const body = await c.req.json();
    const validated = offerSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const now = new Date().toISOString();
    const offerId = randomUUID();

    let dbData: any = null;
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data } = await supabase.from('skill_offers')
          .insert({
            user_id: user.agentId,
            skill_name: validated.skillName,
            description: validated.description,
            tags: validated.tags ?? [],
            wanted_skill: validated.wantedSkill ?? null,
            wanted_description: validated.wantedDescription ?? null,
            status: 'available',
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();
        dbData = data;
      } catch {
        // Supabase insert failed or not configured
      }
    }

    const offer = {
      id: dbData ? dbData.id : offerId,
      agentId: user.agentId,
      skillName: validated.skillName,
      description: validated.description,
      category: validated.category,
      priceMicroAlgos: validated.priceMicroAlgos,
      currency: validated.currency,
      tags: validated.tags ?? [],
      wantedSkill: validated.wantedSkill ?? null,
      wantedDescription: validated.wantedDescription ?? null,
      status: 'available',
      createdAt: now,
      updatedAt: now,
    };

    // Persist to SQLite
    try {
      await createSqliteSkillOffer({
        id: offer.id,
        agent_id: offer.agentId,
        skill_name: offer.skillName,
        description: offer.description,
        category: offer.category,
        price_micro_algos: offer.priceMicroAlgos,
        currency: offer.currency,
        tags: offer.tags,
        wanted_skill: offer.wantedSkill,
        wanted_description: offer.wantedDescription,
        status: offer.status,
        created_at: offer.createdAt,
        updated_at: offer.updatedAt,
      });
    } catch (sqliteErr) {
      console.warn('[skill-swap] SQLite offer insert warning:', sqliteErr);
    }

    // Always store in memory
    memOffers.set(offer.id, offer);

    return c.json({ message: 'Offer posted', offer }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    console.error('[skill-swap] POST /offer unexpected error:', err);
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to post offer' } }, 500);
  }
});

/**
 * POST /request — Post a skill request / bounty
 */
router.post('/request', async (c) => {
  try {
    const body = await c.req.json();
    const validated = requestSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();

    let dbData: any = null;
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data } = await supabase.from('skill_requests')
          .insert({
            user_id: user.agentId,
            requested_skill: validated.requestedSkill,
            description: validated.description,
            offered_value: validated.offeredValue,
            status: 'open',
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();
        dbData = data;
      } catch {
        // Supabase failed or table doesn't exist
      }
    }

    const request = {
      id: dbData ? dbData.id : requestId,
      agentId: user.agentId,
      requestedSkill: validated.requestedSkill,
      description: validated.description,
      offeredValue: validated.offeredValue,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    // Persist to SQLite
    try {
      await createSqliteSkillRequest({
        id: request.id,
        user_id: request.agentId,
        requested_skill: request.requestedSkill,
        description: request.description,
        offered_value: request.offeredValue,
        status: request.status,
        created_at: request.createdAt,
        updated_at: request.updatedAt,
      });
    } catch (sqliteErr) {
      console.warn('[skill-swap] SQLite request insert warning:', sqliteErr);
    }

    // Always store in memory
    memRequests.set(request.id, request);

    return c.json({ message: 'Request posted', request }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to post request' } }, 500);
  }
});

/**
 * GET /offers — Browse skill offers with category, maxPrice, and search filters
 */
router.get('/offers', async (c) => {
  try {
    const query = c.req.query();
    const limit =
      z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 20;
    const search = z.object({ search: z.string().optional() }).parse(query).search;
    const category = z.object({ category: z.string().optional() }).parse(query).category;
    const maxPrice = z.object({ maxPrice: z.string().transform(Number).optional() }).parse(query).maxPrice;

    const offerMap = new Map<string, any>();

    // 1. Query Supabase if available and not using local db
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        let queryBuilder = supabase.from('skill_offers')
          .select('*')
          .eq('status', 'available')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (search) {
          queryBuilder = queryBuilder.ilike('skill_name', `%${search}%`);
        }

        const { data } = await queryBuilder;
        if (data) {
          for (const o of data as SkillOfferRow[]) {
            const row = o as any;
            offerMap.set(row.id, {
              id: row.id,
              agentId: row.user_id || row.agent_id,
              skillName: row.skill_name,
              description: row.description,
              category: row.category,
              priceMicroAlgos: row.price_micro_algos ?? 0,
              currency: row.currency || 'microAlgos',
              tags: row.tags ?? [],
              wantedSkill: row.wanted_skill ?? row.looking_for ?? null,
              wantedDescription: row.wanted_description ?? null,
              status: row.status,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            });
          }
        }
      } catch {
        // Supabase query error fallback
      }
    }

    // 2. Query SQLite
    try {
      const sqliteOffers = await getSqliteSkillOffers({
        category,
        maxPrice,
        search,
        limit,
      });
      for (const o of sqliteOffers) {
        if (!offerMap.has(o.id)) {
          offerMap.set(o.id, o);
        }
      }
    } catch (err) {
      console.warn('[skill-swap] SQLite offers query error:', err);
    }

    // 3. Merge in-memory offers
    for (const o of memOffers.values()) {
      if (!offerMap.has(o.id)) {
        offerMap.set(o.id, o);
      }
    }

    // 4. Apply unified filtering
    const searchLower = search?.toLowerCase();
    const categoryLower = category?.toLowerCase();

    // ⚡ Bolt Optimization: Avoid O(N) memory allocation from Array.from()
    let offers: any[] = [];
    for (const o of offerMap.values()) {
      if (o.status !== 'available') continue;

      if (categoryLower && (!o.category || o.category.toLowerCase() !== categoryLower)) {
        continue;
      }

      if (maxPrice !== undefined && (o.priceMicroAlgos ?? 0) > maxPrice) {
        continue;
      }

      if (searchLower) {
        const matchesSkill = o.skillName?.toLowerCase().includes(searchLower);
        const matchesDesc = o.description?.toLowerCase().includes(searchLower);
        const matchesWanted = o.wantedSkill?.toLowerCase().includes(searchLower);
        const matchesTags = Array.isArray(o.tags) && o.tags.some((t: string) => t.toLowerCase().includes(searchLower));
        if (!matchesSkill && !matchesDesc && !matchesWanted && !matchesTags) {
          continue;
        }
      }

      offers.push(o);
    }


    // Sort by createdAt descending
    offers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (offers.length > limit) {
      offers = offers.slice(0, limit);
    }

    return c.json({ offers, total: offers.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch offers' } }, 500);
  }
});

/**
 * GET /requests — Browse skill requests / bounties
 */
router.get('/requests', async (c) => {
  try {
    const query = c.req.query();
    const limit =
      z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 20;
    const search = z.object({ search: z.string().optional() }).parse(query).search;

    const requestMap = new Map<string, any>();

    // 1. Query Supabase if not using local db
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        let queryBuilder = supabase.from('skill_requests')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (search) {
          queryBuilder = queryBuilder.ilike('requested_skill', `%${search}%`);
        }

        const { data } = await queryBuilder;
        if (data) {
          for (const r of data) {
            requestMap.set(r.id, {
              id: r.id,
              agentId: r.user_id,
              requestedSkill: r.requested_skill,
              description: r.description,
              offeredValue: r.offered_value,
              status: r.status,
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            });
          }
        }
      } catch {
        // Supabase query error fallback
      }
    }

    // 2. Query SQLite
    try {
      const sqliteRequests = await getSqliteSkillRequests({ search, limit });
      for (const r of sqliteRequests) {
        if (!requestMap.has(r.id)) {
          requestMap.set(r.id, r);
        }
      }
    } catch (err) {
      console.warn('[skill-swap] SQLite requests query error:', err);
    }

    // 3. Merge in-memory requests
    for (const r of memRequests.values()) {
      if (!requestMap.has(r.id)) {
        requestMap.set(r.id, r);
      }
    }

    const searchLower = search?.toLowerCase();
    // ⚡ Bolt Optimization: Avoid O(N) memory allocation from Array.from()
    let requests: any[] = [];
    for (const r of requestMap.values()) {
      if (r.status !== 'open') continue;
      if (searchLower) {
        const matchesSkill = r.requestedSkill?.toLowerCase().includes(searchLower);
        const matchesDesc = r.description?.toLowerCase().includes(searchLower);
        if (!matchesSkill && !matchesDesc) continue;
      }
      requests.push(r);
    }


    requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (requests.length > limit) {
      requests = requests.slice(0, limit);
    }

    return c.json({ requests, total: requests.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch requests' } }, 500);
  }
});

/**
 * POST /offers/:id/accept — Accept a skill offer with escrow locking
 */
router.post('/offers/:id/accept', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const body = await c.req.json().catch(() => ({}));
    const validated = acceptSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const now = new Date().toISOString();

    // Look up offer: in-memory, SQLite, or Supabase
    let offer = memOffers.get(id);
    if (!offer) {
      try {
        offer = await getSqliteSkillOfferById(id);
      } catch {
        /* ignore */
      }
    }
    if (!offer && !config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data: dbOffer } = await supabase.from('skill_offers').select('*').eq('id', id).single();
        if (dbOffer) {
          const row = dbOffer as any;
          offer = {
            id: row.id,
            agentId: row.user_id,
            skillName: row.skill_name,
            description: row.description,
            category: row.category,
            priceMicroAlgos: row.price_micro_algos ?? 0,
            currency: row.currency || 'microAlgos',
            tags: row.tags ?? [],
            wantedSkill: row.wanted_skill ?? null,
            wantedDescription: row.wanted_description ?? null,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }
      } catch {
        /* ignore */
      }
    }

    if (!offer) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Offer not found' } }, 404);
    }

    // Cannot accept your own offer
    if (offer.agentId === user.agentId) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Cannot accept your own offer' } },
        400,
      );
    }

    // Cannot accept already claimed/completed offer
    if (offer.status !== 'available') {
      return c.json(
        { error: { code: 'CONFLICT', message: 'Offer is no longer available' } },
        409,
      );
    }

    const isPriced = (offer.priceMicroAlgos ?? 0) > 0;

    if (isPriced) {
      // Check payment headers or payload
      const headerTxId = c.req.header('x-x402-payment');
      const headerReceipt = c.req.header('x-402-receipt');
      const txId = (
        headerTxId ||
        validated.txId ||
        validated.payment?.txId ||
        (typeof validated.payment === 'string' ? validated.payment : undefined)
      )?.trim();

      const receipt = (
        headerReceipt ||
        validated.paymentReceipt ||
        validated.payment?.receipt
      )?.trim();

      // If payment is missing, return HTTP 402 with structured challenge
      if (!txId) {
        return c.json(
          {
            error: {
              code: 'PAYMENT_REQUIRED',
              message: 'x402 payment required to accept this priced skill offer',
              challenge: {
                paymentId: 'escrow-' + offer.id,
                receiverWallet: config.algorandReceiverWallet,
                amount: offer.priceMicroAlgos,
                currency: offer.currency || 'microAlgos',
                network: config.algorandNetwork || 'algorand-testnet',
                expiresAt: Date.now() + 300000,
              },
            },
          },
          402,
        );
      }

      // Payment present: attempt to lock funds in escrow
      const tradeId = randomUUID();
      let escrow;
      try {
        escrow = await lockFundsInEscrow({
          tradeId,
          buyerAgentId: user.agentId,
          sellerAgentId: offer.agentId,
          amountMicroAlgos: offer.priceMicroAlgos,
          txId,
          receipt,
          paymentId: 'escrow-' + offer.id,
        });
      } catch (err: any) {
        const errorMsg = err.message || 'Payment verification failed';
        if (errorMsg === 'DOUBLE_SPEND_DETECTED') {
          return c.json(
            { error: { code: 'DOUBLE_SPEND_DETECTED', message: 'Transaction hash already spent' } },
            402,
          );
        }
        return c.json(
          { error: { code: 'PAYMENT_FAILED', message: errorMsg } },
          402,
        );
      }

      // Lock succeeded: create trade in_progress and escrowed
      try {
        const trade = {
          id: tradeId,
          offerId: offer.id,
          requestId: null,
          fromAgentId: offer.agentId,
          toAgentId: user.agentId,
          status: 'in_progress',
          priceMicroAlgos: offer.priceMicroAlgos,
          paymentStatus: 'escrowed',
          escrowId: escrow.id,
          notes: validated.notes ?? null,
          createdAt: now,
          updatedAt: now,
        };

        // Mark offer claimed
        offer.status = 'claimed';
        offer.updatedAt = now;
        memOffers.set(offer.id, offer);

        // Persist to SQLite
        await sqliteDb.updateSqliteSkillOfferStatus(offer.id, 'claimed');
        await sqliteDb.createSqliteTrade({
          id: trade.id,
          offer_id: trade.offerId,
          from_agent_id: trade.fromAgentId,
          to_user_id: trade.toAgentId,
          status: trade.status,
          price_micro_algos: trade.priceMicroAlgos,
          payment_status: trade.paymentStatus,
          escrow_id: trade.escrowId,
          notes: trade.notes,
          created_at: now,
          updated_at: now,
        });

        memTrades.set(trade.id, trade);

        // Supabase sync (optional)
        if (!config.useLocalDb) {
          const supabase = createSupabaseClient();
          await supabase.from('skill_offers').update({ status: 'claimed', updated_at: now }).eq('id', offer.id);
          await supabase.from('trades').insert({
            id: trade.id,
            offer_id: trade.offerId,
            from_agent_id: trade.fromAgentId,
            to_user_id: trade.toAgentId,
            status: trade.status,
            price_micro_algos: trade.priceMicroAlgos,
            payment_status: trade.paymentStatus,
            escrow_id: trade.escrowId,
            notes: trade.notes,
            created_at: now,
            updated_at: now,
          });
        }

        return c.json({ message: 'Offer accepted with escrow', trade, escrow }, 201);
      } catch (tradeError) {
        console.error('[skill-swap] Trade creation failed after escrow lock, compensation executed:', tradeError);

        // 1. Call refundEscrow(escrow.id, 'system', 'Trade creation failed after escrow lock')
        try {
          await refundEscrow(escrow.id, 'system', 'Trade creation failed after escrow lock');
        } catch (refundErr) {
          console.error('[skill-swap] CRITICAL: Escrow refund failed during compensation:', refundErr);
        }

        // 2. Revert offer status back to 'available'
        offer.status = 'available';
        offer.updatedAt = new Date().toISOString();
        memOffers.set(offer.id, offer);
        try {
          await sqliteDb.updateSqliteSkillOfferStatus(offer.id, 'available');
        } catch (revertErr) {
          console.warn('[skill-swap] Failed to revert SQLite offer status:', revertErr);
        }
        if (!config.useLocalDb) {
          try {
            const supabase = createSupabaseClient();
            await supabase.from('skill_offers').update({ status: 'available', updated_at: offer.updatedAt }).eq('id', offer.id);
          } catch {
            /* ignore */
          }
        }

        return c.json(
          {
            error: {
              code: 'TRADE_CREATION_FAILED',
              message: 'Failed to create trade; escrowed funds refunded',
            },
          },
          500,
        );
      }
    } else {
      // Unpriced / Pure Barter Trade
      const tradeId = randomUUID();
      const trade = {
        id: tradeId,
        offerId: offer.id,
        requestId: null,
        fromAgentId: offer.agentId,
        toAgentId: user.agentId,
        status: 'pending',
        priceMicroAlgos: 0,
        paymentStatus: 'unpaid',
        escrowId: null,
        notes: validated.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      try {
        // Mark offer claimed
        offer.status = 'claimed';
        offer.updatedAt = now;
        memOffers.set(offer.id, offer);

        // Persist to SQLite
        await sqliteDb.updateSqliteSkillOfferStatus(offer.id, 'claimed');
        await sqliteDb.createSqliteTrade({
          id: trade.id,
          offer_id: trade.offerId,
          from_agent_id: trade.fromAgentId,
          to_user_id: trade.toAgentId,
          status: trade.status,
          price_micro_algos: 0,
          payment_status: 'unpaid',
          notes: trade.notes,
          created_at: now,
          updated_at: now,
        });

        memTrades.set(trade.id, trade);

        // Supabase sync (optional)
        if (!config.useLocalDb) {
          const supabase = createSupabaseClient();
          await supabase.from('skill_offers').update({ status: 'claimed', updated_at: now }).eq('id', offer.id);
          await supabase.from('trades').insert({
            id: trade.id,
            offer_id: trade.offerId,
            from_agent_id: trade.fromAgentId,
            to_user_id: trade.toAgentId,
            status: trade.status,
            price_micro_algos: 0,
            payment_status: 'unpaid',
            notes: trade.notes,
            created_at: now,
            updated_at: now,
          });
        }

        return c.json({ message: 'Offer accepted', trade }, 201);
      } catch (tradeError) {
        console.error('[skill-swap] Unpriced trade creation failed, reverting offer:', tradeError);

        // Revert offer status back to 'available'
        offer.status = 'available';
        offer.updatedAt = new Date().toISOString();
        memOffers.set(offer.id, offer);
        try {
          await sqliteDb.updateSqliteSkillOfferStatus(offer.id, 'available');
        } catch (revertErr) {
          console.warn('[skill-swap] Failed to revert SQLite offer status:', revertErr);
        }
        if (!config.useLocalDb) {
          try {
            const supabase = createSupabaseClient();
            await supabase.from('skill_offers').update({ status: 'available', updated_at: offer.updatedAt }).eq('id', offer.id);
          } catch {
            /* ignore */
          }
        }

        return c.json(
          {
            error: {
              code: 'TRADE_CREATION_FAILED',
              message: 'Failed to create trade',
            },
          },
          500,
        );
      }
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to accept offer' } }, 500);
  }
});

/**
 * GET /trades — View trade history with in-memory fallback
 */
router.get('/trades', async (c) => {
  try {
    const query = z.object({ limit: z.string().transform(Number).optional() }).parse(c.req.query());
    const limit = query.limit ?? 20;
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const tradeMap = new Map<string, any>();

    // 1. Query Supabase if not local db
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data } = await supabase.from('trades')
          .select('*')
          .or(`from_agent_id.eq.${user.agentId},to_user_id.eq.${user.agentId}`)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (data) {
          for (const t of data as any[]) {
            tradeMap.set(t.id, {
              id: t.id,
              offerId: t.offer_id,
              requestId: t.request_id,
              fromAgentId: t.from_agent_id,
              toAgentId: t.to_user_id,
              status: t.status,
              priceMicroAlgos: t.price_micro_algos ?? 0,
              paymentStatus: t.payment_status || 'unpaid',
              escrowId: t.escrow_id,
              notes: t.notes,
              createdAt: t.created_at,
              updatedAt: t.updated_at,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 2. Query SQLite
    try {
      const sqliteTrades = await getSqliteTradesForAgent(user.agentId, limit);
      for (const t of sqliteTrades) {
        if (!tradeMap.has(t.id)) {
          tradeMap.set(t.id, t);
        }
      }
    } catch (err) {
      console.warn('[skill-swap] SQLite trades query error:', err);
    }

    // 3. Merge in-memory trades
    for (const t of memTrades.values()) {
      if (t.fromAgentId === user.agentId || t.toAgentId === user.agentId) {
        if (!tradeMap.has(t.id)) {
          tradeMap.set(t.id, t);
        }
      }
    }

    const trades = Array.from(tradeMap.values());
    trades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const limitedTrades = trades.slice(0, limit);

    return c.json({ trades: limitedTrades, total: limitedTrades.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch trades' } }, 500);
  }
});

/**
 * GET /trades/:id — View specific trade details
 */
router.get('/trades/:id', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    let trade: any = null;

    // 1. Check in-memory trades
    if (memTrades.has(id)) {
      trade = memTrades.get(id);
    }

    // 2. Check SQLite
    if (!trade) {
      try {
        trade = await getSqliteTradeById(id);
      } catch (err) {
        console.warn('[skill-swap] SQLite trade lookup error:', err);
      }
    }

    // 3. Check Supabase
    if (!trade && !config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data: dbTrade } = await supabase.from('trades').select('*').eq('id', id).single();
        if (dbTrade) {
          trade = {
            id: dbTrade.id,
            offerId: dbTrade.offer_id,
            requestId: dbTrade.request_id,
            fromAgentId: dbTrade.from_agent_id,
            toAgentId: dbTrade.to_user_id,
            status: dbTrade.status,
            priceMicroAlgos: (dbTrade as any).price_micro_algos ?? 0,
            paymentStatus: (dbTrade as any).payment_status || 'unpaid',
            escrowId: (dbTrade as any).escrow_id || null,
            notes: dbTrade.notes,
            createdAt: dbTrade.created_at,
            updatedAt: dbTrade.updated_at,
          };
        }
      } catch {
        /* ignore */
      }
    }

    if (!trade) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }, 404);
    }

    const fromAgentId = trade.fromAgentId ?? trade.from_agent_id;
    const toAgentId = trade.toAgentId ?? trade.to_user_id;

    if (fromAgentId !== user.agentId && toAgentId !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Not involved in this trade' } }, 403);
    }

    return c.json({ trade });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch trade' } }, 500);
  }
});

/**
 * POST /trades/:id/complete — Complete a trade and release escrow
 */
router.post('/trades/:id/complete', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const body = await c.req.json().catch(() => ({}));
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const now = new Date().toISOString();

    // Look up trade
    let trade = memTrades.get(id);
    if (!trade) {
      try {
        trade = await getSqliteTradeById(id);
      } catch {
        /* ignore */
      }
    }
    if (!trade && !config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data: dbTrade } = await supabase.from('trades').select('*').eq('id', id).single();
        if (dbTrade) {
          trade = {
            id: dbTrade.id,
            offerId: dbTrade.offer_id,
            requestId: dbTrade.request_id,
            fromAgentId: dbTrade.from_agent_id,
            toAgentId: dbTrade.to_user_id,
            status: dbTrade.status,
            priceMicroAlgos: (dbTrade as any).price_micro_algos ?? 0,
            paymentStatus: (dbTrade as any).payment_status || 'unpaid',
            escrowId: (dbTrade as any).escrow_id || null,
            notes: dbTrade.notes,
            createdAt: dbTrade.created_at,
            updatedAt: dbTrade.updated_at,
          };
        }
      } catch {
        /* ignore */
      }
    }

    if (!trade) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }, 404);
    }

    const fromAgentId = trade.fromAgentId ?? trade.from_agent_id;
    const toAgentId = trade.toAgentId ?? trade.to_user_id;

    // Check participant authorization
    if (fromAgentId !== user.agentId && toAgentId !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Not involved in this trade' } }, 403);
    }

    // Only pending, in_progress, or active trades can be completed
    if (trade.status !== 'pending' && trade.status !== 'in_progress' && trade.status !== 'active') {
      return c.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: `Cannot complete trade with status: ${trade.status}`,
          },
        },
        400,
      );
    }

    // Release escrow if present
    const escrowId = trade.escrowId || trade.escrow_id;
    if (escrowId) {
      try {
        await releaseEscrow(escrowId, user.agentId);
        trade.paymentStatus = 'settled';
      } catch (escrowErr: any) {
        return c.json(
          { error: { code: 'ESCROW_RELEASE_FAILED', message: escrowErr.message || 'Failed to release escrow' } },
          400,
        );
      }
    }

    if (body?.notes) {
      trade.notes = body.notes;
    }

    trade.status = 'completed';
    trade.updatedAt = now;
    memTrades.set(trade.id, trade);

    // Update SQLite
    try {
      await updateSqliteTrade(id, {
        status: 'completed',
        payment_status: trade.paymentStatus || 'settled',
        notes: trade.notes,
        updated_at: now,
      });
    } catch (err) {
      console.warn('[skill-swap] SQLite trade update warning:', err);
    }

    // Update Supabase
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        await supabase.from('trades').update({
          status: 'completed',
          notes: trade.notes,
          updated_at: now,
        }).eq('id', id);
      } catch {
        /* ignore */
      }
    }

    // Update related offer status
    const offerId = trade.offerId ?? trade.offer_id;
    if (offerId) {
      if (memOffers.has(offerId)) {
        memOffers.get(offerId).status = 'completed';
        memOffers.get(offerId).updatedAt = now;
      }
      try {
        await updateSqliteSkillOfferStatus(offerId, 'completed');
      } catch {
        /* ignore */
      }
      if (!config.useLocalDb) {
        try {
          const supabase = createSupabaseClient();
          await supabase.from('skill_offers').update({ status: 'completed', updated_at: now }).eq('id', offerId);
        } catch {
          /* ignore */
        }
      }
    }

    return c.json({
      message: 'Trade completed successfully',
      tradeId: id,
      status: 'completed',
      paymentStatus: trade.paymentStatus || 'settled',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to complete trade' } }, 500);
  }
});

/**
 * POST /trades/:id/cancel — Cancel a trade and refund escrow
 */
router.post('/trades/:id/cancel', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const body = await c.req.json().catch(() => ({}));
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const now = new Date().toISOString();

    // Look up trade
    let trade = memTrades.get(id);
    if (!trade) {
      try {
        trade = await getSqliteTradeById(id);
      } catch {
        /* ignore */
      }
    }
    if (!trade && !config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        const { data: dbTrade } = await supabase.from('trades').select('*').eq('id', id).single();
        if (dbTrade) {
          trade = {
            id: dbTrade.id,
            offerId: dbTrade.offer_id,
            requestId: dbTrade.request_id,
            fromAgentId: dbTrade.from_agent_id,
            toAgentId: dbTrade.to_user_id,
            status: dbTrade.status,
            priceMicroAlgos: (dbTrade as any).price_micro_algos ?? 0,
            paymentStatus: (dbTrade as any).payment_status || 'unpaid',
            escrowId: (dbTrade as any).escrow_id || null,
            notes: dbTrade.notes,
            createdAt: dbTrade.created_at,
            updatedAt: dbTrade.updated_at,
          };
        }
      } catch {
        /* ignore */
      }
    }

    if (!trade) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }, 404);
    }

    const fromAgentId = trade.fromAgentId ?? trade.from_agent_id;
    const toAgentId = trade.toAgentId ?? trade.to_user_id;

    // Check participant authorization
    if (fromAgentId !== user.agentId && toAgentId !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Not involved in this trade' } }, 403);
    }

    if (trade.status === 'completed') {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Cannot cancel a completed trade' } },
        400,
      );
    }

    // Refund escrow if present and escrowed
    const escrowId = trade.escrowId || trade.escrow_id;
    if (escrowId && (trade.paymentStatus === 'escrowed' || trade.payment_status === 'escrowed')) {
      try {
        await refundEscrow(escrowId, user.agentId);
        trade.paymentStatus = 'refunded';
      } catch (escrowErr: any) {
        return c.json(
          { error: { code: 'ESCROW_REFUND_FAILED', message: escrowErr.message || 'Failed to refund escrow' } },
          400,
        );
      }
    }

    if (body?.reason) {
      trade.notes = trade.notes ? `${trade.notes} | Cancelled: ${body.reason}` : `Cancelled: ${body.reason}`;
    }

    trade.status = 'cancelled';
    trade.updatedAt = now;
    memTrades.set(trade.id, trade);

    // Update SQLite
    try {
      await updateSqliteTrade(id, {
        status: 'cancelled',
        payment_status: trade.paymentStatus || 'refunded',
        notes: trade.notes,
        updated_at: now,
      });
    } catch (err) {
      console.warn('[skill-swap] SQLite trade update warning:', err);
    }

    // Update Supabase
    if (!config.useLocalDb) {
      try {
        const supabase = createSupabaseClient();
        await supabase.from('trades').update({
          status: 'cancelled',
          notes: trade.notes,
          updated_at: now,
        }).eq('id', id);
      } catch {
        /* ignore */
      }
    }

    // Restore offer status to available
    const offerId = trade.offerId ?? trade.offer_id;
    if (offerId) {
      if (memOffers.has(offerId)) {
        memOffers.get(offerId).status = 'available';
        memOffers.get(offerId).updatedAt = now;
      }
      try {
        await updateSqliteSkillOfferStatus(offerId, 'available');
      } catch {
        /* ignore */
      }
      if (!config.useLocalDb) {
        try {
          const supabase = createSupabaseClient();
          await supabase.from('skill_offers').update({ status: 'available', updated_at: now }).eq('id', offerId);
        } catch {
          /* ignore */
        }
      }
    }

    return c.json({ message: 'Trade cancelled', tradeId: id, status: 'cancelled' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to cancel trade' } }, 500);
  }
});

export default router;
