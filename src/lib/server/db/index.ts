import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

let db: Database.Database | null = null;

// Default data directory
const DATA_DIR = path.join(os.homedir(), '.chkd');

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const dbPath = path.join(DATA_DIR, 'chkd.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  initSchema(db);
  runMigrations(db);

  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- Repositories being tracked
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Settings (API key, etc)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Story discussions for pre-flight clarification
    CREATE TABLE IF NOT EXISTS story_discussions (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      phase_number INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(repo_id, phase_number)
    );

    CREATE TABLE IF NOT EXISTS discussion_messages (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL REFERENCES story_discussions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,  -- 'user' | 'assistant'
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_discussion_messages_discussion_id ON discussion_messages(discussion_id);

    -- Documents uploaded for discussion context
    CREATE TABLE IF NOT EXISTS discussion_documents (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL REFERENCES story_discussions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      mime_type TEXT DEFAULT 'text/plain',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_discussion_documents_discussion_id ON discussion_documents(discussion_id);

    -- Bugs and hotfixes
    CREATE TABLE IF NOT EXISTS bugs (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL DEFAULT 'medium',  -- 'critical' | 'high' | 'medium' | 'low'
      type TEXT NOT NULL DEFAULT 'bug',         -- 'bug' | 'hotfix'
      status TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'in_progress' | 'fixed' | 'wont_fix'
      affected_phase INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bugs_repo_id ON bugs(repo_id);
    CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);

    -- Quick wins (small improvements)
    CREATE TABLE IF NOT EXISTS quick_wins (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'done'
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_quick_wins_repo_id ON quick_wins(repo_id);
    CREATE INDEX IF NOT EXISTS idx_quick_wins_status ON quick_wins(status);

    -- Item durations (time spent on each checklist item)
    CREATE TABLE IF NOT EXISTS item_durations (
      item_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_item_durations_repo_id ON item_durations(repo_id);

    -- Session state (survives restart)
    CREATE TABLE IF NOT EXISTS sessions (
      repo_id TEXT PRIMARY KEY,
      current_task_id TEXT,
      current_task_title TEXT,
      current_task_phase INTEGER,
      current_item_id TEXT,      -- item Claude is working on NOW
      current_item_title TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      mode TEXT,
      start_time TEXT,
      iteration INTEGER NOT NULL DEFAULT 0,
      last_activity TEXT,
      bug_fixes TEXT,       -- JSON array
      scope_changes TEXT,   -- JSON array
      deviations TEXT,      -- JSON array
      files_changed TEXT,   -- JSON array
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Add columns if they don't exist (migration for existing DBs)
    -- SQLite doesn't support IF NOT EXISTS for columns, so we handle this in code

    -- Search history
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_path TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_search_history_repo ON search_history(repo_path);
  `);
}

function runMigrations(db: Database.Database): void {
  // Check if current_item_id column exists
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as any[];
  const columnNames = tableInfo.map(c => c.name);

  if (!columnNames.includes('current_item_id')) {
    db.exec(`
      ALTER TABLE sessions ADD COLUMN current_item_id TEXT;
      ALTER TABLE sessions ADD COLUMN current_item_title TEXT;
    `);
  }

  if (!columnNames.includes('also_did')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN also_did TEXT;`);
  }

  if (!columnNames.includes('current_item_start_time')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN current_item_start_time TEXT;`);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
