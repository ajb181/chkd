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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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
): Promise<{ itemId: string; sectionId: string; line: number }> {
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

  return { itemId, sectionId: sectionNumber, line: insertLine + 1 };
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
 *
 * Philosophy: Get user feedback BEFORE investing in real implementation.
 * - Prototype with mock data so you can iterate quickly
 * - Define endpoint contracts upfront so FE and BE can work in parallel
 * - Only build real backend AFTER user approves the UX
 */
export const DEFAULT_WORKFLOW_STEPS = [
  'Explore: research problem, check existing code/patterns',
  'Design: plan approach + define endpoint contracts',
  'Prototype: build UI with mock data, stub backend',
  'Feedback: user reviews and approves UX',
  'Implement: connect real backend logic',
  'Polish: error states, edge cases, performance'
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
): Promise<{ itemId: string; sectionId?: string; line: number }> {
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

/**
 * Find item by fuzzy matching on title, description, or ID
 * Returns single match or throws helpful error with suggestions
 */
function findItemByQuery(spec: ParsedSpec, query: string): { item: SpecItem; area: SpecArea } {
  const parser = new SpecParser();
  const matches = parser.findItems(spec, query);

  // No matches - helpful error
  if (matches.length === 0) {
    throw new Error(
      `❌ No items found for "${query}"\n\n` +
      `💡 Try:\n` +
      `  • chkd_status - See all items\n` +
      `  • Use item ID or part of title\n` +
      `  • Check spelling`
    );
  }

  // Single match - perfect!
  if (matches.length === 1) {
    const item = matches[0];
    // Find which area this item belongs to
    for (const area of spec.areas) {
      const found = searchItems(area.items, item.id);
      if (found) {
        return { item, area };
      }
    }
    // Shouldn't happen but handle it
    throw new Error(`Item found but area lookup failed for "${query}"`);
  }

  // Multiple matches - try exact match first
  const exactMatch = matches.find(m =>
    m.id.toLowerCase() === query.toLowerCase() ||
    m.title.toLowerCase() === query.toLowerCase()
  );

  if (exactMatch) {
    for (const area of spec.areas) {
      const found = searchItems(area.items, exactMatch.id);
      if (found) {
        return { item: exactMatch, area };
      }
    }
  }

  // Ambiguous - show options
  const suggestions = matches.slice(0, 5).map(m =>
    `  • ${m.id.slice(0, 40)}... → ${m.title.slice(0, 50)}`
  ).join('\n');

  const more = matches.length > 5 ? `\n  ... and ${matches.length - 5} more` : '';

  throw new Error(
    `❌ Multiple matches for "${query}":\n\n${suggestions}${more}\n\n` +
    `💡 Be more specific or use full ID`
  );
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

function generateId(areaCode: string, title: string, parentId?: string | null): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (parentId) {
    // For nested items, include a short hash of parent to ensure uniqueness
    const parentSlug = parentId.replace(/^[a-z]+-/, '').slice(0, 20);
    return `${areaCode.toLowerCase()}-${parentSlug}-${slug}`.slice(0, 100);
  }

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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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
 * Mark an item as blocked/roadblocked (changes [ ] or [~] to [!])
 * Used when an item cannot proceed due to external blockers
 */
export async function markItemBlocked(specPath: string, itemId: string): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

  const lineIndex = itemInfo.item.line - 1;
  const currentLine = lines[lineIndex];

  // Change [ ] or [~] to [!] for blocked
  const newLine = currentLine.replace(/\[[ ~]\]/, '[!]');

  if (newLine === currentLine) {
    throw new Error('Item already blocked, skipped, or completed');
  }

  lines[lineIndex] = newLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Unblock an item (changes [!] back to [ ])
 */
export async function unblockItem(specPath: string, itemId: string): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

  const lineIndex = itemInfo.item.line - 1;
  const currentLine = lines[lineIndex];

  const newLine = currentLine.replace(/\[!\]/, '[ ]');

  if (newLine === currentLine) {
    throw new Error('Item is not blocked');
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
  newDescription?: string,
  newStory?: string
): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

  const lineIndex = itemInfo.item.line - 1;
  const currentLine = lines[lineIndex];

  // Parse the current line to preserve indent and checkbox state
  const match = currentLine.match(/^(\s*-\s+\[[ xX~\-!]\]\s+)(?:\*\*(.+?)\*\*\s*(?:-\s*)?(.*)|\S.*)$/);
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

  // Handle story update - story is a blockquote line after the item
  if (newStory !== undefined) {
    const indent = currentLine.match(/^(\s*)/)?.[1] || '';
    const storyIndent = indent + '  '; // 2 more spaces for story

    // Check if there's already a story line (blockquote right after item)
    let storyLineIndex = -1;
    for (let i = lineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      // Check if this line is a story (blockquote with same or greater indent)
      if (line.match(/^\s*>/)) {
        storyLineIndex = i;
        break;
      }
      // Stop if we hit another checklist item or header
      if (line.match(/^\s*-\s+\[/) || line.match(/^##/)) {
        break;
      }
    }

    if (newStory.trim()) {
      const storyLine = `${storyIndent}> ${newStory.trim()}`;
      if (storyLineIndex >= 0) {
        // Update existing story
        lines[storyLineIndex] = storyLine;
      } else {
        // Insert new story after item
        lines.splice(lineIndex + 1, 0, storyLine);
      }
    } else if (storyLineIndex >= 0) {
      // Remove story if empty
      lines.splice(storyLineIndex, 1);
    }
  }

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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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
 * Add a child item to an existing item
 */
export async function addChildItem(
  specPath: string,
  parentId: string,
  title: string
): Promise<{ childId: string; line: number }> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const parentInfo = findItemByQuery(spec, parentId);

  // Get the indent of the parent item
  const parentLine = parentInfo.item.line - 1;
  const parentIndent = lines[parentLine].match(/^(\s*)/)?.[1].length || 0;
  const childIndent = ' '.repeat(parentIndent + 2);

  // Find where to insert the new child (after parent and its existing children)
  let insertLine = parentLine + 1;
  for (let i = parentLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineMatch = line.match(/^(\s*)-\s+\[/);
    if (lineMatch) {
      const lineIndent = lineMatch[1].length;
      if (lineIndent > parentIndent) {
        // This is a child, keep scanning
        insertLine = i + 1;
      } else {
        // Same or less indent, stop here
        break;
      }
    } else if (line.match(/^##/) || (line.trim() && !line.match(/^\s*-/))) {
      // Hit a header or non-list content, stop
      break;
    }
  }

  // Create the new child line
  const newLine = `${childIndent}- [ ] ${title}`;
  lines.splice(insertLine, 0, newLine);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');

  const childId = generateId(parentId.split('-')[0] || 'ITEM', title);
  return { childId, line: insertLine + 1 };
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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

  const lineIndex = itemInfo.item.line - 1;
  let currentLine = lines[lineIndex];

  // Remove existing priority tag if present
  currentLine = currentLine.replace(/(\s*-\s+\[[ xX~\-!]\]\s+)\[P[123]\]\s*/, '$1');

  // Add new priority tag if not null
  if (priority !== null) {
    // Insert priority tag after the checkbox
    currentLine = currentLine.replace(
      /^(\s*-\s+\[[ xX~\-!]\]\s+)/,
      `$1[P${priority}] `
    );
  }

  lines[lineIndex] = currentLine;
  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Set tags on an item
 */
export async function setTags(
  specPath: string,
  itemId: string,
  tags: string[]
): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

  const lineIndex = itemInfo.item.line - 1;
  let currentLine = lines[lineIndex];

  // Remove all existing tags (anything matching #tagname pattern)
  currentLine = currentLine.replace(/#\w+(?:[-_]\w+)*/g, '').replace(/\s+/g, ' ').trim();

  // Add new tags if any
  if (tags.length > 0) {
    // Tags go after the title/priority but before the description dash
    // Find where to insert: after ** closing or after ] if no bold
    const tagString = tags.map(t => `#${t.toLowerCase()}`).join(' ');

    // Pattern: find the title end (either **title** or just title) and insert tags before " - "
    if (currentLine.includes(' - ')) {
      // Has description - insert tags before the dash
      currentLine = currentLine.replace(/ - /, ` ${tagString} - `);
    } else {
      // No description - append tags at end
      currentLine = `${currentLine} ${tagString}`;
    }
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

  // Use fuzzy search - throws helpful error if not found or ambiguous
  const itemInfo = findItemByQuery(spec, itemId);

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

/**
 * Transfer an item from one spec to another (across repos)
 * The item will be assigned a new section number in the target area
 */
export async function transferItem(
  sourceSpecPath: string,
  targetSpecPath: string,
  itemId: string,
  targetAreaCode: string
): Promise<{ newItemId: string; line: number }> {
  // Read source spec
  const sourceContent = await fs.readFile(sourceSpecPath, 'utf-8');
  const sourceLines = sourceContent.split('\n');
  const parser = new SpecParser();
  const sourceSpec = parser.parse(sourceContent);

  // Find the item in source spec
  const itemInfo = findItemByQuery(sourceSpec, itemId);

  // Get the lines for this item and children
  const startLine = itemInfo.item.line - 1;
  let endLine = startLine;
  const itemIndent = sourceLines[startLine].match(/^(\s*)/)?.[1].length || 0;

  for (let i = startLine + 1; i < sourceLines.length; i++) {
    const line = sourceLines[i];
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

  // Extract the item lines
  const itemLines = sourceLines.slice(startLine, endLine + 1);

  // Read target spec
  const targetContent = await fs.readFile(targetSpecPath, 'utf-8');
  const targetLines = targetContent.split('\n');
  const targetSpec = parser.parse(targetContent);

  // Find target area
  const targetArea = targetSpec.areas.find(a => a.code === targetAreaCode);
  if (!targetArea) {
    throw new Error(`Target area ${targetAreaCode} not found in target spec`);
  }

  // Get next section number for target area
  const sectionNumber = getNextSectionNumber(targetArea);

  // Replace the section number in the first line
  let firstLine = itemLines[0];
  // Match patterns like "- [ ] **SD.1 Title**" or "- [ ] [P1] **SD.1 Title**"
  firstLine = firstLine.replace(
    /(\*\*)[A-Z]+\.\d+\s+/,
    `$1${sectionNumber} `
  );
  itemLines[0] = firstLine;

  // Find insertion point in target area
  const insertLine = findInsertionPointForArea(targetLines, targetArea, targetSpec);

  // Insert into target
  targetLines.splice(insertLine, 0, ...itemLines);
  await fs.writeFile(targetSpecPath, targetLines.join('\n'), 'utf-8');

  // Remove from source (only after successful target insert)
  sourceLines.splice(startLine, endLine - startLine + 1);
  await fs.writeFile(sourceSpecPath, sourceLines.join('\n'), 'utf-8');

  return { newItemId: sectionNumber, line: insertLine + 1 };
}
