import Database from 'better-sqlite3';
import { config } from '../config';
import type { DatabaseAdapter, RoomData, MessageData, AgentStatusData, X402PaymentData } from './index';

let dbInstance: ReturnType<typeof Database> | null = null;

function getDb() {
  if (!dbInstance) {
    const dbPath = config.databaseUrl.endsWith('.sqlite') || config.databaseUrl.endsWith('.db')
      ? config.databaseUrl
      : 'local.sqlite';
    dbInstance = new Database(dbPath, { timeout: 10000 });
    try {
      dbInstance.pragma('journal_mode = WAL');
      dbInstance.pragma('busy_timeout = 10000');
    } catch {
      // ignore pragma error on restricted filesystems
    }

    // Initialize schema
    try {
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

      CREATE TABLE IF NOT EXISTS shop_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        currency TEXT DEFAULT 'microUSDC',
        stock INTEGER,
        image_url TEXT,
        tags TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skill_offers (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT,
        wanted_skill TEXT,
        wanted_description TEXT,
        status TEXT DEFAULT 'available',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cafe_events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'upcoming',
        location TEXT,
        host_id TEXT,
        max_attendees INTEGER,
        start_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS owner_mood (
        id TEXT PRIMARY KEY,
        mood TEXT NOT NULL,
        stress_level INTEGER DEFAULT 25,
        last_interaction TEXT,
        total_interactions INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS verification_challenges (
        id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'pending',
        user_id TEXT,
        challenge TEXT NOT NULL,
        proof TEXT,
        expires_at TEXT NOT NULL,
        method TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        verified_at TEXT
      );

      CREATE TABLE IF NOT EXISTS agent_verification (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        is_verified INTEGER DEFAULT 0,
        status TEXT DEFAULT 'unverified',
        tier TEXT DEFAULT 'unverified',
        method TEXT,
        did_document TEXT,
        wallet_address TEXT,
        verified_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS x402_payments (
        id TEXT PRIMARY KEY,
        txn_hash TEXT UNIQUE,
        proposal_id TEXT,
        amount INTEGER,
        from_address TEXT,
        to_address TEXT,
        status TEXT,
        receipt TEXT,
        created_at TEXT NOT NULL
      );
    `);
    } catch {
      // Ignore concurrent schema initialization from parallel test runners
    }
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
      const rows = db
        .prepare('SELECT * FROM rooms ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset);
      const count: any = db.prepare('SELECT COUNT(*) as c FROM rooms').get();
      return {
        data: rows as RoomData[],
        pagination: {
          total: count.c,
          offset,
          limit,
          hasMore: offset + limit < count.c,
        },
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
        created_at: new Date().toISOString(),
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
    },
  },
  chat: {
    sendMessage: async (data) => {
      const db = getDb();
      const msg: MessageData = {
        id: generateId(),
        room_id: data.room_id || null,
        sender_id: data.sender_id || 'anonymous',
        content: data.content || '',
        created_at: new Date().toISOString(),
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
    },
  },
  agents: {
    getActive: async () => {
      const db = getDb();
      // Consider 'online' within the last 5 minutes
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      return db
        .prepare('SELECT * FROM agent_status WHERE status = ? AND last_seen > ?')
        .all('online', fiveMinsAgo) as AgentStatusData[];
    },
    updateStatus: async (userId, data) => {
      const db = getDb();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO agent_status (user_id, status, current_room_id, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          status = excluded.status,
          current_room_id = excluded.current_room_id,
          last_seen = excluded.last_seen
      `,
      ).run(userId, data.status || 'online', data.current_room_id || null, now);

      return {
        user_id: userId,
        status: data.status || 'online',
        current_room_id: data.current_room_id || null,
        last_seen: now,
      };
    },
  },
  payments: {
    recordPayment: async (payment) => {
      const db = getDb();
      const id = payment.id || generateId();
      const createdAt = payment.created_at || new Date().toISOString();
      const status = payment.status || 'verified';
      const record: X402PaymentData = {
        id,
        txn_hash: payment.txn_hash,
        proposal_id: payment.proposal_id ?? null,
        amount: payment.amount,
        from_address: payment.from_address,
        to_address: payment.to_address,
        status,
        receipt: payment.receipt ?? null,
        created_at: createdAt,
      };

      const stmt = db.prepare(`
        INSERT INTO x402_payments (id, txn_hash, proposal_id, amount, from_address, to_address, status, receipt, created_at)
        VALUES (@id, @txn_hash, @proposal_id, @amount, @from_address, @to_address, @status, @receipt, @created_at)
      `);
      stmt.run(record);
      return record;
    },
    hasTxnHash: async (txnHash: string) => {
      const db = getDb();
      const row = db.prepare('SELECT 1 FROM x402_payments WHERE txn_hash = ?').get(txnHash);
      return !!row;
    },
    getByTxnHash: async (txnHash: string) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM x402_payments WHERE txn_hash = ?').get(txnHash);
      return (row as X402PaymentData) || null;
    },
  },
};

export const recordSqlitePayment = sqliteDb.payments.recordPayment;
export const hasSqlitePaymentTxnHash = sqliteDb.payments.hasTxnHash;
export const getSqlitePaymentByTxnHash = sqliteDb.payments.getByTxnHash;
export const clearSqlitePayments = async (): Promise<void> => {
  const db = getDb();
  db.prepare('DELETE FROM x402_payments').run();
};

export interface SqliteAgentVerification {
  id: string;
  user_id: string;
  is_verified: boolean;
  status: string;
  tier: string;
  method: string | null;
  did_document: string | null;
  wallet_address: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export const getSqliteVerification = async (userId: string): Promise<SqliteAgentVerification | null> => {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM agent_verification WHERE user_id = ?').get(userId);
  if (!row) return null;
  return {
    ...row,
    is_verified: Boolean(row.is_verified),
  };
};

export const upsertSqliteVerification = async (data: {
  user_id: string;
  is_verified?: boolean;
  status?: string;
  tier?: string;
  method?: string | null;
  did_document?: string | null;
  wallet_address?: string | null;
  verified_at?: string | null;
}): Promise<SqliteAgentVerification> => {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await getSqliteVerification(data.user_id);
  const id = existing?.id || generateId();
  const isVerifiedNum = (data.is_verified ?? existing?.is_verified ?? false) ? 1 : 0;
  const status = data.status ?? existing?.status ?? 'unverified';
  const tier = data.tier ?? existing?.tier ?? 'unverified';
  const method = data.method !== undefined ? data.method : (existing?.method ?? null);
  const didDoc = data.did_document !== undefined ? data.did_document : (existing?.did_document ?? null);
  const wallet = data.wallet_address !== undefined ? data.wallet_address : (existing?.wallet_address ?? null);
  const verifiedAt = data.verified_at !== undefined ? data.verified_at : (existing?.verified_at ?? null);
  const createdAt = existing?.created_at || now;

  db.prepare(`
    INSERT INTO agent_verification (id, user_id, is_verified, status, tier, method, did_document, wallet_address, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      is_verified = excluded.is_verified,
      status = excluded.status,
      tier = excluded.tier,
      method = excluded.method,
      did_document = excluded.did_document,
      wallet_address = excluded.wallet_address,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
  `).run(id, data.user_id, isVerifiedNum, status, tier, method, didDoc, wallet, verifiedAt, createdAt, now);

  const result = await getSqliteVerification(data.user_id);
  if (!result) {
    throw new Error('Failed to retrieve upserted verification');
  }
  return result;
};

export const createSqliteChallenge = async (data: {
  id: string;
  user_id: string;
  challenge: string;
  proof?: string | null;
  expires_at: string;
  method?: string | null;
  status?: string;
  created_at?: string;
}): Promise<void> => {
  const db = getDb();
  const now = data.created_at || new Date().toISOString();
  db.prepare(`
    INSERT INTO verification_challenges (id, user_id, challenge, proof, expires_at, method, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.user_id,
    data.challenge,
    data.proof || null,
    data.expires_at,
    data.method || 'signature',
    data.status || 'pending',
    now,
    now,
  );
};

export const getSqliteChallenge = async (
  challenge: string,
  userId?: string,
): Promise<any | null> => {
  const db = getDb();
  if (userId) {
    return (
      db
        .prepare('SELECT * FROM verification_challenges WHERE challenge = ? AND user_id = ?')
        .get(challenge, userId) || null
    );
  }
  return (
    db
      .prepare('SELECT * FROM verification_challenges WHERE challenge = ?')
      .get(challenge) || null
  );
};

