import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import {
  getItemsByRepo,
  getItemsByStatus,
  getTopLevelItems,
  getProgress,
  getProgressByArea,
  findItemByQuery,
  searchItems,
  getChildren,
  getItemTags
} from '$lib/server/db/items';
import type { AreaCode, ItemStatus } from '$lib/types';

// GET /api/spec/items - Get spec items from DB
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Check what kind of query
    const status = url.searchParams.get('status') as ItemStatus | null;
    const area = url.searchParams.get('area') as AreaCode | null;
    const workflowType = url.searchParams.get('workflowType');
    const query = url.searchParams.get('query');
    const topLevel = url.searchParams.get('topLevel') === 'true';
    const withProgress = url.searchParams.get('withProgress') === 'true';
    const withChildren = url.searchParams.get('withChildren') === 'true';

    let items;

    if (query) {
      // Search by query
      items = searchItems(repo.id, query);
    } else if (status) {
      // Filter by status
      items = getItemsByStatus(repo.id, status);
    } else if (topLevel) {
      // Only top-level items
      items = getTopLevelItems(repo.id);
    } else {
      // All items
      items = getItemsByRepo(repo.id);
    }

    // Optionally filter by area
    if (area && !query) {
      items = items.filter(i => i.areaCode === area);
    }

    // Optionally filter by workflow type
    if (workflowType && !query) {
      if (workflowType === 'default') {
        // Default workflow = null workflowType
        items = items.filter(i => !i.workflowType);
      } else {
        items = items.filter(i => i.workflowType === workflowType);
      }
    }

    // Always include tags, optionally add children
    items = items.map(item => ({
      ...item,
      tags: getItemTags(item.id),
      ...(withChildren ? { children: getChildren(item.id) } : {})
    }));

    // Optionally include progress stats
    let progress = null;
    if (withProgress) {
      progress = area ? getProgressByArea(repo.id, area) : getProgress(repo.id);
    }

    return json({
      success: true,
      data: {
        items,
        progress,
        count: items.length
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
