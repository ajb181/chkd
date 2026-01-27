import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index.js';
import { getRepoByPath } from '$lib/server/db/queries';

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

export const GET: RequestHandler = async ({ url }) => {
  const repoPath = url.searchParams.get('repoPath');
  const limit = parseInt(url.searchParams.get('limit') || '5', 10);

  if (!repoPath) {
    return json({ success: false, error: 'repoPath is required' }, { status: 400 });
  }

  try {
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    const repoId = repo.id;

    const db = getDb();

    // Recently added items (by created_at)
    const addedRows = db.prepare(`
      SELECT display_id, title, created_at, area_code
      FROM spec_items
      WHERE repo_id = ? AND parent_id IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(repoId, limit) as any[];

    const added: RecentItem[] = addedRows.map(row => ({
      id: row.display_id,
      title: row.title,
      timestamp: row.created_at,
      areaCode: row.area_code
    }));

    // Recently completed items (by updated_at where status is done)
    const completedRows = db.prepare(`
      SELECT display_id, title, updated_at, area_code
      FROM spec_items
      WHERE repo_id = ? AND status = 'done' AND parent_id IS NULL
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(repoId, limit) as any[];

    const completed: RecentItem[] = completedRows.map(row => ({
      id: row.display_id,
      title: row.title,
      timestamp: row.updated_at,
      areaCode: row.area_code
    }));

    return json({
      success: true,
      data: { added, completed } as RecentActivity
    });
  } catch (err: any) {
    console.error('Error fetching recent activity:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
