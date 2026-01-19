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
      startTime: null,
      iteration: 0,
      status: 'idle',
      mode: null,
      filesTouched: [],
      bugFixes: [],
      scopeChanges: [],
      deviations: [],
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
    startTime: row.start_time,
    iteration: row.iteration || 0,
    status: row.status || 'idle',
    mode: row.mode || null,
    filesTouched: [],
    bugFixes: JSON.parse(row.bug_fixes || '[]'),
    scopeChanges: JSON.parse(row.scope_changes || '[]'),
    deviations: JSON.parse(row.deviations || '[]'),
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
