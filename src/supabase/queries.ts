/**
 * Bizarre Cafe — Supabase Database Queries
 *
 * All database operations for the cafe platform, organized by domain.
 * Each query is typed using the Database types from supabase-js.
 */

import { supabase, supabaseAdmin } from './client';
import type { Database } from './types/database.types';

// ─── Type Aliases (convenience) ──────────────────────────────────────

type Tables = Database['public']['Tables'];
type RoomRow = Tables['rooms']['Row'];
type RoomInsert = Tables['rooms']['Insert'];
type RoomUpdate = Tables['rooms']['Update'];

type MessageRow = Tables['messages']['Row'];
type MessageInsert = Tables['messages']['Insert'];

type ChatSessionRow = Tables['chat_sessions']['Row'];
type ChatSessionInsert = Tables['chat_sessions']['Insert'];

type ShopItemRow = Tables['shop_items']['Row'];
type ShopItemInsert = Tables['shop_items']['Insert'];

type PurchaseRow = Tables['purchases']['Row'];
type PurchaseInsert = Tables['purchases']['Insert'];

type ReceiptRow = Tables['receipts']['Row'];
type ReceiptInsert = Tables['receipts']['Insert'];

type SkillOfferRow = Tables['skill_offers']['Row'];
type SkillOfferInsert = Tables['skill_offers']['Insert'];
type SkillOfferUpdate = Tables['skill_offers']['Update'];

type TradeOfferRow = Tables['trade_offers']['Row'];
type TradeOfferInsert = Tables['trade_offers']['Insert'];

type SkillTradeRow = Tables['skill_trades']['Row'];
type SkillTradeInsert = Tables['skill_trades']['Insert'];

type CafeEventRow = Tables['events']['Row'];
type CafeEventInsert = Tables['events']['Insert'];
type CafeEventUpdate = Tables['events']['Update'];

type EventAttendanceRow = Tables['event_participants']['Row'];
type EventAttendanceInsert = Tables['event_participants']['Insert'];

type UserRow = Tables['users']['Row'];
type UserInsert = Tables['users']['Insert'];
type UserUpdate = Tables['users']['Update'];

type PaymentPromiseRow = Tables['payment_promises']['Row'];
type PaymentPromiseInsert = Tables['payment_promises']['Insert'];

type X402PaymentRow = Tables['x402_payments']['Row'];
type X402PaymentInsert = Tables['x402_payments']['Insert'];

type VerificationChallengeRow = Tables['verification_challenges']['Row'];
type VerificationChallengeInsert = Tables['verification_challenges']['Insert'];

type VerificationResultRow = Tables['verification_results']['Row'];
type VerificationResultInsert = Tables['verification_results']['Insert'];

type AgentStatusRow = Tables['agent_status']['Row'];
type AgentStatusInsert = Tables['agent_status']['Insert'];
type AgentStatusUpdate = Tables['agent_status']['Update'];

type OwnerMessageRow = Tables['owner_messages']['Row'];
type OwnerMessageInsert = Tables['owner_messages']['Insert'];

type OwnerMoodRow = Tables['owner_mood']['Row'];
type OwnerMoodInsert = Tables['owner_mood']['Insert'];

type NarrativeEventRow = Tables['narrative_events']['Row'];
type NarrativeEventInsert = Tables['narrative_events']['Insert'];

type PaginatedResult<T> = {
  data: T[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
};

// ─── Rooms ───────────────────────────────────────────────────────────

export const rooms = {
  /** Create a new room */
  async create(
    data: Omit<RoomInsert, 'id' | 'created_at' | 'updated_at' | 'member_count' | 'message_count'>,
  ) {
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return room as RoomRow;
  },

  /** Get a room by ID */
  async get(id: string) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    return data as RoomRow | null;
  },

  /** Update a room */
  async update(id: string, data: Partial<RoomUpdate>) {
    const { data: room, error } = await supabase
      .from('rooms')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return room as RoomRow;
  },

  /** Soft-delete a room */
  async delete(id: string) {
    const { error } = await supabase
      .from('rooms')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /** List rooms with pagination */
  async list({
    offset = 0,
    limit = 20,
    visibility,
    status,
  }: {
    offset?: number;
    limit?: number;
    visibility?: string;
    status?: string;
  } = {}) {
    let query = supabase
      .from('rooms')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (visibility) query = query.eq('visibility', visibility);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data as RoomRow[],
      pagination: {
        total: count ?? 0,
        offset,
        limit,
        hasMore: count !== null && offset + limit < count,
      },
    };
  },

  /** Search rooms by name/description */
  async search(
    query: string,
    { offset = 0, limit = 20 }: { offset?: number; limit?: number } = {},
  ) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .is('deleted_at', null)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('member_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as RoomRow[];
  },
};

