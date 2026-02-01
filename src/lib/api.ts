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
  story?: string;
  completed: boolean;
  status: ItemStatus;
  priority: Priority;
  tags: string[];
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

export interface HandoverNote {
  taskId: string;
  taskTitle: string;
  note: string;
  pausedBy: string;
  createdAt: string;
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
  handoverNotes?: HandoverNote[];  // Notes from paused tasks
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Epic types
export interface Epic {
  name: string;
  slug: string;
  description: string;
  tag: string;
  status: 'planning' | 'in-progress' | 'review' | 'complete';
  scope: string[];
  outOfScope: string[];
  overhaul: { task: string; done: boolean }[];
  filePath: string;
  createdAt: string;
}

export interface EpicWithProgress extends Epic {
  itemCount: number;
  completedCount: number;
  progress: number;
}

// Get the full spec
export async function getSpec(repoPath: string): Promise<ApiResponse<ParsedSpec>> {
  const res = await fetch(`${BASE_URL}/api/spec/full?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// Get all epics with progress
export async function getEpics(repoPath: string): Promise<ApiResponse<EpicWithProgress[]>> {
  const res = await fetch(`${BASE_URL}/api/epics?repoPath=${encodeURIComponent(repoPath)}`);
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

// Set session state manually
export async function setSessionState(repoPath: string, status: string, mode?: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, status, mode })
  });
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
export interface AddFeatureOptions {
  story?: string;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
  fileLink?: string;
}

export async function addFeature(
  repoPath: string,
  title: string,
  areaCode?: string,
  description?: string,
  tasks?: string[],
  metadata?: AddFeatureOptions
): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repoPath,
      title,
      areaCode,
      description,
      withWorkflow: true,
      tasks,
      ...metadata
    })
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

// Create a bug
export async function createBug(repoPath: string, title: string, description?: string, severity?: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/bugs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, description, severity })
  });
  return res.json();
}

// Polish a bug title with AI
export interface PolishedBug {
  original: string;
  polished: string;
  aiGenerated: boolean;
}

export async function polishBug(title: string): Promise<ApiResponse<PolishedBug>> {
  const res = await fetch(`${BASE_URL}/api/bugs/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
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
export async function editItem(repoPath: string, itemId: string, title?: string, description?: string, story?: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, title, description, story })
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

// Add a child item to an existing item
export async function addChildItem(repoPath: string, parentId: string, title: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/add-child`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, parentId, title })
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

// Set item tags
export async function setTags(repoPath: string, itemId: string, tags: string[]): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/spec/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemId, tags })
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
  polishedTitle: string;
  description: string;
  story: string;
  suggestedArea: string;
  tasks: string[];
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
// REMOVED FUNCTIONS (stubs for backwards compatibility)
// These were part of the proposal system that was deleted for simplification
// ============================================

export async function getAuditItems(repoPath: string): Promise<ApiResponse<any>> {
  return { success: true, data: [] };
}

export async function getFlaggedItems(repoPath: string, all?: boolean): Promise<ApiResponse<any>> {
  return { success: true, data: [] };
}

export async function getProposals(repoPath: string, all?: boolean): Promise<ApiResponse<any>> {
  return { success: true, data: [] };
}

export async function deviate(repoPath: string, title: string, areaCode?: string): Promise<ApiResponse<any>> {
  return { success: false, error: 'Use chkd add instead - deviate removed for simplification' };
}

export async function proposeChange(repoPath: string, type: string, title: string, options?: any): Promise<ApiResponse<any>> {
  return { success: false, error: 'Proposal system removed for simplification' };
}

export async function respondToProposal(repoPath: string, proposalId: string, response: string): Promise<ApiResponse<any>> {
  return { success: false, error: 'Proposal system removed for simplification' };
}

export async function captureForLater(repoPath: string, title: string, options?: any): Promise<ApiResponse<any>> {
  return { success: false, error: 'Capture system removed - use queue instead' };
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

// ============================================
// Attachments
// ============================================

export interface Attachment {
  filename: string;
  originalName: string;
  itemType: string;
  itemId: string;
  size: number;
  createdAt: string;
  path: string;
}

export async function getAttachments(repoPath: string, itemType?: string, itemId?: string): Promise<ApiResponse<Attachment[]>> {
  const params = new URLSearchParams({ repoPath });
  if (itemType) params.append('itemType', itemType);
  if (itemId) params.append('itemId', itemId);
  const res = await fetch(`${BASE_URL}/api/attachments?${params}`);
  return res.json();
}

export async function attachFile(repoPath: string, itemType: string, itemId: string, filePath: string): Promise<ApiResponse<Attachment>> {
  const res = await fetch(`${BASE_URL}/api/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, itemType, itemId, filePath })
  });
  return res.json();
}

export async function deleteAttachment(repoPath: string, filename: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/attachments`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, filename })
  });
  return res.json();
}

export async function uploadAttachment(repoPath: string, itemType: string, itemId: string, file: File): Promise<ApiResponse<Attachment>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('repoPath', repoPath);
  formData.append('itemType', itemType);
  formData.append('itemId', itemId);

  const res = await fetch(`${BASE_URL}/api/attachments/upload`, {
    method: 'POST',
    body: formData
  });
  return res.json();
}

// ============================================
// Quick Wins
// ============================================

export interface QuickWin {
  id: string;
  repoId: string;
  title: string;
  description: string | null;
  status: 'open' | 'done';
  createdAt: string;
  completedAt: string | null;
}

export async function getQuickWins(repoPath: string): Promise<ApiResponse<QuickWin[]>> {
  const res = await fetch(`${BASE_URL}/api/quickwins?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

export async function createQuickWin(repoPath: string, title: string, description?: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/quickwins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, title, description })
  });
  return res.json();
}

