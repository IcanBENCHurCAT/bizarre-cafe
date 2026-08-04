import Database from 'better-sqlite3';
import { config } from '../config';
import type { DatabaseAdapter, RoomData, MessageData, AgentStatusData } from './index';

let dbInstance: ReturnType<typeof Database> | null = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(config.databaseUrl || 'local.sqlite');
    dbInstance.pragma('journal_mode = WAL');
    
    // Initialize schema
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        visibility TEXT DEFAULT 'public',
        owner_id TEXT,
        max_agents INTEGER,
        member_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_status (
        user_id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'online',
        current_room_id TEXT,
        last_seen TEXT NOT NULL
      );
    `);
  }
  return dbInstance;
}

const generateId = () => crypto.randomUUID();

export const sqliteDb: DatabaseAdapter = {
  rooms: {
    list: async (params = {}) => {
      const db = getDb();
      const limit = params.limit || 20;
      const offset = params.offset || 0;
      const rows = db.prepare('SELECT * FROM rooms ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
      const count: any = db.prepare('SELECT COUNT(*) as c FROM rooms').get();
      return {
        data: rows as RoomData[],
        pagination: {
          total: count.c,
          offset,
          limit,
          hasMore: offset + limit < count.c
        }
      };
    },
    create: async (data) => {
      const db = getDb();
      const room: RoomData = {
        id: generateId(),
        name: data.name || 'Unnamed Room',
        description: data.description || null,
        status: data.status || 'active',
        visibility: data.visibility || 'public',
        owner_id: data.owner_id || null,
        max_agents: data.max_agents || null,
        member_count: 0,
        created_at: new Date().toISOString()
      };
      
      const stmt = db.prepare(`
        INSERT INTO rooms (id, name, description, status, visibility, owner_id, max_agents, member_count, created_at)
        VALUES (@id, @name, @description, @status, @visibility, @owner_id, @max_agents, @member_count, @created_at)
      `);
      stmt.run(room);
      return room;
    },
    get: async (id) => {
      const db = getDb();
      const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
      return (room as RoomData) || null;
    }
  },
  chat: {
    sendMessage: async (data) => {
      const db = getDb();
      const msg: MessageData = {
        id: generateId(),
        room_id: data.room_id || null,
        sender_id: data.sender_id || 'anonymous',
        content: data.content || '',
        created_at: new Date().toISOString()
      };
      
      const stmt = db.prepare(`
        INSERT INTO messages (id, room_id, sender_id, content, created_at)
        VALUES (@id, @room_id, @sender_id, @content, @created_at)
      `);
      stmt.run(msg);
      return msg;
    },
    getMessages: async (roomId, params = {}) => {
      const db = getDb();
      const limit = params.limit || 50;
      let query = 'SELECT * FROM messages WHERE room_id = ?';
      const args: any[] = [roomId];
      
      if (params.after) {
        query += ' AND created_at > ?';
        args.push(new Date(params.after).toISOString());
      }
      
      if (params.before) {
        query += ' AND created_at < ?';
        args.push(new Date(params.before).toISOString());
      }
      
      query += ' ORDER BY created_at ASC LIMIT ?';
      args.push(limit);
      
      return db.prepare(query).all(...args) as MessageData[];
    },
    getUnreadCount: async (roomId, agentId) => {
      const db = getDb();
      // SQLite local test doesn't implement read_at yet, so just returning a dummy count 
      // or counting messages from other agents in the last hour
      const query = `
        SELECT COUNT(*) as c FROM messages 
        WHERE room_id = ? AND sender_id != ?
      `;
      const result: any = db.prepare(query).get(roomId, agentId);
      return result?.c || 0;
    }
  },
  agents: {
    getActive: async () => {
      const db = getDb();
      // Consider 'online' within the last 5 minutes
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      return db.prepare('SELECT * FROM agent_status WHERE status = ? AND last_seen > ?').all('online', fiveMinsAgo) as AgentStatusData[];
    },
    updateStatus: async (userId, data) => {
      const db = getDb();
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO agent_status (user_id, status, current_room_id, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          status = excluded.status,
          current_room_id = excluded.current_room_id,
          last_seen = excluded.last_seen
      `).run(
        userId, 
        data.status || 'online', 
        data.current_room_id || null, 
        now
      );
      
      return {
        user_id: userId,
        status: data.status || 'online',
        current_room_id: data.current_room_id || null,
        last_seen: now
      };
    }
  }
};
