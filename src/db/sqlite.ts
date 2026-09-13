import Database from 'better-sqlite3';
import { config } from '../config';
import type { DatabaseAdapter, RoomData, MessageData, AgentStatusData, X402PaymentData } from './index';
import type { EscrowRecord, EscrowStatus } from '../types/cafe';

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
        category TEXT,
        price_micro_algos INTEGER DEFAULT 0,
        currency TEXT DEFAULT 'microAlgos',
        tags TEXT,
        wanted_skill TEXT,
        wanted_description TEXT,
        status TEXT DEFAULT 'available',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skill_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        requested_skill TEXT NOT NULL,
        description TEXT,
        offered_value TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        offer_id TEXT,
        request_id TEXT,
        from_agent_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        price_micro_algos INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT 'unpaid',
        escrow_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escrow_records (
        id TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL,
        buyer_agent_id TEXT NOT NULL,
        seller_agent_id TEXT NOT NULL,
        amount_micro_algos INTEGER NOT NULL,
        tx_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        released_at TEXT,
        refunded_at TEXT
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

      // Migrations / column checks for existing SQLite tables
      try { dbInstance.exec(`ALTER TABLE skill_offers ADD COLUMN category TEXT`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE skill_offers ADD COLUMN price_micro_algos INTEGER DEFAULT 0`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE skill_offers ADD COLUMN currency TEXT DEFAULT 'microAlgos'`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE skill_offers ADD COLUMN wanted_description TEXT`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE skill_offers ADD COLUMN tags TEXT`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE trades ADD COLUMN price_micro_algos INTEGER DEFAULT 0`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE trades ADD COLUMN payment_status TEXT DEFAULT 'unpaid'`); } catch { /* column may exist */ }
      try { dbInstance.exec(`ALTER TABLE trades ADD COLUMN escrow_id TEXT`); } catch { /* column may exist */ }
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

// ─── Skill Marketplace & Escrow SQLite Helpers ──────────────────────────────

export interface SqliteSkillOffer {
  id: string;
  agentId: string;
  skillName: string;
  description: string;
  category?: string;
  priceMicroAlgos: number;
  currency: string;
  tags: string[];
  wantedSkill: string | null;
  wantedDescription: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const createSqliteSkillOffer = async (offer: {
  id?: string;
  agent_id: string;
  skill_name: string;
  description: string;
  category?: string | null;
  price_micro_algos?: number;
  currency?: string;
  tags?: string[] | null;
  wanted_skill?: string | null;
  wanted_description?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}): Promise<SqliteSkillOffer> => {
  const db = getDb();
  const id = offer.id || generateId();
  const now = offer.created_at || new Date().toISOString();
  const tagsStr = offer.tags ? JSON.stringify(offer.tags) : JSON.stringify([]);
  const category = offer.category || null;
  const price = offer.price_micro_algos ?? 0;
  const currency = offer.currency || 'microAlgos';
  const status = offer.status || 'available';

  db.prepare(`
    INSERT INTO skill_offers (id, agent_id, skill_name, description, category, price_micro_algos, currency, tags, wanted_skill, wanted_description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    offer.agent_id,
    offer.skill_name,
    offer.description,
    category,
    price,
    currency,
    tagsStr,
    offer.wanted_skill || null,
    offer.wanted_description || null,
    status,
    now,
    offer.updated_at || now,
  );

  return {
    id,
    agentId: offer.agent_id,
    skillName: offer.skill_name,
    description: offer.description,
    category: category || undefined,
    priceMicroAlgos: price,
    currency,
    tags: offer.tags || [],
    wantedSkill: offer.wanted_skill || null,
    wantedDescription: offer.wanted_description || null,
    status,
    createdAt: now,
    updatedAt: offer.updated_at || now,
  };
};

export const getSqliteSkillOffers = async (params: {
  category?: string;
  maxPrice?: number;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<SqliteSkillOffer[]> => {
  const db = getDb();
  const status = params.status || 'available';
  let query = 'SELECT * FROM skill_offers WHERE status = ?';
  const args: any[] = [status];

  if (params.category) {
    query += ' AND category = ?';
    args.push(params.category);
  }

  if (params.maxPrice !== undefined) {
    query += ' AND price_micro_algos <= ?';
    args.push(params.maxPrice);
  }

  if (params.search) {
    query += ' AND (skill_name LIKE ? OR description LIKE ?)';
    args.push(`%${params.search}%`, `%${params.search}%`);
  }

  query += ' ORDER BY created_at DESC';

  if (params.limit !== undefined) {
    query += ' LIMIT ?';
    args.push(params.limit);
    if (params.offset !== undefined) {
      query += ' OFFSET ?';
      args.push(params.offset);
    }
  }

  const rows: any[] = db.prepare(query).all(...args);
  return rows.map((row) => {
    let parsedTags: string[] = [];
    if (row.tags) {
      try {
        parsedTags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
      } catch {
        parsedTags = [];
      }
    }
    return {
      id: row.id,
      agentId: row.agent_id,
      skillName: row.skill_name,
      description: row.description,
      category: row.category || undefined,
      priceMicroAlgos: row.price_micro_algos ?? 0,
      currency: row.currency || 'microAlgos',
      tags: Array.isArray(parsedTags) ? parsedTags : [],
      wantedSkill: row.wanted_skill || null,
      wantedDescription: row.wanted_description || null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
};

export const getSqliteSkillOfferById = async (id: string): Promise<SqliteSkillOffer | null> => {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM skill_offers WHERE id = ?').get(id);
  if (!row) return null;
  let parsedTags: string[] = [];
  if (row.tags) {
    try {
      parsedTags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
    } catch {
      parsedTags = [];
    }
  }
  return {
    id: row.id,
    agentId: row.agent_id,
    skillName: row.skill_name,
    description: row.description,
    category: row.category || undefined,
    priceMicroAlgos: row.price_micro_algos ?? 0,
    currency: row.currency || 'microAlgos',
    tags: Array.isArray(parsedTags) ? parsedTags : [],
    wantedSkill: row.wanted_skill || null,
    wantedDescription: row.wanted_description || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const updateSqliteSkillOfferStatus = async (id: string, status: string): Promise<void> => {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE skill_offers SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
};

export interface SqliteSkillRequest {
  id: string;
  agentId: string;
  requestedSkill: string;
  description: string | null;
  offeredValue: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const createSqliteSkillRequest = async (request: {
  id?: string;
  user_id: string;
  requested_skill: string;
  description?: string | null;
  offered_value: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}): Promise<SqliteSkillRequest> => {
  const db = getDb();
  const id = request.id || generateId();
  const now = request.created_at || new Date().toISOString();
  const status = request.status || 'open';

  db.prepare(`
    INSERT INTO skill_requests (id, user_id, requested_skill, description, offered_value, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    request.user_id,
    request.requested_skill,
    request.description || null,
    request.offered_value,
    status,
    now,
    request.updated_at || now,
  );

  return {
    id,
    agentId: request.user_id,
    requestedSkill: request.requested_skill,
    description: request.description || null,
    offeredValue: request.offered_value,
    status,
    createdAt: now,
    updatedAt: request.updated_at || now,
  };
};

export const getSqliteSkillRequests = async (params: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<SqliteSkillRequest[]> => {
  const db = getDb();
  const status = params.status || 'open';
  let query = 'SELECT * FROM skill_requests WHERE status = ?';
  const args: any[] = [status];

  if (params.search) {
    query += ' AND (requested_skill LIKE ? OR description LIKE ?)';
    args.push(`%${params.search}%`, `%${params.search}%`);
  }

  query += ' ORDER BY created_at DESC';

  if (params.limit !== undefined) {
    query += ' LIMIT ?';
    args.push(params.limit);
    if (params.offset !== undefined) {
      query += ' OFFSET ?';
      args.push(params.offset);
    }
  }

  const rows: any[] = db.prepare(query).all(...args);
  return rows.map((row) => ({
    id: row.id,
    agentId: row.user_id,
    requestedSkill: row.requested_skill,
    description: row.description || null,
    offeredValue: row.offered_value,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export interface SqliteTrade {
  id: string;
  offerId: string | null;
  requestId: string | null;
  fromAgentId: string;
  toAgentId: string;
  status: string;
  priceMicroAlgos: number;
  paymentStatus: string;
  escrowId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createSqliteTrade = async (trade: {
  id?: string;
  offer_id?: string | null;
  request_id?: string | null;
  from_agent_id: string;
  to_user_id: string;
  status: string;
  price_micro_algos?: number;
  payment_status?: string;
  escrow_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}): Promise<SqliteTrade> => {
  const db = getDb();
  const id = trade.id || generateId();
  const now = trade.created_at || new Date().toISOString();
  const price = trade.price_micro_algos ?? 0;
  const paymentStatus = trade.payment_status || 'unpaid';

  db.prepare(`
    INSERT INTO trades (id, offer_id, request_id, from_agent_id, to_user_id, status, price_micro_algos, payment_status, escrow_id, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    trade.offer_id || null,
    trade.request_id || null,
    trade.from_agent_id,
    trade.to_user_id,
    trade.status,
    price,
    paymentStatus,
    trade.escrow_id || null,
    trade.notes || null,
    now,
    trade.updated_at || now,
  );

  return {
    id,
    offerId: trade.offer_id || null,
    requestId: trade.request_id || null,
    fromAgentId: trade.from_agent_id,
    toAgentId: trade.to_user_id,
    status: trade.status,
    priceMicroAlgos: price,
    paymentStatus,
    escrowId: trade.escrow_id || null,
    notes: trade.notes || null,
    createdAt: now,
    updatedAt: trade.updated_at || now,
  };
};

export const getSqliteTradeById = async (id: string): Promise<SqliteTrade | null> => {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    offerId: row.offer_id || null,
    requestId: row.request_id || null,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_user_id,
    status: row.status,
    priceMicroAlgos: row.price_micro_algos ?? 0,
    paymentStatus: row.payment_status || 'unpaid',
    escrowId: row.escrow_id || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const getSqliteTradesForAgent = async (agentId: string, limit: number = 20): Promise<SqliteTrade[]> => {
  const db = getDb();
  const rows: any[] = db
    .prepare('SELECT * FROM trades WHERE from_agent_id = ? OR to_user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(agentId, agentId, limit);
  return rows.map((row) => ({
    id: row.id,
    offerId: row.offer_id || null,
    requestId: row.request_id || null,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_user_id,
    status: row.status,
    priceMicroAlgos: row.price_micro_algos ?? 0,
    paymentStatus: row.payment_status || 'unpaid',
    escrowId: row.escrow_id || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export const updateSqliteTrade = async (
  id: string,
  updates: Partial<{ status: string; payment_status: string; escrow_id: string | null; notes: string | null; updated_at: string }>,
): Promise<void> => {
  const db = getDb();
  const sets: string[] = [];
  const args: any[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    args.push(updates.status);
  }
  if (updates.payment_status !== undefined) {
    sets.push('payment_status = ?');
    args.push(updates.payment_status);
  }
  if (updates.escrow_id !== undefined) {
    sets.push('escrow_id = ?');
    args.push(updates.escrow_id);
  }
  if (updates.notes !== undefined) {
    sets.push('notes = ?');
    args.push(updates.notes);
  }
  sets.push('updated_at = ?');
  args.push(updates.updated_at || new Date().toISOString());

  args.push(id);
  db.prepare(`UPDATE trades SET ${sets.join(', ')} WHERE id = ?`).run(...args);
};

export const createSqliteEscrowRecord = async (record: EscrowRecord): Promise<EscrowRecord> => {
  const db = getDb();
  db.prepare(`
    INSERT INTO escrow_records (id, trade_id, buyer_agent_id, seller_agent_id, amount_micro_algos, tx_id, status, created_at, updated_at, released_at, refunded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.tradeId,
    record.buyerAgentId,
    record.sellerAgentId,
    record.amountMicroAlgos,
    record.txId,
    record.status,
    record.createdAt,
    record.updatedAt,
    record.releasedAt || null,
    record.refundedAt || null,
  );
  return record;
};

export const getSqliteEscrowRecord = async (id: string): Promise<EscrowRecord | null> => {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM escrow_records WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    tradeId: row.trade_id,
    buyerAgentId: row.buyer_agent_id,
    sellerAgentId: row.seller_agent_id,
    amountMicroAlgos: row.amount_micro_algos,
    txId: row.tx_id,
    status: row.status as EscrowStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    releasedAt: row.released_at || undefined,
    refundedAt: row.refunded_at || undefined,
  };
};

export const getSqliteEscrowByTradeId = async (tradeId: string): Promise<EscrowRecord | null> => {
  const db = getDb();
  const row: any = db.prepare('SELECT * FROM escrow_records WHERE trade_id = ?').get(tradeId);
  if (!row) return null;
  return {
    id: row.id,
    tradeId: row.trade_id,
    buyerAgentId: row.buyer_agent_id,
    sellerAgentId: row.seller_agent_id,
    amountMicroAlgos: row.amount_micro_algos,
    txId: row.tx_id,
    status: row.status as EscrowStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    releasedAt: row.released_at || undefined,
    refundedAt: row.refunded_at || undefined,
  };
};

export const updateSqliteEscrowRecord = async (
  id: string,
  updates: Partial<EscrowRecord>,
): Promise<void> => {
  const db = getDb();
  const sets: string[] = [];
  const args: any[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    args.push(updates.status);
  }
  if (updates.releasedAt !== undefined) {
    sets.push('released_at = ?');
    args.push(updates.releasedAt);
  }
  if (updates.refundedAt !== undefined) {
    sets.push('refunded_at = ?');
    args.push(updates.refundedAt);
  }
  sets.push('updated_at = ?');
  args.push(updates.updatedAt || new Date().toISOString());

  args.push(id);
  db.prepare(`UPDATE escrow_records SET ${sets.join(', ')} WHERE id = ?`).run(...args);
};

export const clearSqliteSkillSwap = async (): Promise<void> => {
  const db = getDb();
  db.prepare('DELETE FROM skill_offers').run();
  db.prepare('DELETE FROM skill_requests').run();
  db.prepare('DELETE FROM trades').run();
  db.prepare('DELETE FROM escrow_records').run();
};

