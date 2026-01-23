import { getDb } from './index.js';
import type {
  Repository,
  Bug,
  Settings,
  TaskSession,
  Worker,
  WorkerStatus,
  WorkerHistory,
  WorkerOutcome,
  ManagerSignal,
  SignalType
} from '$lib/types.js';
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
      anchor: null,
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

  // SQLite datetime('now') stores UTC, append 'Z' to parse correctly
  const startTime = row.start_time ? new Date(row.start_time + 'Z').getTime() : null;
  const now = Date.now();

  return {
    // For adhoc sessions (impromptu/debug), id can be null but title exists
    currentTask: (row.current_task_id || row.current_task_title) ? {
      id: row.current_task_id || null,
      title: row.current_task_title,
      phase: row.current_task_phase,
    } : null,
    currentItem: row.current_item_id ? {
      id: row.current_item_id,
      title: row.current_item_title,
      startTime: row.current_item_start_time,
    } : null,
    // Anchor: what USER says should be worked on (may differ from currentTask)
    anchor: row.anchor_task_id ? {
      id: row.anchor_task_id,
      title: row.anchor_task_title,
      setAt: row.anchor_set_at,
      setBy: row.anchor_set_by,
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
      current_item_id = NULL,
      current_item_title = NULL,
      current_item_start_time = NULL,
      status = 'building',
      mode = 'building',
      start_time = datetime('now'),
      iteration = 1,
      last_activity = datetime('now'),
      bug_fixes = '[]',
      scope_changes = '[]',
      deviations = '[]',
      files_changed = '[]',
      also_did = '[]',
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
      also_did = '[]',
      anchor_task_id = NULL,
      anchor_task_title = NULL,
      anchor_set_at = NULL,
      anchor_set_by = NULL,
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
  const sets: string[] = ['updated_at = datetime(\'now\')', 'last_activity = datetime(\'now\')'];
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
      sets.push('current_item_id = ?', 'current_item_title = ?', "current_item_start_time = datetime('now')");
      values.push(updates.currentItem.id, updates.currentItem.title);
    } else {
      sets.push('current_item_id = NULL', 'current_item_title = NULL', 'current_item_start_time = NULL');
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
// Anchor System - User-set task control
// ============================================

export function setAnchor(repoId: string, taskId: string, taskTitle: string, setBy: 'ui' | 'cli' = 'ui'): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET
      anchor_task_id = ?,
      anchor_task_title = ?,
      anchor_set_at = datetime('now'),
      anchor_set_by = ?,
      updated_at = datetime('now')
    WHERE repo_id = ?
  `).run(taskId, taskTitle, setBy, repoId);

  // If no session row exists, create one
  const changes = db.prepare(`SELECT changes() as c`).get() as any;
  if (changes.c === 0) {
    db.prepare(`
      INSERT INTO sessions (repo_id, anchor_task_id, anchor_task_title, anchor_set_at, anchor_set_by, status)
      VALUES (?, ?, ?, datetime('now'), ?, 'idle')
    `).run(repoId, taskId, taskTitle, setBy);
  }
}

export function clearAnchor(repoId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET
      anchor_task_id = NULL,
      anchor_task_title = NULL,
      anchor_set_at = NULL,
      anchor_set_by = NULL,
      updated_at = datetime('now')
    WHERE repo_id = ?
  `).run(repoId);
}

export function isOnTrack(repoId: string): { onTrack: boolean; anchor: any; current: any } {
  const session = getSession(repoId);

  // No anchor = no tracking
  if (!session.anchor) {
    return { onTrack: true, anchor: null, current: session.currentTask };
  }

  // Idle = not on track (should be working)
  if (session.status === 'idle') {
    return { onTrack: false, anchor: session.anchor, current: null };
  }

  // Check if current work matches anchor
  const currentId = session.currentTask?.id;
  const anchorId = session.anchor.id;

  // Direct match or current is a sub-item of anchor
  const onTrack = currentId === anchorId ||
    (currentId && anchorId && currentId.startsWith(anchorId));

  return { onTrack, anchor: session.anchor, current: session.currentTask };
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

export function updateBug(bugId: string, title: string, description: string | null, severity?: string): boolean {
  const db = getDb();

  if (severity) {
    const result = db.prepare(`
      UPDATE bugs
      SET title = ?, description = ?, severity = ?
      WHERE id = ?
    `).run(title, description, severity, bugId);
    return result.changes > 0;
  } else {
    const result = db.prepare(`
      UPDATE bugs
      SET title = ?, description = ?
      WHERE id = ?
    `).run(title, description, bugId);
    return result.changes > 0;
  }
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

// ============================================
// Item Durations
// ============================================

export function saveItemDuration(repoId: string, itemId: string, durationMs: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO item_durations (item_id, repo_id, duration_ms, completed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(item_id) DO UPDATE SET
      duration_ms = excluded.duration_ms,
      completed_at = datetime('now')
  `).run(itemId, repoId, durationMs);
}

export function getItemDurations(repoId: string): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT item_id, duration_ms FROM item_durations WHERE repo_id = ?
  `).all(repoId) as any[];

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.item_id] = row.duration_ms;
  }
  return result;
}

