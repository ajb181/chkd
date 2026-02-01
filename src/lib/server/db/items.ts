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
  
  // Temporarily disable foreign key checks for this operation
  db.pragma('foreign_keys = OFF');
  
  try {
    // Recursively collect all descendant IDs (depth-first, leaves first)
    function collectDescendants(parentId: string): string[] {
      const children = db.prepare('SELECT id FROM spec_items WHERE parent_id = ?').all(parentId) as { id: string }[];
      const allIds: string[] = [];
      for (const child of children) {
        allIds.push(...collectDescendants(child.id));
        allIds.push(child.id);
      }
      return allIds;
    }
    
    const descendantIds = collectDescendants(id);
    
    // Delete all in transaction
    const deleteAll = db.transaction(() => {
      for (const descId of descendantIds) {
        db.prepare('DELETE FROM spec_items WHERE id = ?').run(descId);
      }
      return db.prepare('DELETE FROM spec_items WHERE id = ?').run(id);
    });
    
    const result = deleteAll();
    return result.changes > 0;
  } finally {
    // Re-enable foreign key checks
    db.pragma('foreign_keys = ON');
  }
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
  const queryLower = `%${query.toLowerCase()}%`;

  const rows = db.prepare(`
    SELECT * FROM spec_items
    WHERE repo_id = ? AND (
      LOWER(display_id) LIKE ? OR
      LOWER(title) LIKE ? OR
      LOWER(description) LIKE ?
    )
    ORDER BY area_code, section_number, sort_order
    LIMIT ?
  `).all(repoId, queryLower, queryLower, queryLower, limit) as any[];

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
