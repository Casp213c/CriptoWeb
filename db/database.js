const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'cryptoterminal.db'));
db.pragma('journal_mode = WAL');

// ══════════════════════════════════════════════
// TABELA: users
// ══════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name         TEXT NOT NULL,
    birth_year        INTEGER,
    phone             TEXT,
    postal_code       TEXT,
    email             TEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,

    role              TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    plan              TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'premium'
    analyses_used     INTEGER NOT NULL DEFAULT 0,
    analyses_reset_at TEXT,

    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    premium_since           TEXT,
    premium_until            TEXT,

    accepted_terms_at TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Garante que instalações antigas (sem a coluna role) sejam atualizadas
try { db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS analysis_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    type        TEXT NOT NULL,
    symbol      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS deletion_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

// ══════════════════════════════════════════════
// TABELA: password_resets — log de auditoria de resets manuais
// ══════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    reset_at    TEXT NOT NULL DEFAULT (datetime('now')),
    method      TEXT NOT NULL DEFAULT 'admin_endpoint'
  );
`);

// ══════════════════════════════════════════════
// TABELA: password_reset_tokens — tokens de uso único para o fluxo
// "Esqueci minha senha" via email, com expiração de 1 hora
// ══════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    token       TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    used_at     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ══════════════════════════════════════════════
// SEED — cria/atualiza a conta admin geral automaticamente
// ══════════════════════════════════════════════
function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrador';

  if (!email || !password) {
    console.log('⚠️  ADMIN_EMAIL ou ADMIN_PASSWORD não definidos — pulando criação de admin.');
    return;
  }

  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
  const passwordHash = bcrypt.hashSync(password, 12);

  if (!existing) {
    db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, plan, accepted_terms_at)
      VALUES (?, ?, ?, 'admin', 'premium', datetime('now'))
    `).run(name, email, passwordHash);
    console.log(`✅ Conta ADMIN criada: ${email}`);
  } else if (existing.role !== 'admin') {
    db.prepare(`UPDATE users SET role = 'admin', plan = 'premium', password_hash = ? WHERE id = ?`).run(passwordHash, existing.id);
    console.log(`✅ Conta existente promovida a ADMIN: ${email}`);
  } else {
    console.log(`ℹ️  Conta ADMIN já existente: ${email}`);
  }
}

seedAdmin();

module.exports = db;