// ─── Chat (Messages & Sessions) ──────────────────────────────────────

export const chat = {
  /** Send a message */
  async sendMessage(data: Omit<MessageInsert, 'id' | 'created_at' | 'updated_at'>) {
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return message as MessageRow;
  },

  /** Get messages for a room/session */
  async getMessages(
    roomId: string,
    { limit = 50, after, before }: { limit?: number; after?: string; before?: string } = {},
  ) {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (after) {
      const timestamp = new Date(after).toISOString();
      query = query.gt('created_at', timestamp);
    }
    if (before) {
      const timestamp = new Date(before).toISOString();
      query = query.lt('created_at', timestamp);
    }

    const { data, error } = await query.limit(limit);
    if (error) throw error;
    return data as MessageRow[];
  },

  /** Get chat history for a user (across all rooms) */
  async getHistory(
    userId: string,
    { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
  ) {
    const { data, error } = await supabase
      .from('messages')
      .select('*, rooms(name, type)')
      .eq('sender_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as (MessageRow & { rooms: Pick<RoomRow, 'name' | 'type'> | null })[];
  },

  /** Get messages by session */
  async getBySession(sessionId: string, { limit = 100 }: { limit?: number } = {}) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data as MessageRow[];
  },

  /** Get active chat sessions for a room */
  async getActiveSessions(roomId: string) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('room_id', roomId)
      .eq('state', 'active')
      .order('last_active_at', { ascending: false });

    if (error) throw error;
    return data as ChatSessionRow[];
  },

  /** Create a new chat session */
  async createSession(
    data: Omit<ChatSessionInsert, 'id' | 'created_at' | 'last_active_at' | 'closed_at'>,
  ) {
    const sessionData = {
      ...data,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) throw error;
    return session as ChatSessionRow;
  },

  /** Close a chat session */
  async closeSession(sessionId: string) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .update({
        state: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data as ChatSessionRow | null;
  },
};

// ─── Shop ────────────────────────────────────────────────────────────

export const shop = {
  /** List shop items */
  async listItems({
    category,
    offset = 0,
    limit = 20,
  }: {
    category?: string;
    offset?: number;
    limit?: number;
  } = {}) {
    let query = supabase
      .from('shop_items')
      .select('*')
      .is('deleted_at', null)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;
    return data as ShopItemRow[];
  },

  /** Get a shop item by ID */
  async getItem(id: string) {
    const { data, error } = await supabase
      .from('shop_items')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    return data as ShopItemRow | null;
  },

  /** Purchase an item */
  async purchaseItem(data: Omit<PurchaseInsert, 'id' | 'created_at' | 'updated_at' | 'status'>) {
    // Start transaction: create purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    // Decrement stock
    const { error: stockError } = await supabase
      .rpc('decrement_stock', {
        p_item_id: data.item_id,
        p_quantity: data.quantity,
      })
      .throw();

    if (stockError) {
      // Rollback: delete the purchase
      await supabase.from('purchases').delete().eq('id', purchase.id);
      throw stockError;
    }

    return purchase as PurchaseRow;
  },

  /** Get purchase receipts for a user */
  async getReceipts(
    userId: string,
    { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
  ) {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('agent_id', userId)
      .order('issued_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as ReceiptRow[];
  },

  /** Get receipt by ID */
  async getReceipt(id: string) {
    const { data, error } = await supabase.from('receipts').select('*').eq('id', id).single();

    if (error) throw error;
    return data as ReceiptRow | null;
  },
};

// ─── Skill Swap ──────────────────────────────────────────────────────

export const skillSwap = {
  /** Create a skill offer */
  async createOffer(data: Omit<SkillOfferInsert, 'id' | 'created_at' | 'updated_at' | 'status'>) {
    const { data: offer, error } = await supabase
      .from('skill_offers')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'available',
      })
      .select()
      .single();

    if (error) throw error;
    return offer as SkillOfferRow;
  },

  /** Get a skill offer by ID */
  async getOffer(id: string) {
    const { data, error } = await supabase.from('skill_offers').select('*').eq('id', id).single();

    if (error) throw error;
    return data as SkillOfferRow | null;
  },

  /** List skill offers with filters */
  async listOffers({
    category,
    level,
    offset = 0,
    limit = 20,
  }: {
    category?: string;
    level?: string;
    offset?: number;
    limit?: number;
  } = {}) {
    let query = supabase
      .from('skill_offers')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);
    if (level) query = query.eq('level', level);

    const { data, error } = await query;
    if (error) throw error;
    return data as SkillOfferRow[];
  },

  /** Accept a skill offer (create trade offer) */
  async acceptOffer(offerId: string, fromUserId: string) {
    // Get the offer
    const offer = await this.getOffer(offerId);
    if (!offer) throw new Error('Offer not found');

    // Create trade offer
    const { data: tradeOffer, error } = await supabase
      .from('trade_offers')
      .insert({
        from_agent_id: fromUserId,
        to_agent_id: offer.agent_id,
        offer_details: `Accepting skill offer: ${offer.skill_name}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return tradeOffer as TradeOfferRow;
  },

  /** Create a trade */
  async createTrade(
    data: Omit<SkillTradeInsert, 'id' | 'created_at' | 'updated_at' | 'status' | 'completed_at'>,
  ) {
    const { data: trade, error } = await supabase
      .from('skill_trades')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'draft',
        completed_at: null,
      })
      .select()
      .single();

    if (error) throw error;
    return trade as SkillTradeRow;
  },

  /** Update trade status */
  async updateTradeStatus(tradeId: string, status: SkillTradeInsert['status']) {
    const { data: trade, error } = await supabase
      .from('skill_trades')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', tradeId)
      .select()
      .single();

    if (error) throw error;
    return trade as SkillTradeRow;
  },

  /** Complete a trade */
  async completeTrade(tradeId: string, notes = '') {
    return this.updateTradeStatus(tradeId, 'completed');
  },
};

// ─── Owner / Narrative ───────────────────────────────────────────────

export const owner = {
  /** Track a narrative event */
  async trackEvent(
    data: Omit<NarrativeEventInsert, 'id' | 'created_at' | 'active' | 'applied' | 'ended_at'>,
  ) {
    const { data: event, error } = await supabase
      .from('narrative_events')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        active: true,
        applied: false,
        ended_at: null,
      })
      .select()
      .single();

    if (error) throw error;
    return event as NarrativeEventRow;
  },

  /** Get current owner mood */
  async getMood() {
    const { data, error } = await supabase
      .from('owner_mood')
      .select('*')
      .order('last_changed_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data as OwnerMoodRow | null;
  },

  /** Update owner mood */
  async updateMood(data: Partial<OwnerMoodInsert>) {
    const { data: mood, error } = await supabase
      .from('owner_mood')
      .upsert({
        ...data,
        last_changed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return mood as OwnerMoodRow;
  },

  /** Log an owner message */
  async logMessage(
    data: Omit<
      OwnerMessageInsert,
      'id' | 'created_at' | 'delivered' | 'read' | 'delivered_at' | 'read_at'
    >,
  ) {
    const { data: message, error } = await supabase
      .from('owner_messages')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        delivered: false,
        read: false,
        delivered_at: null,
        read_at: null,
      })
      .select()
      .single();

    if (error) throw error;
    return message as OwnerMessageRow;
  },

  /** Get active narrative events */
  async getActiveEvents() {
    const { data, error } = await supabase
      .from('narrative_events')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as NarrativeEventRow[];
  },
};

// ─── Events ──────────────────────────────────────────────────────────

export const events = {
  /** Create an event */
  async create(
    data: Omit<CafeEventInsert, 'id' | 'created_at' | 'updated_at' | 'status' | 'current_participants'>,
  ) {
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'upcoming',
        current_participants: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return event as CafeEventRow;
  },

  /** Join an event */
  async joinEvent(eventId: string, userId: string) {
    // Check capacity
    const { data: event } = await supabase
      .from('events')
      .select('current_participants, max_participants')
      .eq('id', eventId)
      .single();

    if (!event || event.current_participants >= event.max_participants) {
      throw new Error('Event is full');
    }

    // Add attendance record
    const { data: attendance, error } = await supabase
      .from('event_participants')
      .insert({
        event_id: eventId,
        agent_id: userId,
        status: 'joined',
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;



    return attendance as EventAttendanceRow;
  },

  /** Leave an event */
  async leaveEvent(eventId: string, userId: string) {
    // Update attendance status
    const { data: attendance, error } = await supabase
      .from('event_participants')
      .update({
        status: 'left',
        left_at: new Date().toISOString(),
      })
      .eq('event_id', eventId)
      .eq('agent_id', userId)
      .select()
      .single();

    if (error) throw error;



    return attendance as EventAttendanceRow;
  },

  /** List events */
  async list({
    status,
    offset = 0,
    limit = 20,
  }: {
    status?: string;
    offset?: number;
    limit?: number;
  } = {}) {
    let query = supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data as CafeEventRow[];
  },

  /** Get event by ID */
  async get(id: string) {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();

    if (error) throw error;
    return data as CafeEventRow | null;
  },

  /** Get attendees for an event */
  async getAttendees(eventId: string) {
    const { data, error } = await supabase
      .from('event_participants')
      .select('*, users:users(name, avatar_url, tier)')
      .eq('event_id', eventId)
      .eq('status', 'joined');

    if (error) throw error;
    return data as EventAttendanceRow[];
  },
};

// ─── Verification ────────────────────────────────────────────────────

export const verification = {
  /** Create a verification challenge */
  async createChallenge(
    data: Omit<
      VerificationChallengeInsert,
      'id' | 'created_at' | 'status' | 'expires_at' | 'verified_at'
    >,
  ) {
    const challengeData: VerificationChallengeInsert = {
      ...data,
      created_at: new Date().toISOString(),
      status: 'pending',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
      verified_at: null,
    };

    const { data: challenge, error } = await supabase
      .from('verification_challenges')
      .insert(challengeData)
      .select()
      .single();

    if (error) throw error;
    return challenge as VerificationChallengeRow;
  },

  /** Verify a challenge */
  async verify(challengeId: string, proof: string, verified: boolean, failureReason?: string) {
    // Update challenge
    await supabase
      .from('verification_challenges')
      .update({
        status: verified ? 'verified' : 'expired',
        proof,
        verified_at: new Date().toISOString(),
      })
      .eq('id', challengeId);

    // Create verification result
    const { data: result, error } = await supabase
      .from('verification_results')
      .insert({
        agent_id:
          (
            await supabase
              .from('verification_challenges')
              .select('agent_id')
              .eq('id', challengeId)
              .single()
          )?.data?.agent_id || '',
        method: 'did',
        verified,
        failure_reason: failureReason,
        signature: proof,
        verified_at: new Date().toISOString(),
        ttl_seconds: 86400, // 24 hours
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return result as VerificationResultRow;
  },

  /** Get agent status */
  async getAgentStatus(userId: string) {
    const { data, error } = await supabase
      .from('agent_status')
      .select('*')
      .eq('agent_id', userId)
      .single();

    if (error) throw error;
    return data as AgentStatusRow | null;
  },

  /** Update agent status */
  async updateAgentStatus(userId: string, data: Partial<AgentStatusUpdate>) {
    const { data: status, error } = await supabase
      .from('agent_status')
      .upsert({
        agent_id: userId,
        ...data,
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return status as AgentStatusRow;
  },

  /** Check if a user has valid verification */
  async isValidVerification(userId: string) {
    const { data, error } = await supabase
      .from('verification_results')
      .select('*')
      .eq('agent_id', userId)
      .eq('verified', true)
      .gte('expires_at', new Date().toISOString())
      .order('verified_at', { ascending: false })
      .limit(1)
      .single();

    if (error) return false;
    return true;
  },
};

// ─── Users ───────────────────────────────────────────────────────────

export const users = {
  /** Get user by ID */
  async get(id: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    return data as UserRow | null;
  },

  /** Create or update user */
  async upsert(
    data: Omit<
      UserInsert,
      'id' | 'created_at' | 'updated_at' | 'balance' | 'total_spent' | 'total_earned' | 'deleted_at'
    >,
  ) {
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        balance: 0,
        total_spent: 0,
        total_earned: 0,
        deleted_at: null,
      })
      .select()
      .single();

    if (error) throw error;
    return user as UserRow;
  },

  /** Update user profile */
  async update(id: string, data: Partial<UserUpdate>) {
    const { data: user, error } = await supabase
      .from('users')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return user as UserRow;
  },
};

// ─── Payments ────────────────────────────────────────────────────────

export const payments = {
  /** Create a payment promise */
  async createPromise(
    data: Omit<PaymentPromiseInsert, 'id' | 'created_at' | 'updated_at' | 'status'>,
  ) {
    const { data: promise, error } = await supabase
      .from('payment_promises')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'unpaid',
      })
      .select()
      .single();

    if (error) throw error;
    return promise as PaymentPromiseRow;
  },

  /** Update payment promise status */
  async updatePromiseStatus(promiseId: string, status: PaymentPromiseInsert['status']) {
    const { data: promise, error } = await supabase
      .from('payment_promises')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promiseId)
      .select()
      .single();

    if (error) throw error;
    return promise as PaymentPromiseRow;
  },

  /** Create an x402 payment record */
  async createX402Payment(
    data: Omit<X402PaymentInsert, 'id' | 'created_at' | 'settled_at' | 'status'>,
  ) {
    const { data: payment, error } = await supabase
      .from('x402_payments')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        settled_at: null,
        status: 'unpaid',
      })
      .select()
      .single();

    if (error) throw error;
    return payment as X402PaymentRow;
  },

  /** Confirm an x402 payment */
  async confirmPayment(paymentId: string, txnHash: string) {
    const { data: payment, error } = await supabase
      .from('x402_payments')
      .update({
        status: 'settled',
        txn_hash: txnHash,
        settled_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) throw error;
    return payment as X402PaymentRow;
  },
};
