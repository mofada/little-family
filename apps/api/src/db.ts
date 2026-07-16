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

  CREATE TABLE IF NOT EXISTS web_login_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_web_login_codes_user
    ON web_login_codes(user_id, created_at);

  CREATE TABLE IF NOT EXISTS wechat_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('miniprogram', 'website')),
    openid TEXT NOT NULL,
    unionid TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, openid)
  );
  CREATE INDEX IF NOT EXISTS idx_wechat_identities_user
    ON wechat_identities(user_id);
  CREATE INDEX IF NOT EXISTS idx_wechat_identities_unionid
    ON wechat_identities(unionid);

  CREATE TABLE IF NOT EXISTS wechat_web_oauth_states (
    id TEXT PRIMARY KEY,
    state_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS member_link_requests (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    decided_by TEXT REFERENCES users(id),
    decided_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_member_link_requests_family_status
    ON member_link_requests(family_id, status, created_at);

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL CHECK(generation >= 1 AND generation <= 20),
    name TEXT NOT NULL,
    nickname TEXT,
    relation_label TEXT NOT NULL DEFAULT '',
    birth_year INTEGER,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'unknown')),
    birthday_type TEXT CHECK(birthday_type IN ('solar', 'lunar')),
    birth_month INTEGER CHECK(birth_month BETWEEN 1 AND 12),
    birth_day INTEGER CHECK(birth_day BETWEEN 1 AND 31),
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

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS birthday_subscription_grants (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'consumed', 'failed')),
    granted_at TEXT NOT NULL,
    consumed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_birthday_grants_active
    ON birthday_subscription_grants(family_id, user_id, status, granted_at);

  CREATE TABLE IF NOT EXISTS birthday_reminder_deliveries (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    member_names TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    UNIQUE(family_id, user_id, local_date)
  );

  CREATE TABLE IF NOT EXISTS kinship_labels (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    from_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    to_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('deepseek', 'heuristic')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(from_member_id <> to_member_id),
    UNIQUE(family_id, from_member_id, to_member_id)
  );
  CREATE INDEX IF NOT EXISTS idx_kinship_labels_lookup
    ON kinship_labels(family_id, from_member_id);
`)

// v1 removes the presentation-only "family branch" field and allows partial
// member profiles. SQLite cannot drop/check-change columns in place, so rebuild
// the table while foreign-key enforcement is temporarily suspended.
const memberColumns = db.prepare('PRAGMA table_info(members)').all() as unknown as Array<{
  name: string
  notnull: number
}>
const needsMemberV1Migration = memberColumns.some(column => column.name === 'branch_name')
  || memberColumns.some(column => ['birthday_type', 'birth_month', 'birth_day'].includes(column.name) && column.notnull === 1)

if (needsMemberV1Migration) {
  db.exec('PRAGMA foreign_keys = OFF;')
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE members_v1 (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        generation INTEGER NOT NULL CHECK(generation >= 1 AND generation <= 20),
        name TEXT NOT NULL,
        nickname TEXT,
        relation_label TEXT NOT NULL DEFAULT '',
        birth_year INTEGER,
        gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'unknown')),
        birthday_type TEXT CHECK(birthday_type IN ('solar', 'lunar')),
        birth_month INTEGER CHECK(birth_month BETWEEN 1 AND 12),
        birth_day INTEGER CHECK(birth_day BETWEEN 1 AND 31),
        is_leap_month INTEGER NOT NULL DEFAULT 0 CHECK(is_leap_month IN (0, 1)),
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO members_v1 (
        id, family_id, generation, name, nickname, relation_label, birth_year,
        gender, birthday_type, birth_month, birth_day, is_leap_month,
        created_by, created_at, updated_at
      )
      SELECT id, family_id, generation, name, nickname, relation_label, birth_year,
        gender, birthday_type, birth_month, birth_day, is_leap_month,
        created_by, created_at, updated_at
      FROM members;
      DROP TABLE members;
      ALTER TABLE members_v1 RENAME TO members;
      CREATE INDEX idx_members_family ON members(family_id);
      INSERT OR REPLACE INTO schema_migrations (version, applied_at)
      VALUES (1, datetime('now'));
      COMMIT;
    `)
  } catch (error) {
    try { db.exec('ROLLBACK;') } catch { /* transaction may already be closed */ }
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON;')
  }
} else {
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)')
    .run(new Date().toISOString())
}

db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?)')
  .run(new Date().toISOString())

db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)')
  .run(new Date().toISOString())

// Existing users were created through the mini program. Keep that identity
// explicit so a website OpenID can later be linked through the shared UnionID.
db.exec(`
  INSERT OR IGNORE INTO wechat_identities (
    id, user_id, provider, openid, unionid, created_at, updated_at
  )
  SELECT lower(hex(randomblob(16))), id, 'miniprogram', openid, unionid, created_at, updated_at
  FROM users
  WHERE openid NOT LIKE 'website:%';
`)

db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?)')
  .run(new Date().toISOString())

db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, ?)')
  .run(new Date().toISOString())
