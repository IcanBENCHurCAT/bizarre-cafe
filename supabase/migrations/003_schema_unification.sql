-- Migration: 003_schema_unification.sql

CREATE TABLE IF NOT EXISTS shop_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    item_id UUID,
    quantity INTEGER,
    total_amount INTEGER,
    currency TEXT,
    payment_method TEXT,
    status TEXT,
    x402_promise_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS skill_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    agent_id UUID,
    requested_skill TEXT,
    description TEXT,
    offered_value TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_id UUID,
    request_id UUID,
    from_agent_id UUID,
    to_user_id UUID,
    to_agent_id UUID,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS trade_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID,
    to_user_id UUID,
    offer_details TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS cafe_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    description TEXT,
    type TEXT,
    max_attendees INTEGER,
    location TEXT,
    host_id UUID,
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID,
    status TEXT,
    user_id UUID,
    joined_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    left_at TIMESTAMP WITH TIME ZONE,
    attended_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS verification_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT,
    user_id UUID,
    challenge TEXT,
    proof TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS verification_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS agent_verification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    agent_id UUID,
    is_verified BOOLEAN,
    status TEXT,
    method TEXT,
    did_document TEXT,
    wallet_address TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS owner_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID,
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    agent_id UUID,
    triggered_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS lore_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT,
    content TEXT,
    category TEXT,
    discovered BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS payment_promises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS x402_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
