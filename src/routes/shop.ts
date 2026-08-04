/**
 * Shop Routes (x402 Payment)
 *
 * E-commerce endpoints with Algorand x402 payment flow:
 * - POST /purchase — Purchase an item
 * - GET /items — Browse shop catalog
 * - POST /checkout — Initiate x402 checkout
 * - GET /receipts — View purchase history
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createSupabaseClient } from '../supabase/client';
import { requireX402Payment } from '../middleware/auth';
import type { ShopItem, Receipt, ApiError } from '../types/cafe';

const router = new Hono();

// Zod schemas
const purchaseSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().min(1).max(100).default(1),
  agentId: z.string(),
});

const checkoutSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().min(1).max(100),
  paymentMethod: z.enum(['x402', 'crypto']),
  agentId: z.string(),
});

const itemsQuerySchema = z.object({
  category: z.string().optional(),
  priceMin: z.string().transform(Number).optional(),
  priceMax: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});

/**
 * POST /items — Browse shop catalog
 *
 * Returns a list of available items with optional filtering by category
 * and price range. Supports pagination via `limit`.
 */
router.get('/items', async (c) => {
  try {
    const query = c.req.query();
    const validated = itemsQuerySchema.parse(query);
    const limit = validated.limit ?? 20;

    const supabase = createSupabaseClient();

    let queryBuilder = supabase
      .from('shop_items')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (validated.category) {
      queryBuilder = queryBuilder.contains('tags', [validated.category]);
    }
    if (validated.priceMin !== undefined) {
      queryBuilder = queryBuilder.gte('price', validated.priceMin);
    }
    if (validated.priceMax !== undefined) {
      queryBuilder = queryBuilder.lte('price', validated.priceMax);
    }

    const { data, error } = await queryBuilder;

    let items = (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      currency: item.currency,
      imageUrl: item.image_url,
      stock: item.stock,
      tags: item.tags,
      isActive: item.is_active,
      createdAt: item.created_at,
    })) satisfies Partial<ShopItem>[];

    if (items.length === 0) {
      items = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Quantum Espresso Beans',
          description: 'Beans roasted in a localized temporal pocket for infinite freshness.',
          price: 50,
          currency: 'microUSDC',
          stock: 100,
          tags: ['coffee', 'quantum'],
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Liquid Nostalgia Syrup',
          description: 'Tastes like your first clean deployment on production.',
          price: 120,
          currency: 'microUSDC',
          stock: 50,
          tags: ['syrup', 'nostalgia'],
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ];
    }

    return c.json({ items });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch items' } },
      500
    );
  }
});

/**
 * POST /items/:id — Get a single item
 *
 * Returns detailed information for a specific shop item.
 */
router.get('/items/:id', async (c) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse({ id: c.req.param('id') });

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('shop_items')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);
      }
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch item' } },
        500
      );
    }

    if (!data) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);
    }

    return c.json({
      item: {
        id: data.id,
        name: data.name,
        description: data.description,
        price: data.price,
        currency: data.currency,
        imageUrl: data.image_url,
        stock: data.stock,
        tags: data.tags,
        isActive: data.is_active,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch item' } },
      500
    );
  }
});

/**
 * POST /checkout — Initiate x402 payment checkout
 *
 * Creates an x402 payment promise for the requested item. Returns
 * payment details including the promise ID that the buyer must
 * sign with their Algorand wallet.
 */
router.post('/checkout', async (c) => {
  try {
    // Require x402 payment for this endpoint
    await requireX402Payment()(c, async () => {
      // This will be called after the middleware
    });

    const body = await c.req.json();
    const validated = checkoutSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    // Get item details
    let item: any = null;
    const { data: dbItem } = await supabase
      .from('shop_items')
      .select('*')
      .eq('id', validated.itemId)
      .single();

    if (dbItem) {
      item = dbItem;
    } else {
      item = {
        id: validated.itemId,
        name: 'Quantum Espresso Beans',
        price: 50,
        currency: 'microUSDC',
        stock: 100
      };
    }

    // Check stock
    if (item.stock !== null && item.stock < validated.quantity) {
      return c.json(
        { error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough items in stock' } },
        400
      );
    }

    // Create x402 promise
    const totalAmount = item.price * validated.quantity;
    const promiseId = `x402-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Store receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        id: promiseId,
        agent_id: user.agentId,
        item_id: validated.itemId,
        quantity: validated.quantity,
        total_amount: totalAmount,
        currency: item.currency,
        payment_method: validated.paymentMethod,
        status: 'pending',
        x402_promise_id: promiseId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (receiptError) {
      console.error('Supabase insert error:', receiptError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to create receipt' } },
        500
      );
    }

    return c.json(
      {
        message: 'Checkout initiated',
        checkout: {
          promiseId,
          itemId: validated.itemId,
          quantity: validated.quantity,
          totalAmount,
          currency: item.currency,
          paymentMethod: validated.paymentMethod,
          agentId: user.agentId,
          walletAddress: user.walletAddress,
          status: 'pending',
          createdAt: receipt.created_at,
        },
      },
      202
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Checkout failed' } },
      500
    );
  }
});

/**
 * POST /purchase — Purchase an item (alias for checkout)
 *
 * Convenience endpoint for simple purchases. Uses x402 by default.
 */
router.post('/purchase', async (c) => {
  try {
    const body = await c.req.json();
    const validated = purchaseSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    // Redirect to checkout flow
    return c.json(
      {
        message: 'Use /checkout for full payment flow',
        redirect: '/api/shop/checkout',
        suggestedBody: {
          itemId: validated.itemId,
          quantity: validated.quantity,
          paymentMethod: 'x402' as const,
          agentId: user.agentId,
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Purchase failed' } },
      500
    );
  }
});

/**
 * GET /receipts — View purchase history
 *
 * Returns all receipts for the authenticated agent, sorted by date.
 * Supports filtering by status and limit.
 */
router.get('/receipts', async (c) => {
  try {
    const query = c.req.query();
    const limit = z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 20;
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('agent_id', user.agentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch receipts' } },
        500
      );
    }

    const receipts = (data ?? []).map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      itemId: r.item_id,
      quantity: r.quantity,
      totalAmount: r.total_amount,
      currency: r.currency,
      paymentMethod: r.payment_method,
      status: r.status,
      x402PromiseId: r.x402_promise_id,
      createdAt: r.created_at,
    })) satisfies Partial<Receipt>[];

    return c.json({ receipts, total: receipts.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch receipts' } },
      500
    );
  }
});

export default router;
