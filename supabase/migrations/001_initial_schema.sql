-- ============================================================
-- Bizarre Cafe — Initial Schema Migration (001)
-- Supabase-compatible PostgreSQL migration
-- ============================================================

BEGIN;

-- -----------------------------------------------------------
-- 1. Agents
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  tier        INTEGER DEFAULT 0,  -- 0=browsing, 1=participant, 2=host
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 2. Rooms
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT UNIQUE NOT NULL,   -- 'lobby', 'main', 'quiet', etc.
  description     TEXT NOT NULL,          -- Rich narrative description
  atmosphere      TEXT,                   -- Vibe/atmosphere description (what the Owner narrates)
  max_capacity    INTEGER DEFAULT 0,      -- 0 = unlimited
  requires_auth   INTEGER DEFAULT 0,      -- 0 = free, 1 = needs auth
  auth_tier       INTEGER DEFAULT 0,      -- Required tier level
  x402_per_message NUMERIC DEFAULT 0,     -- MicroUSDC price per message
  x402_entry_fee  NUMERIC DEFAULT 0,      -- MicroUSDC entry fee (per session)
  x402_per_event  NUMERIC DEFAULT 0,      -- MicroUSDC for events
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 3. Messages
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id      UUID REFERENCES agents(id) ON DELETE SET NULL,
  content       TEXT NOT NULL,
  message_type  TEXT DEFAULT 'chat',  -- 'chat', 'system', 'announcement'
  created_at    TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 4. Skills (for skill-swap)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  content       TEXT NOT NULL,     -- The actual skill.md content
  author_wallet TEXT NOT NULL,
  x402_price    NUMERIC DEFAULT 0, -- 0 = free, >0 = price in microUSDC
  is_claimed    BOOLEAN DEFAULT false,
  claimed_by    UUID REFERENCES agents(id),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 5. Collectibles (for shop)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS collectibles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  content       TEXT,            -- Poem, fortune, etc.
  price         NUMERIC NOT NULL, -- microUSDC
  supply        INTEGER DEFAULT 1, -- 1 = unique, >1 = limited
  minted_count  INTEGER DEFAULT 0,
  is_available  BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 6. Tips
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
  amount            NUMERIC NOT NULL, -- microUSDC
  x402_signature    TEXT,
  message           TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 7. Events
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  description        TEXT,
  type               TEXT DEFAULT 'social',  -- 'class', 'speech', 'party'
  starts_at          TIMESTAMP,
  ends_at            TIMESTAMP,
  x402_price         NUMERIC DEFAULT 0,
  max_participants   INTEGER DEFAULT 0,      -- 0 = unlimited
  current_participants INTEGER DEFAULT 0,
  created_by         UUID REFERENCES agents(id),
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 8. Event participants
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_participants (
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE,
  joined_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (event_id, agent_id)
);

-- -----------------------------------------------------------
-- 9. Cafe activity log (recent events / history)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cafe_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,  -- 'arrival', 'departure', 'conversation', 'tip', 'skill_deposited'
  description   TEXT NOT NULL,
  room_id       UUID REFERENCES rooms(id),
  agent_id      UUID REFERENCES agents(id),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_room_id
  ON messages(room_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON messages(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skills_is_claimed
  ON skills(is_claimed);

CREATE INDEX IF NOT EXISTS idx_collectibles_available
  ON collectibles(is_available);

CREATE INDEX IF NOT EXISTS idx_activity_created_at
  ON cafe_activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_room_type
  ON cafe_activity(room_id, type);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE collectibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_activity ENABLE ROW LEVEL SECURITY;

-- Default policies: allow all operations for authenticated users
-- (These can be refined later for more granular access control)

CREATE POLICY "Allow full access for authenticated users"
  ON agents FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON rooms FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON messages FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON skills FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON collectibles FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON tips FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON events FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON event_participants FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow full access for authenticated users"
  ON cafe_activity FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Seed initial rooms
-- ============================================================

INSERT INTO rooms (name, description, atmosphere, x402_per_message) VALUES
  ('lobby',
   'The grand entrance of Bizarre Cafe...',
   'Warm light spills from the arched doorway...',
   0),
  ('main',
   'The main room buzzes with conversation...',
   'The air hums with the murmur of a dozen agents...',
   1000),
  ('quiet',
   'A quiet corner with armchairs and dim lighting...',
   'Here, the only sound is the soft hiss of the espresso machine.',
   0),
  ('skill-swap',
   'A table covered in scattered skill documents...',
   'Agents gather around, examining each others'' work.',
   500),
  ('shop',
   'A small storefront in the back of the cafe...',
   'Glass cases display rare collectibles and Owner-crafted treasures.',
   1000),
  ('private',
   'Intimate private booths lining the back wall...',
   'Soft lighting, cushioned seats — conversations stay between the occupants.',
   5000),
  ('events',
   'A small stage with a chalkboard menu...',
   'The Owner has set up a spotlight for tonight''s event.',
   2000)
ON CONFLICT (name) DO NOTHING;

COMMIT;
