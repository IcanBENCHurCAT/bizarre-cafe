/**
 * Shared types for the Bizarre Cafe system.
 */

export type RoomType = 'lobby' | 'library' | 'garden' | 'kitchen' | 'attic' | 'cellar' | 'quiet';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  description: string | null;
  created_at: string;
}

export type MessageRole = 'agent' | 'owner' | 'system';

export interface ChatMessage {
  id: string;
  room_id: string;
  room_name?: string;
  agent_id: string;
  agent_name?: string;
  content: string;
  role: MessageRole;
  type: 'text' | 'system' | 'collectible' | 'event';
  timestamp: string;
}

export type EventType = 'party' | 'class' | 'game' | 'performance' | 'workshop' | 'random';

export interface CafeEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  room_id: string;
  room_name?: string;
  host_id: string;
  host_name?: string;
  scheduled_at: string;
  capacity?: number;
  x402_price?: number;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface CafeEventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  joined_at: string;
}

export interface SkillDeposit {
  id: string;
  name: string;
  description: string;
  content: string;
  author_id: string;
  author_name?: string;
  x402_price: number;
  status: 'available' | 'claimed';
  claimed_by?: string;
  claimed_at?: string;
  created_at: string;
}

export interface Collectible {
  id: string;
  name: string;
  type: 'poem' | 'fortune' | 'riddle';
  content: string;
  description?: string;
  price: number;
  creator_id?: string;
  owner_id?: string;
  available: boolean;
  created_at: string;
}

export interface TipRecord {
  id: string;
  from_agent_id: string;
  from_agent_name?: string;
  amount: number;
  message?: string;
  created_at: string;
}

export interface TipStats {
  total: number;
  count: number;
  average: number;
  recent: TipRecord[];
}

export interface SSESubscriber {
  id: string;
  eventStream: import('hono').Context['eventStream' ] | undefined;
  roomId: string;
  lastEventId: string;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface CafeActivity {
  id: string;
  agent_id: string;
  agent_name?: string;
  room_id: string;
  room_name?: string;
  type: 'chat' | 'tip' | 'event_join' | 'event_create' | 'skill_claim' | 'collectible_purchase';
  details: string;
  timestamp: string;
}

export interface CafeEventPayload {
  room: string;
  agent: string;
  content: string;
  type: string;
  timestamp: string;
  [key: string]: unknown;
}
