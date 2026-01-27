import { SpecParser, type SpecItem as ParsedItem, type SpecArea } from '$lib/server/spec/parser';
import { getRepoByPath } from './queries.js';
import {
  createItem,
  getItemByDisplayId,
  updateItem,
  setItemTags,
  getItemsByRepo
} from './items.js';
import type { ItemStatus, ItemPriority, AreaCode, CreateItemInput } from '$lib/types.js';
import path from 'path';

export interface MigrateResult {
  success: boolean;
  repoId: string;
  itemsImported: number;
  itemsSkipped: number;
  itemsUpdated: number;
  errors: string[];
}

/**
 * Map parser priority (1,2,3,null) to DB priority
 */
function mapPriority(p: 1 | 2 | 3 | null): ItemPriority {
  switch (p) {
    case 1: return 'critical';
    case 2: return 'high';
    case 3: return 'medium';
    default: return 'medium';
  }
}

/**
 * Map parser status to DB status
 */
function mapStatus(status: string): ItemStatus {
  switch (status) {
    case 'done': return 'done';
    case 'in-progress': return 'in-progress';
    case 'skipped': return 'skipped';
    case 'blocked': return 'blocked';
    default: return 'open';
  }
}

/**
 * Extract section number from parser ID (e.g., "sd-feature-name" -> count in area)
 * We'll assign numbers based on order in the area
 */
function extractDisplayId(areaCode: string, index: number, parentDisplayId?: string): string {
  if (parentDisplayId) {
    // Sub-item: SD.37.1, SD.37.2, etc.
    return `${parentDisplayId}.${index + 1}`;
  }
  // Top-level: SD.1, SD.2, etc.
  return `${areaCode}.${index + 1}`;
}

/**
 * Import a single item and optionally its children
 */
function importItem(
  repoId: string,
  item: ParsedItem,
  areaCode: AreaCode,
  sectionNumber: number,
  parentId: string | null,
  parentDisplayId: string | null,
  childIndex: number,
  result: MigrateResult
): string | null {
  const displayId = parentDisplayId
    ? `${parentDisplayId}.${childIndex + 1}`
    : `${areaCode}.${sectionNumber}`;

  // Check if already exists (idempotent)
  const existing = getItemByDisplayId(repoId, displayId);
  if (existing) {
    // Update if status changed
    const newStatus = mapStatus(item.status);
    if (existing.status !== newStatus) {
      updateItem(existing.id, { status: newStatus });
      result.itemsUpdated++;
    }
    result.itemsSkipped++;
    return existing.id;
  }

  const input: CreateItemInput = {
    repoId,
    displayId,
    title: item.title,
    description: item.description || undefined,
    story: item.story,
    keyRequirements: item.keyRequirements,
    filesToChange: item.filesToChange,
    testing: item.testing,
    areaCode,
    sectionNumber,
    parentId: parentId || undefined,
    sortOrder: childIndex,
    status: mapStatus(item.status),
    priority: mapPriority(item.priority),
  };

  try {
    const created = createItem(input);
    result.itemsImported++;

    // Add tags
    if (item.tags && item.tags.length > 0) {
      setItemTags(created.id, item.tags);
    }

    return created.id;
  } catch (err) {
    result.errors.push(`Failed to import ${displayId}: ${err}`);
    return null;
  }
}

/**
 * Recursively import children (only if parent is NOT done)
 */
function importChildren(
  repoId: string,
  children: ParsedItem[],
  areaCode: AreaCode,
  sectionNumber: number,
  parentId: string,
  parentDisplayId: string,
  result: MigrateResult
): void {
  children.forEach((child, index) => {
    const childId = importItem(
      repoId,
      child,
      areaCode,
      sectionNumber,
      parentId,
      parentDisplayId,
      index,
      result
    );

    // Recursively import grandchildren if this child is not done
    if (childId && child.status !== 'done' && child.children.length > 0) {
      const childDisplayId = `${parentDisplayId}.${index + 1}`;
      importChildren(
        repoId,
        child.children,
        areaCode,
        sectionNumber,
        childId,
        childDisplayId,
        result
      );
    }
  });
}

/**
 * Import an area's items
 */
function importArea(
  repoId: string,
  area: SpecArea,
  result: MigrateResult
): void {
  const areaCode = area.code as AreaCode;

  // Skip non-standard areas
  if (!['SD', 'FE', 'BE', 'FUT'].includes(areaCode)) {
    return;
  }

  area.items.forEach((item, index) => {
    const sectionNumber = index + 1;
    const displayId = `${areaCode}.${sectionNumber}`;

    const itemId = importItem(
      repoId,
      item,
      areaCode,
      sectionNumber,
      null,  // no parent
      null,  // no parent display ID
      index,
      result
    );

    // KEY LOGIC: Only import children if parent is NOT done
    if (itemId && item.status !== 'done' && item.children.length > 0) {
      importChildren(
        repoId,
        item.children,
        areaCode,
        sectionNumber,
        itemId,
        displayId,
        result
      );
    }
  });
}

/**
 * Migrate a SPEC.md file to the database
 *
 * @param repoPath - Path to the repository
 * @returns Migration result with counts and errors
 */
export async function migrateSpec(repoPath: string): Promise<MigrateResult> {
  const result: MigrateResult = {
    success: false,
    repoId: '',
    itemsImported: 0,
    itemsSkipped: 0,
    itemsUpdated: 0,
    errors: [],
  };

  // Get repo from DB
  const repo = getRepoByPath(repoPath);
  if (!repo) {
    result.errors.push(`Repository not found: ${repoPath}`);
    return result;
  }
  result.repoId = repo.id;

  // Parse SPEC.md
  const specPath = path.join(repoPath, 'docs', 'SPEC.md');
  const parser = new SpecParser();

  let spec;
  try {
    spec = await parser.parseFile(specPath);
  } catch (err) {
    result.errors.push(`Failed to parse SPEC.md: ${err}`);
    return result;
  }

  // Import each area
  for (const area of spec.areas) {
    importArea(repo.id, area, result);
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Get migration stats without importing
 */
export async function getMigrationPreview(repoPath: string): Promise<{
  totalItems: number;
  doneItems: number;
  childrenToSkip: number;
  itemsToImport: number;
}> {
  const specPath = path.join(repoPath, 'docs', 'SPEC.md');
  const parser = new SpecParser();
  const spec = await parser.parseFile(specPath);

  let totalItems = 0;
  let doneItems = 0;
  let childrenToSkip = 0;

  const countItems = (items: ParsedItem[], parentDone: boolean) => {
    for (const item of items) {
      totalItems++;
      if (item.status === 'done') {
        doneItems++;
      }

      // Count children that would be skipped
      if (parentDone || item.status === 'done') {
        childrenToSkip += countAllChildren(item.children);
      } else {
        countItems(item.children, false);
      }
    }
  };

  const countAllChildren = (items: ParsedItem[]): number => {
    let count = 0;
    for (const item of items) {
      count++;
      count += countAllChildren(item.children);
    }
    return count;
  };

  for (const area of spec.areas) {
    if (['SD', 'FE', 'BE', 'FUT'].includes(area.code)) {
      countItems(area.items, false);
    }
  }

  return {
    totalItems,
    doneItems,
    childrenToSkip,
    itemsToImport: totalItems - childrenToSkip,
  };
}
