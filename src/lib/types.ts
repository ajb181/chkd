// Workflow step with nested children (for spec task generation)
export interface WorkflowStep {
  task: string;
  children: string[];
}

// Complete feature spec for creating items with all required metadata
export interface FeatureSpec {
  title: string;
  description: string;
  userStory: string;
  keyRequirements: string[];
  filesToChange: string[];
  testing: string[];
  areaCode: 'SD' | 'FE' | 'BE' | 'FUT';
  phases?: WorkflowStep[];  // Optional - uses defaults if not provided
}

// Repository
export interface Repository {
  id: string;
  path: string;
  name: string;
  branch: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Session
export type SessionStatus = 'idle' | 'building' | 'ready_for_testing' | 'rework' | 'complete';
export type SessionMode = 'building' | 'debugging' | 'impromptu' | 'quickwin' | 'story' | 'reviewing' | null;

export interface TaskInfo {
  id: string | null;  // null for adhoc sessions (impromptu/debug)
  title: string;
  phase: number | null;
}

export interface ItemInfo {
  id: string;
  title: string;
  startTime?: string | null;  // When work started on this item
}

export interface AnchorInfo {
  id: string;
  title: string;
  setAt: string | null;
  setBy: 'ui' | 'cli' | null;
}

export interface TaskSession {
  currentTask: TaskInfo | null;
  currentItem: ItemInfo | null;  // item being worked on NOW
  anchor: AnchorInfo | null;     // User-set task anchor (may differ from currentTask)
  startTime: string | null;
  iteration: number;
  status: SessionStatus;
  mode: SessionMode;
  filesTouched: string[];
  bugFixes: { description: string; timestamp: string }[];
  scopeChanges: { type: string; title: string; timestamp: string }[];
  deviations: { request: string; handled: string; timestamp: string }[];
  alsoDid: string[];  // Off-plan work done during this task
  elapsedMs: number;
  lastActivity: string | null;
  repoPath?: string;
}

// Settings
export interface Settings {
  hasApiKey: boolean;
  defaultBranch: string;
}

// Bug
export interface Bug {
  id: string;
  repoId: string;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'bug' | 'hotfix';
  status: 'open' | 'in_progress' | 'fixed' | 'wont_fix';
  affectedPhase: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== MULTI-WORKER SYSTEM =====

// Worker status state machine:
// pending -> waiting -> working -> (paused <-> working) -> merging -> merged
//                                                      \-> error
export type WorkerStatus = 'pending' | 'waiting' | 'working' | 'paused' | 'merging' | 'merged' | 'error';

// Worker instance
export interface Worker {
  id: string;                    // 'worker-{username}-{timestamp}-{random4}'
  repoId: string;
  username: string;

  // Assignment
  taskId: string | null;
  taskTitle: string | null;

  // Status
  status: WorkerStatus;
  message: string | null;        // Last status message
  progress: number;              // 0-100

  // Git
  worktreePath: string | null;
  branchName: string | null;

  // Timing
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;

  // Queue
  nextTaskId: string | null;
  nextTaskTitle: string | null;

  // Computed (for UI)
  elapsedMs?: number;
  heartbeatAgoMs?: number;
}

// Worker history entry (audit trail)
export type WorkerOutcome = 'merged' | 'aborted' | 'error';

export interface WorkerHistory {
  id: string;
  repoId: string;
  workerId: string;

  // What was done
  taskId: string | null;
  taskTitle: string | null;
  branchName: string | null;

  // Outcome
  outcome: WorkerOutcome;
  mergeConflicts: number;
  filesChanged: number;
  insertions: number;
  deletions: number;

  // Timing
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

// Manager signal types
export type SignalType = 'status' | 'decision' | 'help' | 'suggestion' | 'warning';

export interface ManagerSignal {
  id: string;
  repoId: string;

  // Content
  type: SignalType;
  message: string;
  details: Record<string, unknown> | null;  // JSON parsed

  // Related worker
  workerId: string | null;

  // State
  dismissed: boolean;
  actionRequired: boolean;
  actionOptions: string[] | null;  // JSON parsed

  // Timing
  createdAt: string;
  dismissedAt: string | null;
}

// API types for worker management
export interface SpawnWorkerRequest {
  repoPath: string;
  taskId: string;
  taskTitle: string;
  username?: string;
  nextTaskId?: string;
  nextTaskTitle?: string;
}

export interface SpawnWorkerResponse {
  workerId: string;
  worktreePath: string;
  branchName: string;
  command: string;  // e.g., 'cd ../myproject-worker-1 && claude'
}

export interface WorkerHeartbeatRequest {
  message?: string;
  progress?: number;
}

export interface WorkerHeartbeatResponse {
  status: WorkerStatus;
  shouldPause: boolean;
  shouldAbort: boolean;
  nextTask?: {
    taskId: string;
    taskTitle: string;
  };
}

export interface WorkerCompleteResponse {
  mergeStatus: 'clean' | 'conflicts' | 'pending';
  conflicts?: ConflictInfo[];
  nextTask?: {
    taskId: string;
    taskTitle: string;
  };
}

export interface ConflictInfo {
  file: string;
  type: 'content' | 'deleted' | 'renamed';
  oursContent?: string;   // First ~10 lines
  theirsContent?: string; // First ~10 lines
  conflictLines: number;
}

// ===== SPEC ITEMS (DB-FIRST) =====

export type ItemStatus = 'open' | 'in-progress' | 'done' | 'skipped' | 'blocked';
export type ItemPriority = 'low' | 'medium' | 'high' | 'critical';
export type AreaCode = 'SD' | 'FE' | 'BE' | 'FUT' | 'BUG';

export interface SpecItem {
  id: string;                       // UUID
  repoId: string;
  displayId: string;                // 'SD.37' or 'SD.37.1'

  // Content
  title: string;
  description: string | null;
  story: string | null;
  keyRequirements: string[];        // JSON parsed
  filesToChange: string[];          // JSON parsed
  testing: string[];                // JSON parsed

  // Classification
  areaCode: AreaCode;
  sectionNumber: number;
  workflowType: string | null;      // 'quickwin', 'refactor', 'audit', 'remove', or null for default

  // Hierarchy
  parentId: string | null;          // UUID of parent
  sortOrder: number;

  // Status
  status: ItemStatus;
  priority: ItemPriority;
  reviewCompleted: boolean;

  // Tags (populated separately)
  tags?: string[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  repoId: string;
  displayId: string;
  title: string;
  description?: string;
  story?: string;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
  areaCode: AreaCode;
  sectionNumber: number;
  workflowType?: string;
  parentId?: string;
  sortOrder?: number;
  status?: ItemStatus;
  priority?: ItemPriority;
}

export interface UpdateItemInput {
  title?: string;
  description?: string | null;
  story?: string | null;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
  status?: ItemStatus;
  priority?: ItemPriority;
  sortOrder?: number;
}

export interface ItemProgress {
  total: number;
  done: number;
  percent: number;
}
