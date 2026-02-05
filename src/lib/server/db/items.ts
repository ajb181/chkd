import { getDb } from './index.js';
import type {
  SpecItem,
  CreateItemInput,
  UpdateItemInput,
  ItemStatus,
  ItemPriority,
  AreaCode,
  ItemProgress
} from '$lib/types.js';
import crypto from 'crypto';

// ============================================
// Row to Object Mapping
// ============================================

function rowToItem(row: any): SpecItem {
  return {
    id: row.id,
    repoId: row.repo_id,
    displayId: row.display_id,
    title: row.title,
    description: row.description,
    story: row.story,
    keyRequirements: JSON.parse(row.key_requirements || '[]'),
    filesToChange: JSON.parse(row.files_to_change || '[]'),
    testing: JSON.parse(row.testing || '[]'),
    areaCode: row.area_code as AreaCode,
    sectionNumber: row.section_number,
    workflowType: row.workflow_type || null,
    parentId: row.parent_id,
    sortOrder: row.sort_order || 0,
    status: row.status as ItemStatus,
    priority: row.priority as ItemPriority,
    reviewCompleted: row.review_completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// CRUD Operations
// ============================================

export function createItem(data: CreateItemInput): SpecItem {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO spec_items (
      id, repo_id, display_id, title, description, story,
      key_requirements, files_to_change, testing,
      area_code, section_number, workflow_type, parent_id, sort_order,
      status, priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.repoId,
    data.displayId,
    data.title,
    data.description || null,
    data.story || null,
    JSON.stringify(data.keyRequirements || []),
    JSON.stringify(data.filesToChange || []),
    JSON.stringify(data.testing || []),
    data.areaCode,
    data.sectionNumber,
    data.workflowType || null,
    data.parentId || null,
    data.sortOrder || 0,
    data.status || 'open',
    data.priority || 'medium'
  );

  return getItem(id)!;
}

export function getItem(id: string): SpecItem | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM spec_items WHERE id = ?`).get(id) as any;
  return row ? rowToItem(row) : null;
}

export function getItemByDisplayId(repoId: string, displayId: string): SpecItem | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM spec_items WHERE repo_id = ? AND display_id = ?
  `).get(repoId, displayId) as any;
  return row ? rowToItem(row) : null;
}