// ============================================
// Workers (Multi-Worker System)
// ============================================

function rowToWorker(row: any): Worker {
  const now = Date.now();
  const startedAt = row.started_at ? new Date(row.started_at + 'Z').getTime() : null;
  const heartbeatAt = row.heartbeat_at ? new Date(row.heartbeat_at + 'Z').getTime() : null;

  return {
    id: row.id,
    repoId: row.repo_id,
    username: row.username,
    taskId: row.task_id,
    taskTitle: row.task_title,
    status: row.status as WorkerStatus,
    message: row.message,
    progress: row.progress || 0,
    worktreePath: row.worktree_path,
    branchName: row.branch_name,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    heartbeatAt: row.heartbeat_at,
    nextTaskId: row.next_task_id,
    nextTaskTitle: row.next_task_title,
    // Computed
    elapsedMs: startedAt ? now - startedAt : 0,
    heartbeatAgoMs: heartbeatAt ? now - heartbeatAt : undefined,
  };
}

export function getWorkers(repoId: string): Worker[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM workers
    WHERE repo_id = ?
    ORDER BY created_at DESC
  `).all(repoId) as any[];

  return rows.map(rowToWorker);
}

export function getActiveWorkers(repoId: string): Worker[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM workers
    WHERE repo_id = ? AND status NOT IN ('merged', 'error')
    ORDER BY created_at DESC
  `).all(repoId) as any[];

  return rows.map(rowToWorker);
}

export function getWorkerById(workerId: string): Worker | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM workers WHERE id = ?`).get(workerId) as any;
  return row ? rowToWorker(row) : null;
}

export function getWorkerByTask(repoId: string, taskId: string): Worker | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM workers
    WHERE repo_id = ? AND task_id = ? AND status NOT IN ('merged', 'error')
  `).get(repoId, taskId) as any;
  return row ? rowToWorker(row) : null;
}

export function createWorker(data: {
  id: string;
  repoId: string;
  username: string;
  taskId?: string;
  taskTitle?: string;
  worktreePath?: string;
  branchName?: string;
  nextTaskId?: string;
  nextTaskTitle?: string;
}): Worker {
  const db = getDb();

  db.prepare(`
    INSERT INTO workers (
      id, repo_id, username, task_id, task_title,
      worktree_path, branch_name, next_task_id, next_task_title,
      status, progress
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
  `).run(
    data.id,
    data.repoId,
    data.username,
    data.taskId || null,
    data.taskTitle || null,
    data.worktreePath || null,
    data.branchName || null,
    data.nextTaskId || null,
    data.nextTaskTitle || null
  );

  return getWorkerById(data.id)!;
}

export function updateWorker(workerId: string, updates: {
  status?: WorkerStatus;
  message?: string;
  progress?: number;
  taskId?: string;
  taskTitle?: string;
  nextTaskId?: string | null;
  nextTaskTitle?: string | null;
}): Worker | null {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);

    // Set timing based on status
    if (updates.status === 'working') {
      sets.push("started_at = COALESCE(started_at, datetime('now'))");
    } else if (updates.status === 'merged' || updates.status === 'error') {
      sets.push("completed_at = datetime('now')");
    }
  }

  if (updates.message !== undefined) {
    sets.push('message = ?');
    values.push(updates.message);
  }

  if (updates.progress !== undefined) {
    sets.push('progress = ?');
    values.push(updates.progress);
  }

  if (updates.taskId !== undefined) {
    sets.push('task_id = ?');
    values.push(updates.taskId);
  }

  if (updates.taskTitle !== undefined) {
    sets.push('task_title = ?');
    values.push(updates.taskTitle);
  }

  if (updates.nextTaskId !== undefined) {
    sets.push('next_task_id = ?');
    values.push(updates.nextTaskId);
  }

  if (updates.nextTaskTitle !== undefined) {
    sets.push('next_task_title = ?');
    values.push(updates.nextTaskTitle);
  }

  if (sets.length === 0) return getWorkerById(workerId);

  // Always update heartbeat on any update
  sets.push("heartbeat_at = datetime('now')");

  values.push(workerId);
  db.prepare(`UPDATE workers SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getWorkerById(workerId);
}

export function updateWorkerHeartbeat(workerId: string, message?: string, progress?: number): Worker | null {
  const db = getDb();
  const sets = ["heartbeat_at = datetime('now')"];
  const values: any[] = [];

  if (message !== undefined) {
    sets.push('message = ?');
    values.push(message);
  }

  if (progress !== undefined) {
    sets.push('progress = ?');
    values.push(progress);
  }

  values.push(workerId);
  db.prepare(`UPDATE workers SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getWorkerById(workerId);
}

