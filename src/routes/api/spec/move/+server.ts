import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import { findItemByQuery, updateItem, getNextSectionNumber, getChildren } from '$lib/server/db/items';
import type { AreaCode } from '$lib/types';

// POST /api/spec/move - Move an item to a different area
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, targetAreaCode } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    if (!targetAreaCode) {
      return json({ success: false, error: 'targetAreaCode is required' }, { status: 400 });
    }

    // Validate area code
    const validAreas: AreaCode[] = ['SD', 'FE', 'BE', 'FUT'];
    if (!validAreas.includes(targetAreaCode as AreaCode)) {
      return json({ success: false, error: `Invalid area code: ${targetAreaCode}` }, { status: 400 });
    }

    // Write to DB (no fallback)
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found in database. Run migration first.' }, { status: 404 });
    }

    const dbItem = findItemByQuery(repo.id, itemId);
    if (!dbItem) {
      return json({ success: false, error: `Item "${itemId}" not found in database.` }, { status: 404 });
    }

    // Can only move top-level items
    if (dbItem.parentId) {
      return json({ success: false, error: 'Cannot move child items. Move the parent instead.' }, { status: 400 });
    }

    // Get new section number in target area
    const newSectionNumber = getNextSectionNumber(repo.id, targetAreaCode as AreaCode);
    const newDisplayId = `${targetAreaCode}.${newSectionNumber}`;

    // Update title to reflect new ID
    const titleWithoutId = dbItem.title.replace(/^[A-Z]+\.\d+\s+/, '');
    const newTitle = `${newDisplayId} ${titleWithoutId}`;

    // Update the item
    updateItem(dbItem.id, {
      title: newTitle
    });

    // Also need to update displayId, areaCode, sectionNumber - use raw SQL since updateItem doesn't support these
    const db = (await import('$lib/server/db/index')).getDb();
    db.prepare(`
      UPDATE spec_items
      SET display_id = ?, area_code = ?, section_number = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newDisplayId, targetAreaCode, newSectionNumber, dbItem.id);

    // Update children's display IDs too
    const children = getChildren(dbItem.id);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childNewDisplayId = `${newDisplayId}.${i + 1}`;
      db.prepare(`
        UPDATE spec_items
        SET display_id = ?, area_code = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(childNewDisplayId, targetAreaCode, child.id);
    }

    return json({
      success: true,
      data: {
        itemId,
        newDisplayId,
        targetAreaCode,
        message: `Moved ${itemId} to ${targetAreaCode} as ${newDisplayId}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