export function updateItem(id: string, updates: UpdateItemInput): SpecItem | null {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: any[] = [];

  if (updates.title !== undefined) {
    sets.push('title = ?');
    values.push(updates.title);
  }

  if (updates.description !== undefined) {
    sets.push('description = ?');
    values.push(updates.description);
  }

  if (updates.story !== undefined) {
    sets.push('story = ?');
    values.push(updates.story);
  }

  if (updates.keyRequirements !== undefined) {
    sets.push('key_requirements = ?');
    values.push(JSON.stringify(updates.keyRequirements));
  }

  if (updates.filesToChange !== undefined) {
    sets.push('files_to_change = ?');
    values.push(JSON.stringify(updates.filesToChange));
  }

  if (updates.testing !== undefined) {
    sets.push('testing = ?');
    values.push(JSON.stringify(updates.testing));
  }

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }

  if (updates.priority !== undefined) {
    sets.push('priority = ?');
    values.push(updates.priority);
  }

  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }

  values.push(id);
  db.prepare(`UPDATE spec_items SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getItem(id);
}

export function deleteItem(id: string): boolean {
  const db = getDb();
  
  console.log(`[deleteItem] Starting delete for id: ${id}`);
  
  // Collect all descendant IDs first
  function collectDescendants(parentId: string): string[] {
    const children = db.prepare('SELECT id, display_id FROM spec_items WHERE parent_id = ?').all(parentId) as { id: string, display_id: string }[];
    console.log(`[deleteItem] Found ${children.length} children for ${parentId}`);
    const allIds: string[] = [];
    for (const child of children) {
      console.log(`[deleteItem]   - child: ${child.display_id} (${child.id})`);
      allIds.push(child.id);
      allIds.push(...collectDescendants(child.id));
    }
    return allIds;
  }
  
  const descendantIds = collectDescendants(id);
  console.log(`[deleteItem] Total descendants to delete: ${descendantIds.length}`);
  
  try {
    // Delete in reverse order (deepest first) without transaction first
    const allToDelete = [...descendantIds, id];
    console.log(`[deleteItem] Deleting ${allToDelete.length} items total`);
    
    for (const delId of allToDelete) {
      console.log(`[deleteItem] Deleting: ${delId}`);
      // First clear any parent references TO this item
      db.prepare('UPDATE spec_items SET parent_id = NULL WHERE parent_id = ?').run(delId);
      // Then delete
      db.prepare('DELETE FROM spec_items WHERE id = ?').run(delId);
      console.log(`[deleteItem] Deleted: ${delId}`);
    }
    
    console.log(`[deleteItem] Success!`);
    return true;
  } catch (err) {
    console.error(`[deleteItem] Error:`, err);
    throw err;
  }
}

/**
 * Flatten 3-level hierarchy to 2-level
 * Before: Parent -> Phase -> Checkpoint
 * After: Parent -> Checkpoint (phases deleted)
 */
export function flattenHierarchy(repoId?: string): { reparented: number; deleted: number } {
  const db = getDb();

  console.log(`[flattenHierarchy] Starting migration${repoId ? ` for repo ${repoId}` : ' for all repos'}...`);

  // Find all "middle generation" items: items that have both a parent AND children
  // These are the phase items (FE.19.1, FE.19.2) that need to be removed
  const middleGenQuery = repoId
    ? `SELECT DISTINCT p.id, p.display_id, p.parent_id as grandparent_id
       FROM spec_items p
       WHERE p.repo_id = ?
         AND p.parent_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM spec_items c WHERE c.parent_id = p.id)`
    : `SELECT DISTINCT p.id, p.display_id, p.parent_id as grandparent_id
       FROM spec_items p
       WHERE p.parent_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM spec_items c WHERE c.parent_id = p.id)`;

  const middleItems = repoId
    ? db.prepare(middleGenQuery).all(repoId) as { id: string; display_id: string; grandparent_id: string }[]
    : db.prepare(middleGenQuery).all() as { id: string; display_id: string; grandparent_id: string }[];

  console.log(`[flattenHierarchy] Found ${middleItems.length} middle-generation items to flatten`);

  let reparented = 0;
  let deleted = 0;

  for (const middle of middleItems) {
    console.log(`[flattenHierarchy] Processing: ${middle.display_id} (${middle.id})`);

    // Get all children of this middle item
    const children = db.prepare('SELECT id, display_id FROM spec_items WHERE parent_id = ?')
      .all(middle.id) as { id: string; display_id: string }[];

    // Reparent children to grandparent
    for (const child of children) {
      db.prepare('UPDATE spec_items SET parent_id = ? WHERE id = ?')
        .run(middle.grandparent_id, child.id);
      console.log(`[flattenHierarchy]   Reparented: ${child.display_id} -> grandparent`);
      reparented++;
    }

    // Delete the middle item (now has no children)
    db.prepare('DELETE FROM spec_items WHERE id = ?').run(middle.id);
    console.log(`[flattenHierarchy]   Deleted: ${middle.display_id}`);
    deleted++;
  }

  console.log(`[flattenHierarchy] Done! Reparented: ${reparented}, Deleted: ${deleted}`);
  return { reparented, deleted };
}

// ============================================
// Query Operations
// ============================================

export function getItemsByRepo(repoId: string): SpecItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ?
    ORDER BY area_code, section_number, sort_order
  `).all(repoId) as any[];

  return rows.map(rowToItem);
}

export function getItemsByArea(repoId: string, areaCode: AreaCode): SpecItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND area_code = ?
    ORDER BY section_number, sort_order
  `).all(repoId, areaCode) as any[];

  return rows.map(rowToItem);
}

export function getItemsByParent(parentId: string): SpecItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM spec_items
    WHERE parent_id = ?
    ORDER BY sort_order
  `).all(parentId) as any[];

  return rows.map(rowToItem);
}