export async function completeQuickWin(repoPath: string, query: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/quickwins`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, query })
  });
  return res.json();
}

export async function deleteQuickWin(repoPath: string, id: string): Promise<ApiResponse<void>> {
  const res = await fetch(`${BASE_URL}/api/quickwins?repoPath=${encodeURIComponent(repoPath)}&id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return res.json();
}

export async function getItemDurations(repoPath: string): Promise<ApiResponse<Record<string, number>>> {
  const res = await fetch(`${BASE_URL}/api/spec/durations?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

// ============================================
// Anchor System (User-set task control)
// ============================================

export interface AnchorInfo {
  id: string;
  title: string;
  setAt: string | null;
  setBy: 'ui' | 'cli' | null;
}

export interface AnchorStatus {
  anchor: AnchorInfo | null;
  currentTask: { id: string; title: string; phase: number | null } | null;
  onTrack: boolean;
  status: string;
}

export async function getAnchor(repoPath: string): Promise<ApiResponse<AnchorStatus>> {
  const res = await fetch(`${BASE_URL}/api/session/anchor?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

export async function setAnchor(repoPath: string, taskId: string, taskTitle: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/anchor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, taskId, taskTitle, setBy: 'ui' })
  });
  return res.json();
}

export async function clearAnchor(repoPath: string): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/session/anchor`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath })
  });
  return res.json();
}

// ============================================
// Multi-Worker System
// ============================================

export type WorkerStatus = 'pending' | 'waiting' | 'working' | 'paused' | 'merging' | 'merged' | 'error' | 'cancelled';

export interface Worker {
  id: string;
  repoId: string;
  username: string;
  taskId: string | null;
  taskTitle: string | null;
  status: WorkerStatus;
  message: string | null;
  progress: number;
  worktreePath: string | null;
  branchName: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;
  nextTaskId: string | null;
  nextTaskTitle: string | null;
}

export type SignalType = 'decision' | 'help' | 'warning' | 'info';

export interface ManagerSignal {
  id: string;
  repoId: string;
  workerId: string | null;
  type: SignalType;
  message: string;
  details: Record<string, any> | null;
  actionRequired: boolean;
  actionOptions: string[] | null;
  createdAt: string;
  dismissedAt: string | null;
}

export async function getWorkers(repoPath: string): Promise<ApiResponse<Worker[]>> {
  const res = await fetch(`${BASE_URL}/api/workers?repoPath=${encodeURIComponent(repoPath)}`);
  return res.json();
}

export async function getWorker(workerId: string): Promise<ApiResponse<Worker>> {
  const res = await fetch(`${BASE_URL}/api/workers/${encodeURIComponent(workerId)}`);
  return res.json();
}

export async function spawnWorker(
  repoPath: string,
  taskId: string,
  taskTitle: string,
  nextTaskId?: string,
  nextTaskTitle?: string
): Promise<ApiResponse<Worker>> {
  const res = await fetch(`${BASE_URL}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, taskId, taskTitle, nextTaskId, nextTaskTitle })
  });
  return res.json();
}

export async function updateWorker(
  workerId: string,
  updates: { status?: WorkerStatus; message?: string; progress?: number }
): Promise<ApiResponse<Worker>> {
  const res = await fetch(`${BASE_URL}/api/workers/${encodeURIComponent(workerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function deleteWorker(workerId: string, force?: boolean): Promise<ApiResponse<void>> {
  const params = new URLSearchParams();
  if (force) params.append('force', 'true');
  const url = `${BASE_URL}/api/workers/${encodeURIComponent(workerId)}${params.toString() ? '?' + params : ''}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

export async function completeWorker(workerId: string, autoMerge?: boolean): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/workers/${encodeURIComponent(workerId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoMerge })
  });
  return res.json();
}

export async function resolveWorkerConflict(
  workerId: string,
  strategy: 'ours' | 'theirs' | 'abort',
  files?: string[]
): Promise<ApiResponse<any>> {
  const res = await fetch(`${BASE_URL}/api/workers/${encodeURIComponent(workerId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy, files })
  });
  return res.json();
}

// Signals API
export async function getSignals(repoPath: string, activeOnly?: boolean): Promise<ApiResponse<ManagerSignal[]>> {
  const params = new URLSearchParams({ repoPath });
  if (activeOnly) params.append('activeOnly', 'true');
  const res = await fetch(`${BASE_URL}/api/signals?${params}`);
  return res.json();
}

export async function dismissSignal(signalId: string): Promise<ApiResponse<void>> {
  const res = await fetch(`${BASE_URL}/api/signals/${encodeURIComponent(signalId)}`, {
    method: 'DELETE'
  });
  return res.json();
}

// ============================================
// Recent Activity
// ============================================

export interface RecentItem {
  id: string;
  title: string;
  timestamp: string;
  areaCode: string;
}

export interface RecentActivity {
  added: RecentItem[];
  completed: RecentItem[];
}

export async function getRecentActivity(repoPath: string, limit: number = 5): Promise<ApiResponse<RecentActivity>> {
  const res = await fetch(`${BASE_URL}/api/spec/recent?repoPath=${encodeURIComponent(repoPath)}&limit=${limit}`);
  return res.json();
}
