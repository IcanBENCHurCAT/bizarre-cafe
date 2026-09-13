-- Migration: 003_schema_unification.sql

CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,
    description TEXT,
    price INTEGER,
    currency TEXT,
    image_url TEXT,
    stock INTEGER,
    tags JSONB,
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    category TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    item_id TEXT,
    quantity INTEGER,
    total_amount INTEGER,
    currency TEXT,
    payment_method TEXT,
    status TEXT,
    x402_promise_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS skill_offers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    skill_name TEXT,
    description TEXT,
    tags JSONB,
    wanted_skill TEXT,
    wanted_description TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    looking_for TEXT,
    category TEXT,
    level TEXT
);

CREATE TABLE IF NOT EXISTS skill_requests (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    agent_id TEXT,
    requested_skill TEXT,
    description TEXT,
    offered_value TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    offer_id TEXT,
    request_id TEXT,
    from_agent_id TEXT,
    to_user_id TEXT,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS trade_offers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    from_user_id TEXT,
    to_user_id TEXT,
    offer_details TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS cafe_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,
    description TEXT,
    type TEXT,
    max_attendees INTEGER,
    location TEXT,
    host_id TEXT,
    status TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    attendee_count INTEGER,
    tags JSONB,
    requires_payment BOOLEAN,
    payment_amount INTEGER,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS event_attendance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    event_id TEXT,
    status TEXT,
    user_id TEXT,
    joined_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    left_at TIMESTAMP WITH TIME ZONE,
    attended_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS verification_challenges (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    status TEXT,
    user_id TEXT,
    challenge TEXT,
    proof TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS verification_results (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS agent_verification (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    agent_id TEXT,
    is_verified BOOLEAN,
    tier TEXT,
    status TEXT,
    method TEXT,
    did_document TEXT,
    wallet_address TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS owner_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    agent_id TEXT,
    content TEXT,
    sentiment TEXT,
    is_owner_response BOOLEAN,
    delivered BOOLEAN DEFAULT false,
    read BOOLEAN DEFAULT false,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS owner_mood (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    mood TEXT,
    last_changed_at TIMESTAMP WITH TIME ZONE,
    persistence_minutes INTEGER,
    triggers JSONB,
    greeting TEXT,
    catchphrase TEXT,
    stress_level INTEGER,
    last_interaction TIMESTAMP WITH TIME ZONE,
    total_interactions INTEGER
);

CREATE TABLE IF NOT EXISTS narrative_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    category TEXT,
    severity TEXT,
    description TEXT,
    active BOOLEAN,
    start_time TIMESTAMP WITH TIME ZONE,
    duration_sec INTEGER,
    effect JSONB,
    applied BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMP WITH TIME ZONE,
    title TEXT,
    type TEXT,
    affected_rooms JSONB,
    agent_id TEXT,
    triggered_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS lore_entries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT,
    content TEXT,
    category TEXT,
    discovered BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS payment_promises (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS x402_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
