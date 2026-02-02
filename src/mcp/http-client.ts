/**
 * HTTP client for MCP server to communicate with SvelteKit API
 *
 * This replaces direct database access to avoid sync issues between processes.
 * The MCP server now acts as a client to the SvelteKit API.
 *
 * Port configuration:
 * - Default: 3848 (stable) - keeps other projects working
 * - Set CHKD_PORT=3847 when developing chkd itself
 */

export const PORT = process.env.CHKD_PORT ? parseInt(process.env.CHKD_PORT, 10) : 3848;
export const BASE_URL = `http://localhost:${PORT}`;

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  hint?: string;
}

/**
 * Make a request to the SvelteKit API
 */
async function request<T = any>(
  method: string,
  path: string,
  body?: any,
  params?: Record<string, string>
): Promise<ApiResponse<T>> {
  try {
    let url = `${BASE_URL}${path}`;

    // Add query params
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    return data;
  } catch (error) {
    // Server not running or connection error
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return {
        success: false,
        error: `chkd web server not running on port ${PORT}`,
        hint: `Start it with: npm run dev`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ============================================
// Session API
// ============================================

export async function getSession(repoPath: string) {
  return request('GET', '/api/session', undefined, { repoPath });
}

export async function clearSession(repoPath: string) {
  return request('PATCH', '/api/session', { repoPath, status: 'idle' });
}

export async function startAdhocSession(
  repoPath: string,
  type: 'impromptu' | 'debug',
  description: string
) {
  return request('POST', '/api/session/adhoc', { repoPath, type, description });
}

export async function addAlsoDid(repoPath: string, description: string) {
  return request('POST', '/api/session/also-did', { repoPath, description });
}

// ============================================
// Anchor API
// ============================================

export async function getAnchor(repoPath: string) {
  return request('GET', '/api/session/anchor', undefined, { repoPath });
}

export async function setAnchor(
  repoPath: string,
  taskId: string,
  taskTitle: string,
  setBy: 'ui' | 'cli'
) {
  return request('POST', '/api/session/anchor', { repoPath, taskId, taskTitle, setBy });
}

export async function clearAnchor(repoPath: string) {
  return request('DELETE', '/api/session/anchor', { repoPath });
}

// ============================================
// Queue API
// ============================================

export async function getQueue(repoPath: string) {
  return request('GET', '/api/session/queue', undefined, { repoPath });
}

// ============================================
// Bugs API
// ============================================

export async function getBugs(repoPath: string) {
  return request('GET', '/api/bugs', undefined, { repoPath });
}

export async function createBug(
  repoPath: string,
  title: string,
  description?: string,
  severity?: string
) {
  return request('POST', '/api/bugs', { repoPath, title, description, severity });
}

export async function updateBug(repoPath: string, bugQuery: string, status: string) {
  return request('PATCH', '/api/bugs', { repoPath, bugQuery, status });
}

export async function getBugByQuery(repoPath: string, query: string) {
  const response = await getBugs(repoPath);
  if (!response.success || !response.data) {
    return null;
  }

  const bugs = response.data as any[];
  const lowerQuery = query.toLowerCase();

  // Try to match by ID prefix first
  const byId = bugs.find(b => b.id.toLowerCase().startsWith(lowerQuery));
  if (byId) return byId;

  // Then try exact title match
  const byExactTitle = bugs.find(b => b.title.toLowerCase() === lowerQuery);
  if (byExactTitle) return byExactTitle;

  // Finally try partial title match
  return bugs.find(b => b.title.toLowerCase().includes(lowerQuery));
}

// ============================================
// Spec API
// ============================================

export async function tickItem(repoPath: string, itemQuery: string) {
  return request('POST', '/api/spec/tick', { repoPath, itemQuery });
}

export async function markInProgress(repoPath: string, itemQuery: string) {
  return request('POST', '/api/spec/in-progress', { repoPath, itemQuery });
}

export interface AddFeatureOptions {
  title: string;
  areaCode: string;
  description?: string;
  story?: string;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
  fileLink?: string;  // Link to detailed design doc, Figma, etc.
  // tasks removed - chkd always uses standard workflow
  // withWorkflow removed - always true
}

export async function addFeature(
  repoPath: string,
  title: string,
  areaCode: string,
  description?: string
) {
  return request('POST', '/api/spec/add', {
    repoPath,
    title,
    areaCode,
    description,
    withWorkflow: true  // Always uses standard workflow with checkpoints
  });
}

export async function addFeatureWithMetadata(
  repoPath: string,
  opts: AddFeatureOptions
) {
  return request('POST', '/api/spec/add', {
    repoPath,
    title: opts.title,
    areaCode: opts.areaCode,
    description: opts.description,
    story: opts.story,
    keyRequirements: opts.keyRequirements,
    filesToChange: opts.filesToChange,
    testing: opts.testing,
    fileLink: opts.fileLink,
    withWorkflow: true  // Always uses standard workflow with checkpoints
  });
}

export async function addChildItem(repoPath: string, parentId: string, title: string) {
  return request('POST', '/api/spec/add-child', { repoPath, parentId, title });
}

export async function setTags(repoPath: string, itemId: string, tags: string[]) {
  return request('POST', '/api/spec/tags', { repoPath, itemId, tags });
}

export async function deleteItem(repoPath: string, itemId: string) {
  return request('POST', '/api/spec/delete', { repoPath, itemId });
}

export async function checkItemTbc(repoPath: string, item: string) {
  return request('GET', '/api/spec/check-tbc', undefined, { repoPath, item });
}

export async function editItem(
  repoPath: string,
  itemId: string,
  updates: {
    title?: string;
    description?: string;
    story?: string;
    keyRequirements?: string[];
    filesToChange?: string[];
    testing?: string[];
  }
) {
  return request('POST', '/api/spec/edit', { repoPath, itemId, ...updates });
}

// ============================================
// Quick Wins API
// ============================================

export async function getQuickWins(repoPath: string) {
  return request('GET', '/api/quickwins', undefined, { repoPath });
}

export async function createQuickWin(repoPath: string, title: string) {
  return request('POST', '/api/quickwins', { repoPath, title });
}

export async function completeQuickWin(repoPath: string, query: string) {
  return request('PATCH', '/api/quickwins', { repoPath, query });
}

// ============================================
// Attachments API
// ============================================

export async function getAttachments(repoPath: string, itemType?: string, itemId?: string) {
  const params: Record<string, string> = { repoPath };
  if (itemType) params.itemType = itemType;
  if (itemId) params.itemId = itemId;
  return request('GET', '/api/attachments', undefined, params);
}

export async function attachFile(
  repoPath: string,
  itemType: string,
  itemId: string,
  filePath: string
) {
  return request('POST', '/api/attachments', { repoPath, itemType, itemId, filePath });
}

export async function deleteAttachment(repoPath: string, filename: string) {
  return request('DELETE', '/api/attachments', { repoPath, filename });
}

// ============================================
// Repository API
// ============================================

export async function getRepoByPath(repoPath: string): Promise<ApiResponse & { repo?: any }> {
  const response = await request('GET', '/api/repos');
  if (!response.success) {
    // Return the error response (e.g., server not running)
    return response;
  }
  if (response.data) {
    const repos = response.data as any[];
    const repo = repos.find(r => r.path === repoPath);
    return { success: true, repo };
  }
  return { success: true, repo: undefined };
}

export async function createRepo(repoPath: string, name: string, branch?: string): Promise<ApiResponse> {
  return request('POST', '/api/repos', { path: repoPath, name, branch });
}

// ============================================
// Workers API (Multi-Worker System)
// ============================================

export async function getWorkers(repoPath: string) {
  return request('GET', '/api/workers', undefined, { repoPath });
}

export async function spawnWorker(
  repoPath: string,
  taskId: string,
  taskTitle: string,
  username?: string,
  nextTaskId?: string,
  nextTaskTitle?: string
) {
  return request('POST', '/api/workers', {
    repoPath,
    taskId,
    taskTitle,
    username,
    nextTaskId,
    nextTaskTitle
  });
}

export async function getWorker(workerId: string) {
  return request('GET', `/api/workers/${workerId}`);
}

export async function getWorkerByWorktreePath(worktreePath: string) {
  return request('GET', '/api/workers', undefined, { worktreePath });
}

export async function updateWorker(
  workerId: string,
  updates: {
    status?: string;
    message?: string;
    progress?: number;
    heartbeat?: boolean;
  }
) {
  return request('PATCH', `/api/workers/${workerId}`, updates);
}

export async function deleteWorker(workerId: string, force?: boolean, deleteBranch?: boolean) {
  const params: Record<string, string> = {};
  if (force) params.force = 'true';
  if (deleteBranch) params.deleteBranch = 'true';
  return request('DELETE', `/api/workers/${workerId}`, undefined, params);
}

export async function completeWorker(workerId: string, autoMerge?: boolean, commitMessage?: string) {
  return request('POST', `/api/workers/${workerId}/complete`, {
    autoMerge: autoMerge ?? true,
    commitMessage
  });
}

export async function workerHeartbeat(
  workerId: string,
  message?: string,
  progress?: number
) {
  return request('PATCH', `/api/workers/${workerId}`, {
    heartbeat: true,
    message,
    progress
  });
}

export async function checkWorkerStatus(workerId: string) {
  return request('GET', `/api/workers/${workerId}`);
}

export async function getDeadWorkers(repoPath: string, thresholdMs?: number) {
  const params: Record<string, string> = { repoPath };
  if (thresholdMs) params.thresholdMs = String(thresholdMs);
  return request('GET', '/api/workers/dead', undefined, params);
}

// ============================================
// Epics API
// ============================================

export async function getEpics(repoPath: string) {
  return request('GET', '/api/epics', undefined, { repoPath });
}

export async function createEpic(
  repoPath: string,
  name: string,
  description: string,
  scope?: string[]
) {
  return request('POST', '/api/epics', { repoPath, name, description, scope });
}

export async function updateEpicStatus(
  repoPath: string,
  query: string,
  status: 'planning' | 'in-progress' | 'review' | 'complete'
) {
  return request('PATCH', '/api/epics', { repoPath, query, status });
}

// ============================================
// Spec Items API (DB-First)
// ============================================

export async function getSpecItems(repoPath: string, options?: {
  status?: string;
  area?: string;
  query?: string;
  topLevel?: boolean;
  withProgress?: boolean;
  withChildren?: boolean;
}) {
  const params: Record<string, string> = { repoPath };
  if (options?.status) params.status = options.status;
  if (options?.area) params.area = options.area;
  if (options?.query) params.query = options.query;
  if (options?.topLevel) params.topLevel = 'true';
  if (options?.withProgress) params.withProgress = 'true';
  if (options?.withChildren) params.withChildren = 'true';
  return request('GET', '/api/spec/items', undefined, params);
}

export async function getSpecProgress(repoPath: string, area?: string) {
  const params: Record<string, string> = { repoPath, withProgress: 'true' };
  if (area) params.area = area;
  return request('GET', '/api/spec/items', undefined, params);
}

export async function findSpecItem(repoPath: string, query: string) {
  return request('GET', '/api/spec/items', undefined, {
    repoPath,
    query,
    withChildren: 'true'
  });
}

// ============================================
// Learnings API (Prototype)
// ============================================

export async function getLearnings(
  repoPath: string,
  options?: {
    category?: string;
    query?: string;
    limit?: number;
  }
) {
  const params: Record<string, string> = { repoPath };
  if (options?.category) params.category = options.category;
  if (options?.query) params.query = options.query;
  if (options?.limit) params.limit = String(options.limit);
  return request('GET', '/api/learnings', undefined, params);
}

export async function addLearning(
  repoPath: string,
  text: string,
  category?: string,
  context?: string
) {
  return request('POST', '/api/learnings', {
    repoPath,
    text,
    category,
    context,
    source: 'mcp'
  });
}

export async function deleteLearning(repoPath: string, id: string) {
  return request('DELETE', '/api/learnings', { repoPath, id });
}
