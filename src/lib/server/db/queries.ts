import { getDb } from './index.js';
import type { Repository, Bug, Settings, TaskSession } from '$lib/types.js';
import crypto from 'crypto';

// ============================================
// Repositories
// ============================================

export function getAllRepos(): Repository[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, path, name, branch, enabled, created_at, updated_at
    FROM repositories
    ORDER BY name
  `).all() as any[];

  return rows.map(row => ({
    id: row.id,
    path: row.path,
    name: row.name,
    branch: row.branch,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getRepoById(id: string): Repository | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, path, name, branch, enabled, created_at, updated_at
    FROM repositories WHERE id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    path: row.path,
    name: row.name,
    branch: row.branch,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getRepoByPath(path: string): Repository | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, path, name, branch, enabled, created_at, updated_at
    FROM repositories WHERE path = ?
  `).get(path) as any;

  if (!row) return null;

  return {
    id: row.id,
    path: row.path,
    name: row.name,
    branch: row.branch,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRepo(path: string, name: string, branch: string = 'main'): Repository {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO repositories (id, path, name, branch, enabled)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, path, name, branch);

  return getRepoById(id)!;
}

export function updateRepo(id: string, data: { enabled?: boolean; branch?: string }): Repository | null {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }
  if (data.branch !== undefined) {
    updates.push('branch = ?');
    values.push(data.branch);
  }

  if (updates.length === 0) return getRepoById(id);

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE repositories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return getRepoById(id);
}

export function deleteRepo(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM repositories WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================
// Settings
// ============================================

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getSettings(): Settings {
  return {
    hasApiKey: Boolean(getSetting('anthropic_api_key')),
    defaultBranch: getSetting('default_branch') || 'main',
  };
}

// ============================================
// Session
// ============================================

export function getSession(repoId: string): TaskSession {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM sessions WHERE repo_id = ?
  `).get(repoId) as any;

  if (!row) {
    return {
      currentTask: null,
      currentItem: null,
      startTime: null,
      iteration: 0,
      status: 'idle',
      mode: null,
      filesTouched: [],
      bugFixes: [],
      scopeChanges: [],
      deviations: [],
      alsoDid: [],
      elapsedMs: 0,
      lastActivity: null,
    };
  }

  const startTime = row.start_time ? new Date(row.start_time).getTime() : null;
  const now = Date.now();

  return {
    currentTask: row.current_task_id ? {
      id: row.current_task_id,
      title: row.current_task_title,
      phase: row.current_task_phase,
    } : null,
    currentItem: row.current_item_id ? {
      id: row.current_item_id,
      title: row.current_item_title,
    } : null,
    startTime: row.start_time,
    iteration: row.iteration || 0,
    status: row.status || 'idle',
    mode: row.mode || null,
    filesTouched: [],
    bugFixes: JSON.parse(row.bug_fixes || '[]'),
    scopeChanges: JSON.parse(row.scope_changes || '[]'),
    deviations: JSON.parse(row.deviations || '[]'),
    alsoDid: JSON.parse(row.also_did || '[]'),
    elapsedMs: startTime ? now - startTime : 0,
    lastActivity: row.last_activity,
  };
}

export function startSession(repoId: string, taskId: string, taskTitle: string, phaseNumber: number | null): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sessions (repo_id, current_task_id, current_task_title, current_task_phase, status, mode, start_time, iteration, last_activity)
    VALUES (?, ?, ?, ?, 'building', 'building', datetime('now'), 1, datetime('now'))
    ON CONFLICT(repo_id) DO UPDATE SET
      current_task_id = excluded.current_task_id,
      current_task_title = excluded.current_task_title,
      current_task_phase = excluded.current_task_phase,
      status = 'building',
      mode = 'building',
      start_time = datetime('now'),
      iteration = 1,
      last_activity = datetime('now'),
      bug_fixes = '[]',
      scope_changes = '[]',
      deviations = '[]',
      files_changed = '[]',
      updated_at = datetime('now')
  `).run(repoId, taskId, taskTitle, phaseNumber);
}

