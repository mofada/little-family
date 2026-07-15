import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config'

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true })

export const db = new DatabaseSync(config.databasePath)
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')

export const transaction = <T>(work: () => T): T => {
  db.exec('BEGIN IMMEDIATE;')
  try {
    const result = work()
    db.exec('COMMIT;')
    return result
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    openid TEXT NOT NULL UNIQUE,
    unionid TEXT,
    nickname TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS family_users (
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'editor', 'viewer')),
    linked_member_id TEXT,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (family_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_family_users_user ON family_users(user_id);

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    branch_name TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK(generation >= 1 AND generation <= 20),
    name TEXT NOT NULL,
    nickname TEXT,
    relation_label TEXT NOT NULL DEFAULT '',
    birth_year INTEGER,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
    birthday_type TEXT NOT NULL CHECK(birthday_type IN ('solar', 'lunar')),
    birth_month INTEGER NOT NULL CHECK(birth_month BETWEEN 1 AND 12),
    birth_day INTEGER NOT NULL CHECK(birth_day BETWEEN 1 AND 31),
    is_leap_month INTEGER NOT NULL DEFAULT 0 CHECK(is_leap_month IN (0, 1)),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_members_family ON members(family_id);

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    from_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    to_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('parent', 'spouse')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    CHECK(from_member_id <> to_member_id),
    UNIQUE(family_id, from_member_id, to_member_id, type)
  );
  CREATE INDEX IF NOT EXISTS idx_relationships_family ON relationships(family_id);

  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer')),
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_family_created ON audit_logs(family_id, created_at);
`)
