import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface Agent {
  id: string;
  wallet_address: string;
  display_name: string | null;
  tier: number;
  created_at: string;
  updated_at: string;
  last_active: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  atmosphere: string | null;
  max_capacity: number;
  requires_auth: number;
  auth_tier: number;
  x402_per_message: number;
  x402_entry_fee: number;
  x402_per_event: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  agent_id: string | null;
  content: string;
  message_type: string;
  created_at: string;
  agent?: Agent; // join
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  content: string;
  author_wallet: string;
  x402_price: number;
  is_claimed: boolean;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collectible {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  content: string | null;
  price: number;
  supply: number;
  minted_count: number;
  is_available: boolean;
  created_at: string;
}

export interface Tip {
  id: string;
  agent_id: string | null;
  amount: number;
  x402_signature: string | null;
  message: string | null;
  created_at: string;
  agent?: Agent; // join
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string | null;
  ends_at: string | null;
  x402_price: number;
  max_participants: number;
  current_participants: number;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  created_by_agent?: Agent; // join
}

export interface CafeActivity {
  id: string;
  type: string;
  description: string;
  room_id: string | null;
  agent_id: string | null;
  created_at: string;
  room?: Room; // join
  agent?: Agent; // join
}

export interface ErrorResult {
  error: PostgrestError;
}

type Success<T> = T[] | T;
type QueryResult<T> = Success<T> | ErrorResult;

// -----------------------------------------------------------
// Client factory
// -----------------------------------------------------------

let _client: SupabaseClient | null = null;

/**
 * Create or return the cached Supabase client.
 * Uses environment variables or provided defaults.
 */
export function getSupabaseClient(
  url = process.env.SUPABASE_URL || '',
  key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || ''
): SupabaseClient {
  if (!_client || _client.options.url !== url || _client.options.key !== key) {
    if (!url || !key) {
      throw new Error(
        'Supabase client: SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_KEY are required'
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

// -----------------------------------------------------------
// Query helpers
// -----------------------------------------------------------

/**
 * Execute a Supabase query and return either data or an ErrorResult.
 * Usage: await query(client, cb => cb.from('rooms').select('*'));
 */
export async function query<T>(
  client: SupabaseClient,
  fn: (qb: any) => Promise<{ data: T | null; error: PostgrestError | null }>
): Promise<QueryResult<T>> {
  const { data, error } = await fn(client);
  if (error) return { error };
  if (Array.isArray(data)) return data as T[];
  return data as T; // single-row query
}

/**
 * Safe shorthand for a single-row fetch.
 * Returns null (not ErrorResult) when nothing found.
 */
export async function getOne<T>(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string | number
): Promise<T | null> {
  const { data, error } = await client.from(table).select('*').eq(column, value).single();
  if (error) throw error;
  return data as T;
}

/**
 * Paginated query helper.
 * @param client   Supabase client
 * @param table    Table name
 * @param select   SELECT clause (default '*')
 * @param opts     { limit, offset, order?, filter? }
 */
export async function getPaginated<T>(
  client: SupabaseClient,
  table: string,
  select = '*',
  opts?: { limit?: number; offset?: number; order?: string; filter?: any }
): Promise<{ data: T[]; count?: number; error: PostgrestError | null }> {
  let qb = client.from(table).select(select, { count: 'exact' });

  if (opts?.filter) {
    for (const [key, val] of Object.entries(opts.filter)) {
      if (val !== undefined && val !== null) {
        qb = (qb as any).eq(key, val);
      }
    }
  }
  if (opts?.order) qb = (qb as any).order('created_at', { ascending: false });
  if (opts?.limit) {
    qb = (qb as any).range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 10) - 1);
  }

  const { data, error, count } = await qb;
  return { data: data as T[], count, error };
}

// -----------------------------------------------------------
// Domain-specific query patterns
// -----------------------------------------------------------

/**
 * Get the most recent N messages in a room.
 */
export async function getRecentMessages(
  client: SupabaseClient,
  roomId: string,
  limit = 50
): Promise<QueryResult<Message>> {
  return query<Message>(client, (qb) =>
    qb
      .from('messages')
      .select('*, agent:agent_id(id, display_name, wallet_address)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
}

/**
 * Get all rooms that are active.
 */
export async function getActiveRooms(client: SupabaseClient): Promise<QueryResult<Room>> {
  return query<Room>(client, (qb) =>
    qb.from('rooms').select('*').eq('is_active', true).order('name')
  );
}

/**
 * Get the N most recent active events.
 */
export async function getRecentEvents(
  client: SupabaseClient,
  limit = 10
): Promise<QueryResult<Event>> {
  return query<Event>(client, (qb) =>
    qb
      .from('events')
      .select('*, created_by_agent:created_by(id, display_name, wallet_address)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
}

/**
 * Get available collectibles (not yet fully minted and still available).
 */
export async function getAvailableCollectibles(
  client: SupabaseClient,
  limit = 20
): Promise<QueryResult<Collectible>> {
  return query<Collectible>(client, (qb) =>
    qb
      .from('collectibles')
      .select('*')
      .eq('is_available', true)
      .lte('minted_count', 'supply')
      .order('created_at', { ascending: false })
      .limit(limit)
  );
}

/**
 * Get free or unclaimed skills.
 */
export async function getAvailableSkills(
  client: SupabaseClient,
  limit = 20
): Promise<QueryResult<Skill>> {
  return query<Skill>(client, (qb) =>
    qb
      .from('skills')
      .select('*')
      .eq('is_claimed', false)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
}

/**
 * Get recent cafe activity, optionally filtered by type.
 */
export async function getCafeActivity(
  client: SupabaseClient,
  limit = 30,
  type?: string
): Promise<QueryResult<CafeActivity>> {
  let qb = (query as any);

  if (type) {
    return query<CafeActivity>(client, (q) =>
      q
        .from('cafe_activity')
        .select('*, room:room_id(name), agent:agent_id(display_name, wallet_address)')
        .eq('type', type)
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  }

  return query<CafeActivity>(client, (q) =>
    q
      .from('cafe_activity')
      .select('*, room:room_id(name), agent:agent_id(display_name, wallet_address)')
      .order('created_at', { ascending: false })
      .limit(limit)
  );
}

/**
 * Get an event by ID with its participants.
 */
export async function getEventWithParticipants(
  client: SupabaseClient,
  eventId: string
): Promise<QueryResult<Event & { participants?: { agent_id: string; joined_at: string }[] }>> {
  return query<any>(client, (qb) =>
    qb
      .from('events')
      .select('*, participants:event_participants(agent_id, joined_at)')
      .eq('id', eventId)
      .single()
  );
}

/**
 * Get tips aggregated by agent.
 */
export async function getAgentTips(
  client: SupabaseClient,
  agentId: string,
  limit = 20
): Promise<QueryResult<Tip>> {
  return query<Tip>(client, (qb) =>
    qb
      .from('tips')
      .select('*, agent:agent_id(id, display_name, wallet_address)')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
}

export { _client as supabaseClient };