export function getItemsByStatus(repoId: string, status: ItemStatus): SpecItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND status = ?
    ORDER BY area_code, section_number, sort_order
  `).all(repoId, status) as any[];

  return rows.map(rowToItem);
}

export function getTopLevelItems(repoId: string): SpecItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND parent_id IS NULL
    ORDER BY area_code, section_number
  `).all(repoId) as any[];

  return rows.map(rowToItem);
}

// ============================================
// Search
// ============================================

export function findItemByQuery(repoId: string, query: string): SpecItem | null {
  const db = getDb();
  const queryLower = query.toLowerCase();

  // Try exact display_id match first (e.g., "SD.37")
  const byDisplayId = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND LOWER(display_id) = ?
  `).get(repoId, queryLower) as any;
  if (byDisplayId) return rowToItem(byDisplayId);

  // Try display_id prefix match (e.g., "SD37" matches "SD.37")
  const normalized = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const allItems = getItemsByRepo(repoId);
  const byNormalizedId = allItems.find(item => {
    const normalizedDisplayId = item.displayId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return normalizedDisplayId === normalized;
  });
  if (byNormalizedId) return byNormalizedId;

  // Try title contains match
  const byTitle = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND LOWER(title) LIKE ?
    ORDER BY area_code, section_number
    LIMIT 1
  `).get(repoId, `%${queryLower}%`) as any;
  if (byTitle) return rowToItem(byTitle);

  // Try description contains match
  const byDesc = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND LOWER(description) LIKE ?
    ORDER BY area_code, section_number
    LIMIT 1
  `).get(repoId, `%${queryLower}%`) as any;
  if (byDesc) return rowToItem(byDesc);

  return null;
}

export function searchItems(repoId: string, query: string, limit: number = 20): SpecItem[] {
  const db = getDb();
  const queryLower = query.toLowerCase();
  const queryLike = `%${queryLower}%`;

  // Prioritize exact display_id match, then fuzzy matches
  // CASE puts exact matches first (0), then fuzzy (1)
  const rows = db.prepare(`
    SELECT *,
      CASE WHEN LOWER(display_id) = ? THEN 0 ELSE 1 END as match_priority
    FROM spec_items
    WHERE repo_id = ? AND (
      LOWER(display_id) LIKE ? OR
      LOWER(title) LIKE ? OR
      LOWER(description) LIKE ?
    )
    ORDER BY match_priority, area_code, section_number, sort_order
    LIMIT ?
  `).all(queryLower, repoId, queryLike, queryLike, queryLike, limit) as any[];

  return rows.map(rowToItem);
}

// ============================================
// Hierarchy
// ============================================

export function getChildren(itemId: string): SpecItem[] {
  return getItemsByParent(itemId);
}

export function getDescendants(itemId: string): SpecItem[] {
  const result: SpecItem[] = [];
  const children = getChildren(itemId);

  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(child.id));
  }

  return result;
}

export function getAncestors(itemId: string): SpecItem[] {
  const result: SpecItem[] = [];
  let current = getItem(itemId);

  while (current?.parentId) {
    const parent = getItem(current.parentId);
    if (parent) {
      result.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  return result;
}

// ============================================
// Tags
// ============================================

export function addTag(itemId: string, tag: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO item_tags (item_id, tag) VALUES (?, ?)
  `).run(itemId, tag.toLowerCase());
}

export function removeTag(itemId: string, tag: string): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM item_tags WHERE item_id = ? AND tag = ?
  `).run(itemId, tag.toLowerCase());
}

export function getItemTags(itemId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT tag FROM item_tags WHERE item_id = ? ORDER BY tag
  `).all(itemId) as any[];

  return rows.map(r => r.tag);
}

