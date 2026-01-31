/**
 * Learnings API - Capture and retrieve learnings from conversations
 * 
 * PROTOTYPE: Testing whether capturing fine-grained context helps future work.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import crypto from 'crypto';

// GET /api/learnings - Retrieve learnings
export const GET: RequestHandler = async ({ url }) => {
  const repoPath = url.searchParams.get('repoPath');
  const category = url.searchParams.get('category');
  const query = url.searchParams.get('query');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  if (!repoPath) {
    return json({ success: false, error: 'repoPath required' });
  }

  try {
    const db = getDb();

    // Get repo ID
    const repo = db.prepare('SELECT id FROM repositories WHERE path = ?').get(repoPath) as { id: string } | undefined;
    if (!repo) {
      return json({ success: false, error: 'Repository not found' });
    }

    let sql = `
      SELECT id, text, category, context, source, relevance_score, created_at
      FROM learnings
      WHERE repo_id = ?
    `;
    const params: any[] = [repo.id];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (query) {
      sql += ' AND (text LIKE ? OR context LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const learnings = db.prepare(sql).all(...params);

    return json({ 
      success: true, 
      data: learnings,
      count: learnings.length
    });
  } catch (error) {
    console.error('[learnings] Error fetching:', error);
    return json({ success: false, error: String(error) });
  }
};

// POST /api/learnings - Add a new learning
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, text, category, context, source } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath required' });
    }

    if (!text) {
      return json({ success: false, error: 'text required' });
    }

    const db = getDb();

    // Get repo ID
    const repo = db.prepare('SELECT id FROM repositories WHERE path = ?').get(repoPath) as { id: string } | undefined;
    if (!repo) {
      return json({ success: false, error: 'Repository not found' });
    }

    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO learnings (id, repo_id, text, category, context, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, repo.id, text, category || null, context || null, source || 'mcp');

    return json({ 
      success: true, 
      data: { id, text, category, context }
    });
  } catch (error) {
    console.error('[learnings] Error creating:', error);
    return json({ success: false, error: String(error) });
  }
};

// DELETE /api/learnings - Remove a learning
export const DELETE: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, id } = body;

    if (!repoPath || !id) {
      return json({ success: false, error: 'repoPath and id required' });
    }

    const db = getDb();

    // Get repo ID for validation
    const repo = db.prepare('SELECT id FROM repositories WHERE path = ?').get(repoPath) as { id: string } | undefined;
    if (!repo) {
      return json({ success: false, error: 'Repository not found' });
    }

    const result = db.prepare(`
      DELETE FROM learnings WHERE id = ? AND repo_id = ?
    `).run(id, repo.id);

    if (result.changes === 0) {
      return json({ success: false, error: 'Learning not found' });
    }

    return json({ success: true });
  } catch (error) {
    console.error('[learnings] Error deleting:', error);
    return json({ success: false, error: String(error) });
  }
};
