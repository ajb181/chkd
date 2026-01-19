import fs from 'fs/promises';
import { SpecParser, type ParsedSpec, type SpecPhase, type SpecArea, type SpecItem } from './parser';

/**
 * Mark a spec item as complete
 */
export async function markItemComplete(specPath: string, itemId: string): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const itemInfo = findItemById(spec, itemId);
  if (!itemInfo) {
    throw new Error(`Item ${itemId} not found`);
  }

  const lineIndex = itemInfo.item.line - 1;
  const currentLine = lines[lineIndex];
  const newLine = currentLine.replace(/\[ \]/, '[x]');

  if (newLine === currentLine) {
    throw new Error('Item already complete or checkbox not found');
  }

  lines[lineIndex] = newLine;

  // Update area status emoji (no-op for Area format, only for Phase format)
  updateAreaStatus(lines, spec, itemInfo.area);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Mark a spec item as incomplete
 */
export async function markItemIncomplete(specPath: string, itemId: string): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const itemInfo = findItemById(spec, itemId);
  if (!itemInfo) {
    throw new Error(`Item ${itemId} not found`);
  }

  const lineIndex = itemInfo.item.line - 1;
  const currentLine = lines[lineIndex];
  const newLine = currentLine.replace(/\[[xX]\]/, '[ ]');

  if (newLine === currentLine) {
    throw new Error('Item already incomplete or checkbox not found');
  }

  lines[lineIndex] = newLine;

  // Update area status emoji
  updateAreaStatus(lines, spec, itemInfo.area);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Add a new item to an area by code (e.g., 'BE', 'FE', 'SD')
 */
export async function addItemToArea(
  specPath: string,
  areaCode: string,
  title: string,
  description?: string,
  subItems?: string[]
): Promise<{ itemId: string; line: number }> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const area = spec.areas.find(a => a.code === areaCode);
  if (!area) {
    throw new Error(`Area ${areaCode} not found`);
  }

  // Find insertion point
  const insertLine = findInsertionPointForArea(lines, area, spec);

  // Build the new item lines
  const newLines = buildItemLines(title, description, subItems);

  // Insert
  lines.splice(insertLine, 0, ...newLines);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');

  const itemId = generateId(areaCode, title);

  return { itemId, line: insertLine + 1 };
}

/**
 * Add a new item to a phase (backward compat)
 */
export async function addItem(
  specPath: string,
  phaseNumber: number,
  title: string,
  description?: string,
  subItems?: string[]
): Promise<{ itemId: string; line: number }> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const phase = spec.phases.find(p => p.number === phaseNumber);
  if (!phase) {
    throw new Error(`Phase ${phaseNumber} not found`);
  }

  // Find insertion point
  const insertLine = findInsertionPointForArea(lines, phase, spec);

  // Build the new item lines
  const newLines = buildItemLines(title, description, subItems);

  // Insert
  lines.splice(insertLine, 0, ...newLines);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');

  const itemId = generateId(phase.code, title);

  return { itemId, line: insertLine + 1 };
}

/**
 * Add workflow template sub-items to a new feature
 * Per V2_WORKFLOW_VISION.md
 */
export async function addFeatureWithWorkflow(
  specPath: string,
  areaCodeOrPhaseNum: string | number,
  title: string,
  description?: string
): Promise<{ itemId: string; line: number }> {
  const workflowSteps = [
    'Explore: understand problem, search existing functions',
    'Design: flow diagram if needed',
    'Prototype: backend with test data + frontend calling it',
    'Feedback: user reviews prototype',
    'Implement: replace test data with real logic',
    'Polish: iterate based on usage'
  ];

  if (typeof areaCodeOrPhaseNum === 'string') {
    return addItemToArea(specPath, areaCodeOrPhaseNum, title, description, workflowSteps);
  } else {
    return addItem(specPath, areaCodeOrPhaseNum, title, description, workflowSteps);
  }
}

// ============================================
// Helper functions
// ============================================

function findItemById(spec: ParsedSpec, itemId: string): { item: SpecItem; area: SpecArea } | null {
  for (const area of spec.areas) {
    const item = searchItems(area.items, itemId);
    if (item) {
      return { item, area };
    }
  }
  return null;
}

function searchItems(items: SpecItem[], itemId: string): SpecItem | null {
  for (const item of items) {
    if (item.id === itemId) return item;
    const found = searchItems(item.children, itemId);
    if (found) return found;
  }
  return null;
}

function findInsertionPointForArea(lines: string[], area: SpecArea, spec: ParsedSpec): number {
  if (area.items.length > 0) {
    const lastItem = getLastNestedItem(area.items);
    return lastItem.line;
  }

  // No items, find the next area/section and insert before it
  const areaLineIndex = area.line - 1;
  for (let i = areaLineIndex + 1; i < lines.length; i++) {
    // Stop at next ## or ### header
    if (lines[i].match(/^##\s+[^#]/) || lines[i].match(/^###\s+/)) {
      return i;
    }
  }
  return lines.length;
}

function getLastNestedItem(items: SpecItem[]): SpecItem {
  const last = items[items.length - 1];
  if (last.children.length > 0) {
    return getLastNestedItem(last.children);
  }
  return last;
}

function buildItemLines(title: string, description?: string, subItems?: string[]): string[] {
  const lines: string[] = [];

  if (description) {
    lines.push(`- [ ] **${title}** - ${description}`);
  } else {
    lines.push(`- [ ] **${title}**`);
  }

  if (subItems && subItems.length > 0) {
    for (const sub of subItems) {
      if (sub.trim()) {
        lines.push(`  - [ ] ${sub}`);
      }
    }
  }

  return lines;
}

function updateAreaStatus(lines: string[], spec: ParsedSpec, area: SpecArea): void {
  // Re-count items after our modification
  const parser = new SpecParser();
  const newSpec = parser.parse(lines.join('\n'));
  const newArea = newSpec.areas.find(a => a.code === area.code);

  if (!newArea) return;

  const allItems = getAllItems(newArea.items);
  const completedCount = allItems.filter(i => i.completed).length;
  const totalCount = allItems.length;

  let emoji: string;
  if (completedCount === totalCount && totalCount > 0) {
    emoji = '✅';
  } else if (completedCount > 0) {
    emoji = '🚧';
  } else {
    emoji = '📋';
  }

  const areaLineIndex = area.line - 1;
  const areaLine = lines[areaLineIndex];

  // Try to match Phase format first (### Phase N: Name)
  // The 'u' flag is required for emoji character classes to work correctly
  const phaseMatch = areaLine.match(/^(###\s+Phase\s+\d+:\s+.+?)(?:\s+[✅🚧📋])*\s*$/u);
  if (phaseMatch) {
    lines[areaLineIndex] = `${phaseMatch[1]} ${emoji}`;
    return;
  }

  // Try Area format (## Area Name) - typically we don't add emojis to areas
  // but support it if they want
  const areaMatch = areaLine.match(/^(##\s+[^#].+?)(?:\s+[✅🚧📋])*\s*$/u);
  if (areaMatch) {
    // Optionally add emoji to area headers
    // For now, don't modify area headers - let status be computed dynamically
    // lines[areaLineIndex] = `${areaMatch[1]} ${emoji}`;
  }
}

function getAllItems(items: SpecItem[]): SpecItem[] {
  const result: SpecItem[] = [];
  for (const item of items) {
    result.push(item);
    result.push(...getAllItems(item.children));
  }
  return result;
}

function generateId(areaCode: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${areaCode.toLowerCase()}-${slug}`;
}
