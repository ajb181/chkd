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
export type SessionMode = 'building' | 'debugging' | 'story' | 'reviewing' | null;

export interface TaskInfo {
  id: string;
  title: string;
  phase: number | null;
}

export interface TaskSession {
  currentTask: TaskInfo | null;
  startTime: string | null;
  iteration: number;
  status: SessionStatus;
  mode: SessionMode;
  filesTouched: string[];
  bugFixes: { description: string; timestamp: string }[];
  scopeChanges: { type: string; title: string; timestamp: string }[];
  deviations: { request: string; handled: string; timestamp: string }[];
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
