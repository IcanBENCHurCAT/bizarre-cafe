-- Migration 002: Visual Memory State

CREATE TABLE IF NOT EXISTS cafe_visual_state (
    entity_id VARCHAR(255) NOT NULL,
    attribute VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_id, attribute)
);

CREATE TABLE IF NOT EXISTS canned_responses (
    id VARCHAR(255) PRIMARY KEY,
    content TEXT NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
