// API client for chkd backend

const BASE_URL = '';  // Same origin

export interface SpecArea {
  name: string;
  code: string;
  status: 'complete' | 'in-progress' | 'pending';
  items: SpecItem[];
  line: number;
  story?: string;
}

export type ItemStatus = 'open' | 'in-progress' | 'done' | 'skipped';
export type Priority = 1 | 2 | 3 | null;  // P1=High, P2=Medium, P3=Low, null=Backlog

export interface SpecItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  status: ItemStatus;
  priority: Priority;
  children: SpecItem[];
  line: number;
}

export interface ParsedSpec {
  title: string;
  areas: SpecArea[];
  totalItems: number;
  completedItems: number;
  progress: number;
}

export interface Session {
  currentTask: {
    id: string;
    title: string;
    phase: number | null;
  } | null;
  currentItem: {
    id: string;
    title: string;
  } | null;
  status: 'idle' | 'building' | 'ready_for_testing' | 'rework' | 'complete';
  startTime: string | null;
  elapsedMs: number;
  iteration: number;
  lastActivity: string | null;
  alsoDid: string[];  // Off-plan work done during this task
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Get the full spec
export async function getSpec(repoPath: string): Promise<ApiResponse<ParsedSpec>> {
  const res = await fetch(`${BASE_URL}/api/spec/full?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// Get current status (human-friendly)
export async function getStatus(repoPath: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/status?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// Get current session
export async function getSession(repoPath: string): Promise<ApiResponse<Session | null>> {
  const res = await fetch(`${BASE_URL}/api/session?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// Start a task
export async function startTask(repoPath: string, taskQuery: string): Promise<ApiResponse<Session>> {
  const res = await fetch(`${BASE_URL}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, taskQuery })
  });
  return res.json();
}

// Complete a task
export async function completeTask(repoPath: string): Promise<ApiResponse<void>> {
  const res = await fetch(`${BASE_URL}/api/session/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath })
  });
  return res.json();
}

// Toggle item completion
export async function tickItem(repoPath: string, itemQuery: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemQuery })
  });
  return res.json();
}

// Add a feature with workflow template
export async function addFeature(repoPath: string, title: string, areaCode?: string, description?: string, tasks?: string[]): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, areaCode, description, withWorkflow: true, tasks })
  });
  return res.json();
}

// Duplicate detection
export interface DuplicateMatch {
  item: {
    id: string;
    title: string;
    description: string;
    status: string;
  };
  area: {
    code: string;
    name: string;
  };
  similarity: number;
  matchType: 'exact' | 'similar' | 'keyword';
}

export interface DuplicateCheckResult {
  query: string;
  matches: DuplicateMatch[];
  hasDuplicates: boolean;
}

export async function checkDuplicates(repoPath: string, title: string): Promise<ApiResponse<DuplicateCheckResult>> {
  const res = await fetch(`${BASE_URL}/api/spec/duplicates?repoPath=${encodeURIComponent(repoPath)}&title=${encodeURIComponent(title)}`);
  return res.json();
}

// Bug interface
export interface Bug {
  id: string;
  repoId: string;
  title: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'fixed' | 'wont_fix';
  learnings?: string;
  createdAt: string;
  resolvedAt?: string;
}

// Get bugs
export async function getBugs(repoPath: string): Promise<ApiResponse<Bug[]>> {
  const res = await fetch(`${BASE_URL}/api/bugs?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// Update bug status (fix/close)
export async function updateBug(repoPath: string, bugQuery: string, status: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/bugs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, bugQuery, status })
  });
  return res.json();
}

// Skip an item
export async function skipItem(repoPath: string, itemId: string, skip: boolean = true): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, skip })
  });
  return res.json();
}

// Mark item in progress
export async function markInProgress(repoPath: string, itemId: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/in-progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId })
  });
  return res.json();
}

// Signal Claude is working on an item
export async function workingOn(repoPath: string, itemId: string, itemTitle: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/working-on`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, itemTitle })
  });
  return res.json();
}