export function getItemsByTag(repoId: string, tag: string): SpecItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT si.* FROM spec_items si
    INNER JOIN item_tags it ON si.id = it.item_id
    WHERE si.repo_id = ? AND it.tag = ?
    ORDER BY si.area_code, si.section_number, si.sort_order
  `).all(repoId, tag.toLowerCase()) as any[];

  return rows.map(rowToItem);
}

export function setItemTags(itemId: string, tags: string[]): void {
  const db = getDb();
  // Clear existing tags
  db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
  // Add new tags
  const insert = db.prepare('INSERT INTO item_tags (item_id, tag) VALUES (?, ?)');
  for (const tag of tags) {
    insert.run(itemId, tag.toLowerCase());
  }
}

// ============================================
// Stats / Progress
// ============================================

export function getProgress(repoId: string): ItemProgress {
  const db = getDb();
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM spec_items WHERE repo_id = ?
  `).get(repoId) as any;

  const done = db.prepare(`
    SELECT COUNT(*) as count FROM spec_items WHERE repo_id = ? AND status = 'done'
  `).get(repoId) as any;

  const totalCount = total?.count || 0;
  const doneCount = done?.count || 0;

  return {
    total: totalCount,
    done: doneCount,
    percent: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  };
}

export function getProgressByArea(repoId: string, areaCode: AreaCode): ItemProgress {
  const db = getDb();
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM spec_items WHERE repo_id = ? AND area_code = ?
  `).get(repoId, areaCode) as any;

  const done = db.prepare(`
    SELECT COUNT(*) as count FROM spec_items WHERE repo_id = ? AND area_code = ? AND status = 'done'
  `).get(repoId, areaCode) as any;

  const totalCount = total?.count || 0;
  const doneCount = done?.count || 0;

  return {
    total: totalCount,
    done: doneCount,
    percent: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  };
}

// ============================================
// Utility: Get next section number
// ============================================

export function getNextSectionNumber(repoId: string, areaCode: AreaCode): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(section_number) as max_num
    FROM spec_items
    WHERE repo_id = ? AND area_code = ? AND parent_id IS NULL
  `).get(repoId, areaCode) as any;

  return (row?.max_num || 0) + 1;
}

// ============================================
// Bulk Operations
// ============================================

export function updateItemStatus(id: string, status: ItemStatus): SpecItem | null {
  return updateItem(id, { status });
}

export function markItemDone(id: string): SpecItem | null {
  return updateItemStatus(id, 'done');
}

export function markItemInProgress(id: string): SpecItem | null {
  return updateItemStatus(id, 'in-progress');
}

export function markReviewCompleted(id: string): SpecItem | null {
  const db = getDb();
  db.prepare(`UPDATE spec_items SET review_completed = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
  return getItem(id);
}

// ============================================
// TBC Check (To Be Confirmed)
// ============================================

export interface TbcCheckResult {
  hasTbc: boolean;
  tbcFields: string[];
  itemTitle: string;
}

/**
 * Check if an item has TBC (to be confirmed) fields that need to be filled in.
 * Returns array of field names that still have TBC.
 */
export function checkItemTbc(repoId: string, itemQuery: string): TbcCheckResult {
  const item = findItemByQuery(repoId, itemQuery);

  if (!item) {
    return { hasTbc: false, tbcFields: [], itemTitle: itemQuery };
  }

  // Child checkpoints inherit context from parent - skip TBC check
  if (item.parentId) {
    return { hasTbc: false, tbcFields: [], itemTitle: item.title };
  }

  const tbcFields: string[] = [];

  // Check keyRequirements
  if (item.keyRequirements.length === 0 ||
      (item.keyRequirements.length === 1 && item.keyRequirements[0].toLowerCase() === 'tbc')) {
    tbcFields.push('Key requirements');
  }

  // Check filesToChange
  if (item.filesToChange.length === 0 ||
      (item.filesToChange.length === 1 && item.filesToChange[0].toLowerCase() === 'tbc')) {
    tbcFields.push('Files to change');
  }

  // Check testing
  if (item.testing.length === 0 ||
      (item.testing.length === 1 && item.testing[0].toLowerCase() === 'tbc')) {
    tbcFields.push('Testing');
  }

  return {
    hasTbc: tbcFields.length > 0,
    tbcFields,
    itemTitle: item.title
  };
}
