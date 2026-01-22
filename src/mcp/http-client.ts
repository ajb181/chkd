/**
 * HTTP client for MCP server to communicate with SvelteKit API
 *
 * This replaces direct database access to avoid sync issues between processes.
 * The MCP server now acts as a client to the SvelteKit API.
 */

const DEFAULT_PORT = 3847;
const BASE_URL = `http://localhost:${DEFAULT_PORT}`;

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
        error: `chkd web server not running on port ${DEFAULT_PORT}`,
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

export async function addFeature(
  repoPath: string,
  title: string,
  areaCode: string,
  description?: string,
  tasks?: string[]
) {
  return request('POST', '/api/spec/add', {
    repoPath,
    title,
    areaCode,
    description,
    withWorkflow: true,
    tasks
  });
}

export async function addChildItem(repoPath: string, parentId: string, title: string) {
  return request('POST', '/api/spec/add-child', { repoPath, parentId, title });
}

export async function setTags(repoPath: string, itemId: string, tags: string[]) {
  return request('POST', '/api/spec/tags', { repoPath, itemId, tags });
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

export async function getRepoByPath(repoPath: string) {
  const response = await request('GET', '/api/repos');
  if (response.success && response.data) {
    const repos = response.data as any[];
    return repos.find(r => r.path === repoPath);
  }
  return null;
}