// Log off-plan work ("also did")
export async function logAlsoDid(repoPath: string, description: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/also-did`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, description })
  });
  return res.json();
}

// Edit an item's title and/or description
export async function editItem(repoPath: string, itemId: string, title?: string, description?: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, title, description })
  });
  return res.json();
}

// Delete an item
export async function deleteItem(repoPath: string, itemId: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId })
  });
  return res.json();
}

// Move an item to a different area
export async function moveItem(repoPath: string, itemId: string, targetAreaCode: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, targetAreaCode })
  });
  return res.json();
}

// Set item priority (1=High, 2=Medium, 3=Low, null=Backlog)
export async function setPriority(repoPath: string, itemId: string, priority: Priority): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, priority })
  });
  return res.json();
}

// Repository management
export interface Repository {
  id: string;
  path: string;
  name: string;
  branch: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Get all repositories
export async function getRepos(): Promise<ApiResponse<Repository[]>> {
  const res = await fetch(`${BASE_URL}/api/repos`);
  return res.json();
}

// Add a new repository
export async function addRepo(path: string, name?: string, branch?: string): Promise<ApiResponse<Repository>> {
  const res = await fetch(`${BASE_URL}/api/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name, branch })
  });
  return res.json();
}

// Smart feature expansion
export interface ExpandedFeature {
  title: string;
  description: string;
  story: string;
  suggestedArea: string;
  aiGenerated: boolean;
}

export async function expandFeature(repoPath: string, title: string, areaCode?: string): Promise<ApiResponse<ExpandedFeature>> {
  const res = await fetch(`${BASE_URL}/api/spec/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, areaCode })
  });
  return res.json();
}

// Add feature to specific area
export async function addFeatureToArea(repoPath: string, title: string, areaCode: string, description?: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, areaCode, description, withWorkflow: true })
  });
  return res.json();
}

// ============================================
// Proposal System
// ============================================

// Quick add off-plan item (deviate)
export async function deviate(repoPath: string, title: string, areaCode?: string, setAsCurrent?: boolean): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/deviate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, areaCode, setAsCurrent })
  });
  return res.json();
}

// Propose a scope change (needs approval for big changes)
export async function proposeChange(
  repoPath: string,
  type: 'add' | 'modify' | 'remove',
  title: string,
  options?: { description?: string; reason?: string; size?: 'small' | 'big'; areaCode?: string }
): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/propose-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, type, title, ...options })
  });
  return res.json();
}

// Respond to a proposal
export async function respondToProposal(
  repoPath: string,
  proposalId: string,
  response: 'approve' | 'reject' | 'send-to-chkd'
): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/respond-to-proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, proposalId, response })
  });
  return res.json();
}

// Get pending proposals
export async function getProposals(repoPath: string, all?: boolean): Promise<ApiResponse<any>> {
  const url = `${BASE_URL}/api/session/proposals?repoPath=${encodeURIComponent(repoPath)}${all ? '&all=true' : ''}`;
  const res = await fetch(url);
  return res.json();
}

// Get flagged items
export async function getFlaggedItems(repoPath: string, all?: boolean): Promise<ApiResponse<any>> {
  const url = `${BASE_URL}/api/session/flagged?repoPath=${encodeURIComponent(repoPath)}${all ? '&all=true' : ''}`;
  const res = await fetch(url);
  return res.json();
}

// Capture something for later
export async function captureForLater(
  repoPath: string,
  title: string,
  options?: { description?: string; type?: string; urgency?: string }
): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/flagged`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, ...options })
  });
  return res.json();
}

// Get audit items
export async function getAuditItems(repoPath: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/audit?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// ============================================
// Queue System (user adds while Claude works)
// ============================================

export interface QueueItem {
  id: string;
  title: string;
  createdAt: string;
}

export async function getQueue(repoPath: string): Promise<ApiResponse<{ items: QueueItem[]; count: number }>> {
  const res = await fetch(`${BASE_URL}/api/session/queue?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

export async function addToQueue(repoPath: string, title: string): Promise<ApiResponse<{ item: QueueItem }>> {
  const res = await fetch(`${BASE_URL}/api/session/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title })
  });
  return res.json();
}

export async function removeFromQueue(repoPath: string, itemId: string): Promise<ApiResponse<void>> {
  const res = await fetch(`${BASE_URL}/api/session/queue?repoPath=${encodeURIComponent(repoPath)}&id=${encodeURIComponent(itemId)}`, {
    method: 'DELETE'
  });
  return res.json();
}
