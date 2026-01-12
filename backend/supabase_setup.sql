-- Supabase Database Schema for Sia AI Meeting Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Hosts Table
CREATE TABLE hosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rooms Table
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    context TEXT,
    knowledge_base JSONB DEFAULT '{}',
    tone VARCHAR(50) DEFAULT 'professional', -- professional, strict, casual
    invite_link VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Participants Table
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) UNIQUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active', -- active, waiting, completed, left
    CONSTRAINT fk_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Sessions Table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    transcript JSONB DEFAULT '[]',
    CONSTRAINT fk_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    CONSTRAINT fk_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Queue Table
CREATE TABLE queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    position INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'waiting', -- waiting, accepted, declined, expired
    accepted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    CONSTRAINT fk_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_rooms_host_id ON rooms(host_id);
CREATE INDEX idx_rooms_invite_link ON rooms(invite_link);
CREATE INDEX idx_participants_room_id ON participants(room_id);
CREATE INDEX idx_participants_session_id ON participants(session_id);
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);
CREATE INDEX idx_sessions_room_id ON sessions(room_id);
CREATE INDEX idx_queue_room_id ON queue(room_id);
CREATE INDEX idx_queue_status ON queue(status);
CREATE INDEX idx_queue_position ON queue(position);

-- Enable Row Level Security (RLS)
-- Note: For now, we'll use permissive policies since we're using custom JWT auth
-- These can be tightened later when Supabase Auth is integrated
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Permissive for custom auth - will be refined later)
-- For custom JWT auth, we'll handle authorization in the API layer

-- Allow all operations for now (will be secured via API JWT tokens)
-- Hosts table - allow all for authenticated users (handled in API)
CREATE POLICY "Allow all hosts operations" ON hosts
    FOR ALL USING (true) WITH CHECK (true);

-- Rooms - allow all (authorization handled in API)
CREATE POLICY "Allow all rooms operations" ON rooms
    FOR ALL USING (true) WITH CHECK (true);

-- Participants - allow all (authorization handled in API)
CREATE POLICY "Allow all participants operations" ON participants
    FOR ALL USING (true) WITH CHECK (true);

-- Sessions - allow all (authorization handled in API)
CREATE POLICY "Allow all sessions operations" ON sessions
    FOR ALL USING (true) WITH CHECK (true);

-- Queue - allow all (authorization handled in API)
CREATE POLICY "Allow all queue operations" ON queue
    FOR ALL USING (true) WITH CHECK (true);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_hosts_updated_at BEFORE UPDATE ON hosts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique invite links
CREATE OR REPLACE FUNCTION generate_invite_link()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..16 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get next queue position
CREATE OR REPLACE FUNCTION get_next_queue_position(p_room_id UUID)
RETURNS INTEGER AS $$
DECLARE
    max_position INTEGER;
BEGIN
    SELECT COALESCE(MAX(position), 0) INTO max_position
    FROM queue
    WHERE room_id = p_room_id AND status = 'waiting';
    RETURN max_position + 1;
END;
$$ LANGUAGE plpgsql;
