import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { getTopLevelItems, getChildren, getItemTags, getProgress } from '$lib/server/db/items';
import type { SpecItem } from '$lib/types';

// Area metadata (code -> name mapping)
const AREA_NAMES: Record<string, string> = {
  'SD': 'Site Design',
  'FE': 'Frontend',
  'BE': 'Backend',
  'FUT': 'Future Areas'
};

// Convert DB priority to parser priority format
function convertPriority(priority: string): 1 | 2 | 3 | null {
  switch (priority) {
    case 'critical':
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    default: return null;
  }
}

// Convert DB item to UI format with nested children
function convertItemToUI(item: SpecItem, allTags: Map<string, string[]>): any {
  const children = getChildren(item.id);
  const tags = allTags.get(item.id) || [];

  return {
    id: item.id,
    title: item.title,
    description: item.description || '',
    completed: item.status === 'done',
    status: item.status,
    priority: convertPriority(item.priority),
    tags,
    children: children.map(c => convertItemToUI(c, allTags)),
    line: 0, // Not applicable for DB items
    story: item.story || undefined,
    keyRequirements: item.keyRequirements?.length ? item.keyRequirements : undefined,
    filesToChange: item.filesToChange?.length ? item.filesToChange : undefined,
    testing: item.testing?.length ? item.testing : undefined
  };
}

// GET /api/spec/full - Get the full parsed spec from DB
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    // Get all top-level items
    const topLevelItems = getTopLevelItems(repo.id);

    // Pre-fetch all tags for efficiency
    const allTags = new Map<string, string[]>();
    const fetchTags = (items: SpecItem[]) => {
      for (const item of items) {
        allTags.set(item.id, getItemTags(item.id));
        const children = getChildren(item.id);
        if (children.length > 0) {
          fetchTags(children);
        }
      }
    };
    fetchTags(topLevelItems);

    // Group items by area
    const itemsByArea = new Map<string, SpecItem[]>();
    for (const item of topLevelItems) {
      const areaCode = item.areaCode;
      if (!itemsByArea.has(areaCode)) {
        itemsByArea.set(areaCode, []);
      }
      itemsByArea.get(areaCode)!.push(item);
    }

    // Build areas in standard order
    const areaOrder = ['SD', 'FE', 'BE', 'FUT'];
    const areas = areaOrder
      .filter(code => itemsByArea.has(code))
      .map((code, index) => {
        const items = itemsByArea.get(code)!;
        const uiItems = items.map(item => convertItemToUI(item, allTags));

        // Determine area status
        const allDone = uiItems.every((i: any) => i.completed);
        const anyInProgress = uiItems.some((i: any) => i.status === 'in-progress');

        return {
          name: AREA_NAMES[code] || code,
          code,
          status: allDone ? 'complete' : (anyInProgress ? 'in-progress' : 'pending'),
          items: uiItems,
          line: 0
        };
      });

    // Get progress stats
    const progress = getProgress(repo.id);

    const spec = {
      title: repo.name,
      areas,
      phases: areas.map((a, i) => ({ ...a, number: i + 1 })), // Backward compat
      totalItems: progress.total,
      completedItems: progress.done,
      progress: progress.percent
    };

    return json({ success: true, data: spec });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