export function clearSession(repoId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET
      current_task_id = NULL,
      current_task_title = NULL,
      current_task_phase = NULL,
      status = 'idle',
      mode = NULL,
      start_time = NULL,
      iteration = 0,
      bug_fixes = '[]',
      scope_changes = '[]',
      deviations = '[]',
      files_changed = '[]',
      updated_at = datetime('now')
    WHERE repo_id = ?
  `).run(repoId);
}

export function updateSession(repoId: string, updates: {
  currentTask?: { id: string; title: string; phase: number | null } | null;
  currentItem?: { id: string; title: string } | null;
  status?: string;
  mode?: string | null;
  iteration?: number;
  startTime?: string | null;
}): void {
  const db = getDb();
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const values: any[] = [];

  if (updates.currentTask !== undefined) {
    if (updates.currentTask) {
      sets.push('current_task_id = ?', 'current_task_title = ?', 'current_task_phase = ?');
      values.push(updates.currentTask.id, updates.currentTask.title, updates.currentTask.phase);
    } else {
      sets.push('current_task_id = NULL', 'current_task_title = NULL', 'current_task_phase = NULL');
    }
  }

  if (updates.currentItem !== undefined) {
    if (updates.currentItem) {
      sets.push('current_item_id = ?', 'current_item_title = ?');
      values.push(updates.currentItem.id, updates.currentItem.title);
    } else {
      sets.push('current_item_id = NULL', 'current_item_title = NULL');
    }
  }

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }

  if (updates.mode !== undefined) {
    sets.push('mode = ?');
    values.push(updates.mode);
  }

  if (updates.iteration !== undefined) {
    sets.push('iteration = ?');
    values.push(updates.iteration);
  }

  if (updates.startTime !== undefined) {
    sets.push('start_time = ?');
    values.push(updates.startTime);
  }

  values.push(repoId);

  db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE repo_id = ?`).run(...values);
}

export function addAlsoDid(repoId: string, description: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT also_did FROM sessions WHERE repo_id = ?`).get(repoId) as any;

  const alsoDid = JSON.parse(row?.also_did || '[]');
  alsoDid.push(description);

  db.prepare(`UPDATE sessions SET also_did = ?, last_activity = datetime('now') WHERE repo_id = ?`)
    .run(JSON.stringify(alsoDid), repoId);
}

export function clearAlsoDid(repoId: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET also_did = '[]' WHERE repo_id = ?`).run(repoId);
}

// ============================================
// Bugs
// ============================================

export function getBugs(repoId: string): Bug[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM bugs WHERE repo_id = ? ORDER BY created_at DESC
  `).all(repoId) as any[];

  return rows.map(row => ({
    id: row.id,
    repoId: row.repo_id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    type: row.type,
    status: row.status,
    affectedPhase: row.affected_phase,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

export function createBug(repoId: string, title: string, description?: string, severity: string = 'medium'): Bug {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO bugs (id, repo_id, title, description, severity)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, repoId, title, description || null, severity);

  return getBugs(repoId).find(b => b.id === id)!;
}

export function updateBugStatus(bugId: string, status: string): boolean {
  const db = getDb();

  const resolvedAt = status === 'fixed' || status === 'wont_fix'
    ? "datetime('now')"
    : 'NULL';

  const result = db.prepare(`
    UPDATE bugs
    SET status = ?, resolved_at = ${resolvedAt}
    WHERE id = ?
  `).run(status, bugId);

  return result.changes > 0;
}

export function getBugByQuery(repoId: string, query: string): Bug | null {
  const bugs = getBugs(repoId);
  const queryLower = query.toLowerCase();

  // Try exact ID match first (short ID)
  const byId = bugs.find(b => b.id.startsWith(query));
  if (byId) return byId;

  // Try title match
  const byTitle = bugs.find(b => b.title.toLowerCase().includes(queryLower));
  return byTitle || null;
}
