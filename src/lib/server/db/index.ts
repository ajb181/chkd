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
      -- Anchor system: what USER says should be worked on (may differ from current_task)
      anchor_task_id TEXT,
      anchor_task_title TEXT,
      anchor_set_at TEXT,
      anchor_set_by TEXT,   -- 'ui' or 'cli'
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

    -- ===== MULTI-WORKER SYSTEM =====

    -- Active worker instances
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,                    -- 'worker-{username}-{timestamp}-{random4}'
      repo_id TEXT NOT NULL,                  -- FK to repositories table
      username TEXT NOT NULL,                 -- 'alex' (for multi-user ready)

      -- Assignment
      task_id TEXT,                           -- 'SD.3' (spec item ID)
      task_title TEXT,                        -- 'User Authentication'

      -- Status
      status TEXT NOT NULL DEFAULT 'pending', -- pending|waiting|working|paused|merging|merged|error
      message TEXT,                           -- Last status message from worker
      progress INTEGER DEFAULT 0,             -- 0-100 percentage

      -- Git
      worktree_path TEXT,                     -- '../myproject-alex-1'
      branch_name TEXT,                       -- 'feature/alex/sd3-user-auth'

      -- Timing
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,                        -- When worker actually started
      completed_at TEXT,                      -- When task completed
      heartbeat_at TEXT,                      -- Last heartbeat (detect dead workers)

      -- Queue
      next_task_id TEXT,                      -- Pre-assigned next task
      next_task_title TEXT,

      FOREIGN KEY (repo_id) REFERENCES repositories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_workers_repo_status ON workers(repo_id, status);
    CREATE INDEX IF NOT EXISTS idx_workers_heartbeat ON workers(heartbeat_at);
    CREATE INDEX IF NOT EXISTS idx_workers_username ON workers(username);

    -- Completed worker sessions (audit trail)
    CREATE TABLE IF NOT EXISTS worker_history (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,                -- Original worker ID

      -- What was done
      task_id TEXT,
      task_title TEXT,
      branch_name TEXT,

      -- Outcome
      outcome TEXT NOT NULL,                  -- merged|aborted|error
      merge_conflicts INTEGER DEFAULT 0,      -- Number of conflicts
      files_changed INTEGER DEFAULT 0,
      insertions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,

      -- Timing
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,                    -- Total time

      FOREIGN KEY (repo_id) REFERENCES repositories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_worker_history_repo ON worker_history(repo_id);
    CREATE INDEX IF NOT EXISTS idx_worker_history_worker ON worker_history(worker_id);

    -- Messages from manager to user
    CREATE TABLE IF NOT EXISTS manager_signals (
      id TEXT PRIMARY KEY,                    -- 'signal-{timestamp}-{random4}'
      repo_id TEXT NOT NULL,

      -- Content
      type TEXT NOT NULL,                     -- status|decision|help|suggestion|warning
      message TEXT NOT NULL,
      details TEXT,                           -- JSON: additional context

      -- Related worker (optional)
      worker_id TEXT,                         -- Which worker this relates to

      -- State
      dismissed INTEGER DEFAULT 0,            -- User dismissed this signal
      action_required INTEGER DEFAULT 0,      -- Needs user input
      action_options TEXT,                    -- JSON: available actions

      -- Timing
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      dismissed_at TEXT,

      FOREIGN KEY (repo_id) REFERENCES repositories(id),
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_signals_repo_active ON manager_signals(repo_id, dismissed);
    CREATE INDEX IF NOT EXISTS idx_signals_worker ON manager_signals(worker_id);

    -- ===== SPEC ITEMS (DB-FIRST) =====

    -- Spec items (replaces SPEC.md parsing)
    CREATE TABLE IF NOT EXISTS spec_items (
      id TEXT PRIMARY KEY,              -- UUID
      repo_id TEXT NOT NULL,
      display_id TEXT NOT NULL,         -- 'SD.37' or 'SD.37.1' for sub-items

      -- Content
      title TEXT NOT NULL,
      description TEXT,                 -- Description after the title
      story TEXT,                       -- User story text
      key_requirements TEXT,            -- JSON array
      files_to_change TEXT,             -- JSON array
      testing TEXT,                     -- JSON array

      -- Classification
      area_code TEXT NOT NULL,          -- 'SD', 'FE', 'BE', 'FUT'
      section_number INTEGER NOT NULL,  -- 37 from SD.37
      workflow_type TEXT,               -- 'quickwin', 'refactor', 'audit', 'remove', or NULL for default

      -- Hierarchy
      parent_id TEXT,                   -- UUID of parent, NULL for top-level
      sort_order INTEGER DEFAULT 0,     -- For ordering items/sub-items

      -- Status
      status TEXT NOT NULL DEFAULT 'open',  -- open, in-progress, done, skipped, blocked
      priority TEXT DEFAULT 'medium',        -- low, medium, high, critical

      -- Timestamps
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),

      FOREIGN KEY (repo_id) REFERENCES repositories(id),
      FOREIGN KEY (parent_id) REFERENCES spec_items(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_items_display ON spec_items(repo_id, display_id);
    CREATE INDEX IF NOT EXISTS idx_spec_items_repo_status ON spec_items(repo_id, status);
    CREATE INDEX IF NOT EXISTS idx_spec_items_repo_area ON spec_items(repo_id, area_code);
    CREATE INDEX IF NOT EXISTS idx_spec_items_parent ON spec_items(parent_id);
    CREATE INDEX IF NOT EXISTS idx_spec_items_repo_priority ON spec_items(repo_id, priority);

    -- Tags for spec items (junction table)
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (item_id, tag),
      FOREIGN KEY (item_id) REFERENCES spec_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag);

    -- Learnings capture (prototype: capture context from conversations)
    CREATE TABLE IF NOT EXISTS learnings (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      text TEXT NOT NULL,                     -- The learning itself
      category TEXT,                          -- e.g., 'preference', 'pattern', 'mistake', 'decision'
      context TEXT,                           -- What was happening when this was captured
      source TEXT DEFAULT 'mcp',              -- How it was captured: 'mcp', 'ui', 'auto'
      relevance_score REAL DEFAULT 1.0,       -- For future ranking
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (repo_id) REFERENCES repositories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_learnings_repo ON learnings(repo_id);
    CREATE INDEX IF NOT EXISTS idx_learnings_category ON learnings(category);
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

  // Anchor system migration
  if (!columnNames.includes('anchor_task_id')) {
    db.exec(`
      ALTER TABLE sessions ADD COLUMN anchor_task_id TEXT;
      ALTER TABLE sessions ADD COLUMN anchor_task_title TEXT;
      ALTER TABLE sessions ADD COLUMN anchor_set_at TEXT;
      ALTER TABLE sessions ADD COLUMN anchor_set_by TEXT;
    `);
  }

  // Multi-worker system migration
  if (!columnNames.includes('worker_id')) {
    db.exec(`
      ALTER TABLE sessions ADD COLUMN worker_id TEXT;
      ALTER TABLE sessions ADD COLUMN is_master INTEGER DEFAULT 0;
    `);
  }

  // Workflow type migration for spec_items
  const specItemsInfo = db.prepare("PRAGMA table_info(spec_items)").all() as any[];
  const specItemsCols = specItemsInfo.map(c => c.name);
  if (!specItemsCols.includes('workflow_type')) {
    db.exec(`ALTER TABLE spec_items ADD COLUMN workflow_type TEXT;`);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
