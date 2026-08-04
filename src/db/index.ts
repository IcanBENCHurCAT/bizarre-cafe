import { config } from '../config';
import { supabaseDb } from './supabase';
import { sqliteDb } from './sqlite';

export interface RoomData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  owner_id: string | null;
  max_agents: number | null;
  member_count: number;
  created_at: string;
}

export interface MessageData {
  id: string;
  room_id: string | null;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface AgentStatusData {
  user_id: string;
  status: string;
  current_room_id: string | null;
  last_seen: string;
}

export interface DatabaseAdapter {
  rooms: {
    list: (params?: {
      offset?: number;
      limit?: number;
    }) => Promise<{ data: RoomData[]; pagination: any }>;
    create: (data: Partial<RoomData>) => Promise<RoomData>;
    get: (id: string) => Promise<RoomData | null>;
  };
  chat: {
    sendMessage: (data: Partial<MessageData>) => Promise<MessageData>;
    getMessages: (
      roomId: string,
      params?: { limit?: number; after?: string; before?: string },
    ) => Promise<MessageData[]>;
    getUnreadCount: (roomId: string, agentId: string) => Promise<number>;
  };
  agents: {
    getActive: () => Promise<AgentStatusData[]>;
    updateStatus: (userId: string, data: Partial<AgentStatusData>) => Promise<AgentStatusData>;
  };
}

export const db: DatabaseAdapter = config.useLocalDb ? sqliteDb : supabaseDb;
