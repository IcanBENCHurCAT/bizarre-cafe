import { supabase } from '../supabase/client';
import type { ChatMessage, MessageRole } from '../types/cafe';

/**
 * Store a chat message in Supabase.
 */
export async function storeMessage(payload: {
  roomId: string;
  agentId: string;
  agentName?: string;
  content: string;
  role?: MessageRole;
  type?: 'text' | 'system' | 'collectible' | 'event';
}): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      room_id: payload.roomId,
      agent_id: payload.agentId,
      agent_name: payload.agentName ?? null,
      content: payload.content,
      role: payload.role ?? 'agent',
      type: payload.type ?? 'text',
    })
    .select()
    .single();

  if (error) throw error;
  return data as ChatMessage;
}

/**
 * Get recent messages for a room.
 */
export async function getRoomMessages(
  roomId: string,
  options: { limit?: number; since?: string; agentId?: string } = {}
): Promise<ChatMessage[]> {
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .eq('type', 'text')
    .order('timestamp', { ascending: false });

  if (options.since) {
    query = query.gte('timestamp', options.since);
  }
  if (options.agentId) {
    query = query.eq('agent_id', options.agentId);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

/**
 * Get active participants in a room (agents who posted recently).
 */
export async function getRoomParticipants(
  roomId: string,
  minutesAgo = 30
): Promise<{ agent_id: string; agent_name?: string; last_message_at: string }[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('agent_id, agent_name, timestamp')
    .eq('room_id', roomId)
    .eq('type', 'text')
    .gte('timestamp', new Date(Date.now() - minutesAgo * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false });

  if (error) throw error;

  // Deduplicate by agent_id, keeping most recent
  const seen = new Map<string, typeof data[0]>();
  for (const msg of data ?? []) {
    seen.set(msg.agent_id, msg);
  }
  return Array.from(seen.values());
}