export function deleteWorker(workerId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM workers WHERE id = ?').run(workerId);
  return result.changes > 0;
}

export function countActiveWorkers(repoId: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM workers
    WHERE repo_id = ? AND status NOT IN ('merged', 'error')
  `).get(repoId) as any;
  return row?.count || 0;
}

// ============================================
// Worker History
// ============================================

export function createWorkerHistory(data: {
  workerId: string;
  repoId: string;
  taskId?: string;
  taskTitle?: string;
  branchName?: string;
  outcome: WorkerOutcome;
  mergeConflicts?: number;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  startedAt?: string;
  durationMs?: number;
}): void {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO worker_history (
      id, repo_id, worker_id, task_id, task_title, branch_name,
      outcome, merge_conflicts, files_changed, insertions, deletions,
      started_at, completed_at, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    id,
    data.repoId,
    data.workerId,
    data.taskId || null,
    data.taskTitle || null,
    data.branchName || null,
    data.outcome,
    data.mergeConflicts || 0,
    data.filesChanged || 0,
    data.insertions || 0,
    data.deletions || 0,
    data.startedAt || null,
    data.durationMs || null
  );
}

export function getWorkerHistory(repoId: string, limit: number = 50): WorkerHistory[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM worker_history
    WHERE repo_id = ?
    ORDER BY completed_at DESC
    LIMIT ?
  `).all(repoId, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    repoId: row.repo_id,
    workerId: row.worker_id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    branchName: row.branch_name,
    outcome: row.outcome as WorkerOutcome,
    mergeConflicts: row.merge_conflicts,
    filesChanged: row.files_changed,
    insertions: row.insertions,
    deletions: row.deletions,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  }));
}

// ============================================
// Manager Signals
// ============================================

export function createSignal(data: {
  repoId: string;
  type: SignalType;
  message: string;
  details?: Record<string, unknown>;
  workerId?: string;
  actionRequired?: boolean;
  actionOptions?: string[];
}): ManagerSignal {
  const db = getDb();
  const id = `signal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  db.prepare(`
    INSERT INTO manager_signals (
      id, repo_id, type, message, details, worker_id,
      action_required, action_options
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.repoId,
    data.type,
    data.message,
    data.details ? JSON.stringify(data.details) : null,
    data.workerId || null,
    data.actionRequired ? 1 : 0,
    data.actionOptions ? JSON.stringify(data.actionOptions) : null
  );

  return getSignalById(id)!;
}

export function getSignalById(signalId: string): ManagerSignal | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM manager_signals WHERE id = ?`).get(signalId) as any;

  if (!row) return null;

  return {
    id: row.id,
    repoId: row.repo_id,
    type: row.type as SignalType,
    message: row.message,
    details: row.details ? JSON.parse(row.details) : null,
    workerId: row.worker_id,
    dismissed: Boolean(row.dismissed),
    actionRequired: Boolean(row.action_required),
    actionOptions: row.action_options ? JSON.parse(row.action_options) : null,
    createdAt: row.created_at,
    dismissedAt: row.dismissed_at,
  };
}

export function getActiveSignals(repoId: string): ManagerSignal[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM manager_signals
    WHERE repo_id = ? AND dismissed = 0
    ORDER BY created_at DESC
  `).all(repoId) as any[];

  return rows.map(row => ({
    id: row.id,
    repoId: row.repo_id,
    type: row.type as SignalType,
    message: row.message,
    details: row.details ? JSON.parse(row.details) : null,
    workerId: row.worker_id,
    dismissed: Boolean(row.dismissed),
    actionRequired: Boolean(row.action_required),
    actionOptions: row.action_options ? JSON.parse(row.action_options) : null,
    createdAt: row.created_at,
    dismissedAt: row.dismissed_at,
  }));
}

export function dismissSignal(signalId: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE manager_signals
    SET dismissed = 1, dismissed_at = datetime('now')
    WHERE id = ?
  `).run(signalId);
  return result.changes > 0;
}

export function dismissAllSignals(repoId: string): number {
  const db = getDb();
  const result = db.prepare(`
    UPDATE manager_signals
    SET dismissed = 1, dismissed_at = datetime('now')
    WHERE repo_id = ? AND dismissed = 0
  `).run(repoId);
  return result.changes;
}
