-- Migration number: 0001 	 2023-11-30T00:00:00.000Z
-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Google ID or UUID
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user', -- 'admin', 'user'
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_login INTEGER
);

-- Create Index on Email for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
