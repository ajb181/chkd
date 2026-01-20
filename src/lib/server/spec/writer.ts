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
  // Handle both open [ ] and in-progress [~] items
  const newLine = currentLine.replace(/\[[ ~]\]/, '[x]');

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

  // Get the next section number (e.g., SD.1, FE.2)
  const sectionNumber = getNextSectionNumber(area);

  // Build the new item lines with section number
  const newLines = buildItemLines(title, description, subItems, sectionNumber);

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
 * Default workflow steps for new features
 */
export const DEFAULT_WORKFLOW_STEPS = [
  'Explore: understand problem, search existing functions',
  'Design: flow diagram if needed',
  'Prototype: backend with test data + frontend calling it',
  'Feedback: user reviews prototype',
  'Implement: replace test data with real logic',
  'Polish: iterate based on usage'
];

/**
 * Add workflow template sub-items to a new feature
 * Per V2_WORKFLOW_VISION.md
 * @param customTasks - Optional custom tasks to use instead of default workflow
 */
export async function addFeatureWithWorkflow(
  specPath: string,
  areaCodeOrPhaseNum: string | number,
  title: string,
  description?: string,
  customTasks?: string[]
): Promise<{ itemId: string; line: number }> {
  const workflowSteps = customTasks && customTasks.length > 0
    ? customTasks
    : DEFAULT_WORKFLOW_STEPS;

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

function buildItemLines(title: string, description?: string, subItems?: string[], sectionNumber?: string): string[] {
  const lines: string[] = [];

  // Format: - [ ] **XX.N Title** - Description
  const titleWithNumber = sectionNumber ? `${sectionNumber} ${title}` : title;

  if (description) {
    lines.push(`- [ ] **${titleWithNumber}** - ${description}`);
  } else {
    lines.push(`- [ ] **${titleWithNumber}**`);
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

/**
 * Get the next section number for an area
 * e.g., if area has SD.1 and SD.2, returns "SD.3"
 */
function getNextSectionNumber(area: SpecArea): string {
  const code = area.code;

  // Find the highest existing number for this area
  let maxNum = 0;
  for (const item of area.items) {
    // Match patterns like "SD.1", "FE.12", etc. at the start of the title
    const match = item.title.match(new RegExp(`^${code}\\.(\\d+)`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `${code}.${maxNum + 1}`;
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

/**
 * Mark an item as in-progress (changes [ ] to [~])
 * Used when Claude starts working on an item
 */
export async function markItemInProgress(specPath: string, itemId: string): Promise<void> {
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

  // Change [ ] to [~] for in-progress, or leave [x] as is
  const newLine = currentLine.replace(/\[ \]/, '[~]');

  if (newLine === currentLine && !currentLine.includes('[x]') && !currentLine.includes('[~]')) {
    throw new Error('Checkbox not found on line');
  }

  lines[lineIndex] = newLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Mark an item as skipped (changes [ ] or [~] to [-])
 * Used when user wants to skip an item for this cycle
 */
export async function skipItem(specPath: string, itemId: string): Promise<void> {
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

  // Change [ ] or [~] to [-] for skipped
  const newLine = currentLine.replace(/\[[ ~]\]/, '[-]');

  if (newLine === currentLine) {
    throw new Error('Item already skipped or completed');
  }

  lines[lineIndex] = newLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Unskip an item (changes [-] back to [ ])
 */
export async function unskipItem(specPath: string, itemId: string): Promise<void> {
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

  const newLine = currentLine.replace(/\[-\]/, '[ ]');

  if (newLine === currentLine) {
    throw new Error('Item is not skipped');
  }

  lines[lineIndex] = newLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Update a story/feature description
 */
export async function updateStory(
  specPath: string,
  areaCode: string,
  story: string
): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const area = spec.areas.find(a => a.code === areaCode);
  if (!area) {
    throw new Error(`Area ${areaCode} not found`);
  }

  // Find the story blockquote (> As a...) after the area header
  const areaLineIndex = area.line - 1;
  let storyLineIndex = -1;

  for (let i = areaLineIndex + 1; i < lines.length && i < areaLineIndex + 5; i++) {
    if (lines[i].startsWith('>')) {
      storyLineIndex = i;
      break;
    }
    // Stop if we hit another header or checklist item
    if (lines[i].match(/^##/) || lines[i].match(/^- \[/)) {
      break;
    }
  }

  if (storyLineIndex >= 0) {
    // Update existing story
    lines[storyLineIndex] = `> ${story}`;
  } else {
    // Insert new story after area header
    lines.splice(areaLineIndex + 1, 0, '', `> ${story}`, '');
  }

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Edit an item's title and/or description
 */
export async function editItem(
  specPath: string,
  itemId: string,
  newTitle?: string,
  newDescription?: string
): Promise<void> {
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

  // Parse the current line to preserve indent and checkbox state
  const match = currentLine.match(/^(\s*-\s+\[[ xX~\-]\]\s+)(?:\*\*(.+?)\*\*\s*(?:-\s*)?(.*)|\S.*)$/);
  if (!match) {
    throw new Error('Could not parse item line');
  }

  const prefix = match[1]; // indent + checkbox
  const title = newTitle || itemInfo.item.title;
  const desc = newDescription !== undefined ? newDescription : itemInfo.item.description;

  let newLine: string;
  if (desc) {
    newLine = `${prefix}**${title}** - ${desc}`;
  } else {
    newLine = `${prefix}**${title}**`;
  }

  lines[lineIndex] = newLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Delete an item and all its children
 */
export async function deleteItem(specPath: string, itemId: string): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const itemInfo = findItemById(spec, itemId);
  if (!itemInfo) {
    throw new Error(`Item ${itemId} not found`);
  }

  // Find the range of lines to delete (item + all nested children)
  const startLine = itemInfo.item.line - 1;
  let endLine = startLine;

  // Get the indent of our item to find where children end
  const itemIndent = lines[startLine].match(/^(\s*)/)?.[1].length || 0;

  // Scan forward to find all nested children
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    // Check if this is a checklist item
    const lineMatch = line.match(/^(\s*)-\s+\[/);
    if (lineMatch) {
      const lineIndent = lineMatch[1].length;
      // If it's more indented, it's a child - include it
      if (lineIndent > itemIndent) {
        endLine = i;
      } else {
        // Same or less indent means we've exited children
        break;
      }
    } else if (line.match(/^##/)) {
      // Hit a header, stop
      break;
    }
  }

  // Delete the lines
  lines.splice(startLine, endLine - startLine + 1);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Set priority on an item (P1=High, P2=Medium, P3=Low, null=Backlog)
 * Adds or removes [P1], [P2], [P3] tag from the title
 */
export async function setPriority(
  specPath: string,
  itemId: string,
  priority: 1 | 2 | 3 | null
): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const itemInfo = findItemById(spec, itemId);
  if (!itemInfo) {
    throw new Error(`Item ${itemId} not found`);
  }

  const lineIndex = itemInfo.item.line - 1;
  let currentLine = lines[lineIndex];

  // Remove existing priority tag if present
  currentLine = currentLine.replace(/(\s*-\s+\[[ xX~\-]\]\s+)\[P[123]\]\s*/, '$1');

  // Add new priority tag if not null
  if (priority !== null) {
    // Insert priority tag after the checkbox
    currentLine = currentLine.replace(
      /^(\s*-\s+\[[ xX~\-]\]\s+)/,
      `$1[P${priority}] `
    );
  }

  lines[lineIndex] = currentLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Move an item to a different area
 */
export async function moveItem(
  specPath: string,
  itemId: string,
  targetAreaCode: string
): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  const itemInfo = findItemById(spec, itemId);
  if (!itemInfo) {
    throw new Error(`Item ${itemId} not found`);
  }

  const targetArea = spec.areas.find(a => a.code === targetAreaCode);
  if (!targetArea) {
    throw new Error(`Target area ${targetAreaCode} not found`);
  }

  // Get the lines for this item and children
  const startLine = itemInfo.item.line - 1;
  let endLine = startLine;
  const itemIndent = lines[startLine].match(/^(\s*)/)?.[1].length || 0;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineMatch = line.match(/^(\s*)-\s+\[/);
    if (lineMatch) {
      const lineIndent = lineMatch[1].length;
      if (lineIndent > itemIndent) {
        endLine = i;
      } else {
        break;
      }
    } else if (line.match(/^##/)) {
      break;
    }
  }

  // Extract the lines to move
  const itemLines = lines.slice(startLine, endLine + 1);

  // Remove from current location
  lines.splice(startLine, endLine - startLine + 1);

  // Re-parse to find new insertion point (line numbers changed)
  const newSpec = parser.parse(lines.join('\n'));
  const newTargetArea = newSpec.areas.find(a => a.code === targetAreaCode);
  if (!newTargetArea) {
    throw new Error(`Target area ${targetAreaCode} not found after removal`);
  }

  // Find insertion point in target area
  const insertLine = findInsertionPointForArea(lines, newTargetArea, newSpec);

  // Insert at new location
  lines.splice(insertLine, 0, ...itemLines);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}
