// @ts-nocheck
 
import { rooms, chat, verification } from '../supabase/queries';
import { supabase } from '../supabase/client';
import type { DatabaseAdapter, RoomData, MessageData, AgentStatusData } from './index';

export const supabaseDb: DatabaseAdapter = {
  rooms: {
    list: async (params) => {
      const result = await rooms.list(params);
      return {
        data: result.data.map((r) => ({
          ...r,
          owner_id: r.owner_id ?? null,
          max_agents: r.max_agents ?? null,
        })) as RoomData[],
        pagination: result.pagination,
      };
    },
    create: async (data) => {
      // Cast the missing 'type' and default values needed by supabase
      const result = await rooms.create({
        name: data.name || 'Unnamed',
        description: data.description || null,
        type: 'public', // fallback default
        visibility: data.visibility || 'public',
        status: data.status || 'active',
        created_by: data.owner_id || 'system',
        max_agents: data.max_agents || undefined,
        tags: [],
      });
      return result as unknown as RoomData;
    },
    get: async (id) => {
      const room = await rooms.get(id);
      return room as unknown as RoomData | null;
    },
  },
  chat: {
    sendMessage: async (data) => {
      const msg = await chat.sendMessage({
        room_id: data.room_id || '',
        sender_id: data.sender_id || 'anonymous',
        content: data.content || '',
        session_id: undefined,
        sender_name: 'anonymous',
      });
      return msg as unknown as MessageData;
    },
    getMessages: async (roomId, params) => {
      const msgs = await chat.getMessages(roomId, params);
      return msgs as unknown as MessageData[];
    },
    getUnreadCount: async (roomId, agentId) => {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .neq('sender_id', agentId)
        .is('read_at', null);
      if (error) throw error;
      return count || 0;
    },
  },
  agents: {
    getActive: async () => {
      // In a real app we'd want a query to `agent_status` where status = 'online'
      // For now we'll return empty as we need to build that query.
      return [];
    },
    updateStatus: async (userId, data) => {
      const result = await verification.updateAgentStatus(userId, {
        presence: data.status ?? 'online',
        status_message: data.current_room_id,
      });
      return result as unknown as AgentStatusData;
    },
  },
};
