import fs from 'fs/promises';
import { SpecParser, type ParsedSpec, type SpecPhase, type SpecArea, type SpecItem } from './parser';
import type { WorkflowStep } from '$lib/types';

/**
 * Options for adding a new item to the spec
 * Single unified interface - all item creation goes through this
 */
export interface AddItemOptions {
  specPath: string;
  title: string;
  areaCode: string;  // Required - SD, FE, BE, FUT
  description?: string;
  // Metadata
  story?: string;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
  fileLink?: string;  // Link to detailed design doc, Figma, etc.
  // Workflow
  tasks?: WorkflowStep[];  // Custom tasks, or uses DEFAULT_WORKFLOW_STEPS
  withWorkflow?: boolean;  // Default true - set false for simple items
  workflowType?: string;  // 'remove' | 'backend' | 'refactor' | 'audit' - uses type-specific phases
}

export interface AddItemResult {
  itemId: string;
  sectionId: string;  // e.g., "SD.1", "FE.3"
  line: number;
  areaCode: string;
  title: string;
}

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
 * Default workflow steps for new features with nested checkpoint children
 *
 * Philosophy: Get user feedback BEFORE investing in real implementation.
 * Each phase has fixed sub-tasks that force human+AI checkpoints.
 */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    task: 'Explore: research problem, check existing code/patterns & files',
    children: ['Research: investigate codebase, problem space, and any discovery docs', 'Questions: consider if clarification needed - ask user if unclear', 'Share: inform user of findings before continuing']
  },
  {
    task: 'Design: plan approach + define endpoint contracts',
    children: ['Draft: create initial design/approach', 'Review: show user, iterate if needed']
  },
  {
    task: 'Prototype: build UI with mock data, stub backend',
    children: ['Build: create the prototype', 'Verify: compare to spec/wireframe, iterate if gaps']
  },
  {
    task: 'Feedback: user reviews and approves UX',
    children: ['Demo: show user the prototype', 'Iterate: make changes based on feedback']
  },
  {
    task: 'Implement: connect real backend logic',
    children: ['Build: implement real logic', 'Verify: test functionality works']
  },
  {
    task: 'Polish: error states, edge cases, second-order effects',
    children: ['Consider: wider impact, what else could this affect', 'Review: inspect the work thoroughly', 'Confirm: verify against discovery assumptions if any, show user findings, get approval']
  },
  {
    task: 'Document: update docs, guides, and CLAUDE.md if needed',
    children: ['Write: update relevant documentation', 'Review: confirm docs match implementation']
  },
  {
    task: 'Commit: commit code to git with descriptive message',
    children: ['Stage: review changes, stage files', 'Commit: summary line (what), body (why + assumptions), push to remote']
  }
];

// Area-specific Polish steps
const FE_POLISH_STEP: WorkflowStep = {
  task: 'Polish: error states, edge cases, second-order effects',
  children: ['Consider: wider impact - loading states, empty states, error displays', 'Review: open browser, visually check UI renders correctly', 'Confirm: verify against discovery assumptions if any, show user findings, get approval']
};

const BE_POLISH_STEP: WorkflowStep = {
  task: 'Polish: error states, edge cases, second-order effects',
  children: ['Consider: wider impact - error handling, input validation, edge cases', 'Review: trace through scenarios, check error paths work', 'Confirm: verify against discovery assumptions if any, show user findings, get approval']
};

/** Get area-appropriate Polish step */
function getPolishStep(areaCode?: string): WorkflowStep {
  if (areaCode === 'SD' || areaCode === 'FE') return FE_POLISH_STEP;
  if (areaCode === 'BE') return BE_POLISH_STEP;
  return DEFAULT_WORKFLOW_STEPS[5]; // Generic
}

// Type-specific workflows - reduced phases for different task types

/** Remove workflow: Explore → Implement → Commit (skip UI/feedback phases) */
export const REMOVE_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Backend workflow: Explore → Design → Implement → Polish → Commit (skip Prototype/Feedback) */
export const BACKEND_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[1], // Design
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[5], // Polish
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Refactor workflow: Explore → Implement → Polish → Commit */
export const REFACTOR_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[5], // Polish
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Audit workflow: Explore → Feedback → Document → Commit (research + discuss findings) */
export const AUDIT_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[3], // Feedback (discuss findings)
  DEFAULT_WORKFLOW_STEPS[6], // Document
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Debug workflow: Explore → Verify → Implement → Commit (investigate + confirm fix approach + fix) */
export const DEBUG_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  {
    task: 'Verify: confirm findings and fix approach with user',
    children: ['Share: present findings to user', 'Confirm: get user approval on fix approach']
  },
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Valid workflow types */
export type WorkflowType = 'remove' | 'backend' | 'refactor' | 'audit' | 'debug';

/** Get workflow steps by type and area */
export function getWorkflowByType(type?: string, areaCode?: string): WorkflowStep[] {
  const polish = getPolishStep(areaCode);

  switch (type) {
    case 'remove': return REMOVE_WORKFLOW;
    case 'backend':
      // Backend always uses BE Polish
      return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[1], // Design
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        BE_POLISH_STEP,
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
    case 'refactor':
      // Refactor uses area-aware Polish
      return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        polish,
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
    case 'audit': return AUDIT_WORKFLOW;
    case 'debug': return DEBUG_WORKFLOW;
    default:
      // Default workflow with area-aware Polish
      return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[1], // Design
        DEFAULT_WORKFLOW_STEPS[2], // Prototype
        DEFAULT_WORKFLOW_STEPS[3], // Feedback
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        polish,
        DEFAULT_WORKFLOW_STEPS[6], // Document
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
  }
}

/**
 * Add a new item to the spec - SINGLE UNIFIED FUNCTION
 * All item creation goes through here.
 */
export async function addItem(opts: AddItemOptions): Promise<AddItemResult> {
  const { specPath, title, areaCode, description, story, keyRequirements, filesToChange, testing, fileLink } = opts;
  const withWorkflow = opts.withWorkflow !== false;  // Default true

  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Find the area
  const area = spec.areas.find(a => a.code === areaCode);
  if (!area) {
    const availableAreas = spec.areas.map(a => a.code).join(', ');
    throw new Error(`Area "${areaCode}" not found. Available: ${availableAreas}`);
  }

  // Find insertion point
  const insertLine = findInsertionPointForArea(lines, area, spec);

  // Get the next section number (e.g., SD.1, FE.2)
  const sectionNumber = getNextSectionNumber(area);

  // Determine workflow tasks
  const tasks = withWorkflow
    ? (opts.tasks && opts.tasks.length > 0 ? opts.tasks : getWorkflowByType(opts.workflowType, areaCode))
    : undefined;

  // Build the new item lines
  const newLines = buildItemLines({
    title,
    description,
    sectionNumber,
    userStory: story,
    keyRequirements,
    filesToChange,
    testing,
    fileLink,
    subItems: tasks,
  });

  // Insert
  lines.splice(insertLine, 0, ...newLines);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');

  const itemId = generateId(areaCode, title);

  return {
    itemId,
    sectionId: sectionNumber,
    line: insertLine + 1,
    areaCode,
    title
  };
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
 * @param scopeToParentId - If provided, only search within this parent's children
 */
function findItemByQuery(spec: ParsedSpec, query: string, scopeToParentId?: string): { item: SpecItem; area: SpecArea } {
  const parser = new SpecParser();
  let matches = parser.findItems(spec, query);

  // If scoped to a parent, PRIORITIZE children - search them first
  if (scopeToParentId) {
    const parent = parser.findItemById(spec, scopeToParentId);
    if (parent && parent.children.length > 0) {
      // Collect all descendant IDs (children, grandchildren, etc.)
      const descendantIds = new Set<string>();
      const collectDescendants = (items: SpecItem[]) => {
        for (const item of items) {
          descendantIds.add(item.id);
          collectDescendants(item.children);
        }
      };
      collectDescendants(parent.children);

      const scopedMatches = matches.filter(m => descendantIds.has(m.id));
      // Use scoped matches if found - don't fall back to global
      if (scopedMatches.length > 0) {
        matches = scopedMatches;
      }
    }
  }

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

interface BuildItemOptions {
  title: string;
  description?: string;
  sectionNumber?: string;
  // New metadata fields
  userStory?: string;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
  fileLink?: string;  // Link to detailed design doc, Figma, etc.
  // Sub-items - accepts both old string[] and new WorkflowStep[] format
  subItems?: string[] | WorkflowStep[];
}

function buildItemLines(
  titleOrOptions: string | BuildItemOptions,
  description?: string,
  subItems?: string[] | WorkflowStep[],
  sectionNumber?: string
): string[] {
  // Handle both old signature and new options object
  let opts: BuildItemOptions;
  if (typeof titleOrOptions === 'string') {
    opts = { title: titleOrOptions, description, subItems, sectionNumber };
  } else {
    opts = titleOrOptions;
  }

  const lines: string[] = [];

  // Format: - [ ] **XX.N Title** - Description
  const titleWithNumber = opts.sectionNumber ? `${opts.sectionNumber} ${opts.title}` : opts.title;

  if (opts.description) {
    lines.push(`- [ ] **${titleWithNumber}** - ${opts.description}`);
  } else {
    lines.push(`- [ ] **${titleWithNumber}**`);
  }

  // Add user story as blockquote
  if (opts.userStory) {
    lines.push('');
    lines.push(`> ${opts.userStory}`);
  }

  // Add key requirements section (TBC default if not provided)
  lines.push('');
  lines.push('**Key requirements:**');
  const requirements = opts.keyRequirements && opts.keyRequirements.length > 0 ? opts.keyRequirements : ['TBC'];
  for (const req of requirements) {
    lines.push(`- ${req}`);
  }

  // Add files to change section (TBC default if not provided)
  lines.push('');
  lines.push('**Files to change:**');
  const files = opts.filesToChange && opts.filesToChange.length > 0 ? opts.filesToChange : ['TBC'];
  for (const file of files) {
    lines.push(`- ${file}`);
  }

  // Add testing section (TBC default if not provided)
  lines.push('');
  lines.push('**Testing:**');
  const tests = opts.testing && opts.testing.length > 0 ? opts.testing : ['TBC'];
  for (const test of tests) {
    lines.push(`- ${test}`);
  }

  // Add file link if provided (for detailed design docs, Figma, etc.)
  if (opts.fileLink) {
    lines.push('');
    lines.push(`**Details:** [${opts.fileLink}](${opts.fileLink})`);
  }

  // Add sub-items (workflow phases)
  if (opts.subItems && opts.subItems.length > 0) {
    lines.push('');
    for (const sub of opts.subItems) {
      if (typeof sub === 'string') {
        // Old format: flat string
        if (sub.trim()) {
          lines.push(`  - [ ] ${sub}`);
        }
      } else {
        // New format: WorkflowStep with children - FLATTEN with Parent > Child
        if (sub.task.trim()) {
          // Extract parent phase name (e.g., "Explore" from "Explore: research problem...")
          const parentName = sub.task.split(':')[0].trim();
          for (const child of sub.children) {
            if (child.trim()) {
              lines.push(`  - [ ] ${parentName} > ${child}`);
            }
          }
        }
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
export async function markItemInProgress(specPath: string, itemId: string, scopeToParentId?: string): Promise<void> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Use fuzzy search - throws helpful error if not found or ambiguous
  // If scopeToParentId provided, only search within that parent's children
  const itemInfo = findItemByQuery(spec, itemId, scopeToParentId);

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
export interface EditItemOptions {
  title?: string;
  description?: string;
  story?: string;
  keyRequirements?: string[];
  filesToChange?: string[];
  testing?: string[];
}

export async function editItem(
  specPath: string,
  itemId: string,
  titleOrOptions?: string | EditItemOptions,
  newDescription?: string,
  newStory?: string
): Promise<void> {
  // Handle both old signature and new options object
  let opts: EditItemOptions;
  if (typeof titleOrOptions === 'object') {
    opts = titleOrOptions;
  } else {
    opts = { title: titleOrOptions, description: newDescription, story: newStory };
  }

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
  const title = opts.title || itemInfo.item.title;
  const desc = opts.description !== undefined ? opts.description : itemInfo.item.description;

  let newLine: string;
  if (desc) {
    newLine = `${prefix}**${title}** - ${desc}`;
  } else {
    newLine = `${prefix}**${title}**`;
  }

  lines[lineIndex] = newLine;

  // Find the bounds of this item's content (before next item or header)
  const indent = currentLine.match(/^(\s*)/)?.[1] || '';
  let itemEndIndex = lineIndex + 1;
  for (let i = lineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop if we hit another checklist item at same or higher level, or a header
    if (line.match(/^\s*-\s+\[/) || line.match(/^##/)) {
      // Check if it's same or higher level
      const lineIndent = line.match(/^(\s*)/)?.[1] || '';
      if (lineIndent.length <= indent.length) {
        break;
      }
    }
    itemEndIndex = i + 1;
  }

  // Helper to find and update a metadata section
  const updateSection = (sectionHeader: string, values: string[] | undefined) => {
    if (values === undefined) return;

    const headerRegex = new RegExp(`^\\*\\*${sectionHeader}:\\*\\*$`);
    let sectionStart = -1;
    let sectionEnd = -1;

    // Find existing section
    for (let i = lineIndex + 1; i < itemEndIndex; i++) {
      if (lines[i].match(headerRegex)) {
        sectionStart = i;
        // Find end of section (next ** header or blank line before next section)
        for (let j = i + 1; j < itemEndIndex; j++) {
          if (lines[j].match(/^\*\*.*:\*\*$/) || lines[j].match(/^\s*-\s+\[/) || lines[j].match(/^##/)) {
            sectionEnd = j;
            break;
          }
          if (lines[j].trim() === '' && j + 1 < lines.length && lines[j + 1].match(/^\*\*/)) {
            sectionEnd = j;
            break;
          }
          sectionEnd = j + 1;
        }
        break;
      }
    }

    // Build new section lines
    const newSectionLines = [`**${sectionHeader}:**`, ...values.map(v => `- ${v}`)];

    if (sectionStart >= 0) {
      // Replace existing section
      const deleteCount = sectionEnd - sectionStart;
      lines.splice(sectionStart, deleteCount, '', ...newSectionLines);
    } else {
      // Insert new section before workflow sub-items (find first sub-item checkbox)
      let insertAt = itemEndIndex;
      for (let i = lineIndex + 1; i < itemEndIndex; i++) {
        if (lines[i].match(/^\s+-\s+\[/)) {
          insertAt = i;
          break;
        }
      }
      lines.splice(insertAt, 0, '', ...newSectionLines);
    }
  };

  // Handle story update - story is a blockquote line after the item
  if (opts.story !== undefined) {
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

    if (opts.story.trim()) {
      const storyLine = `${storyIndent}> ${opts.story.trim()}`;
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

  // Update metadata sections (do these after story to avoid line number shifts)
  // Re-parse to get updated line numbers
  const updatedContent = lines.join('\n');
  const updatedLines = updatedContent.split('\n');

  // Update in reverse order of appearance to avoid index shifts
  if (opts.testing !== undefined) {
    updateSection('Testing', opts.testing);
  }
  if (opts.filesToChange !== undefined) {
    updateSection('Files to change', opts.filesToChange);
  }
  if (opts.keyRequirements !== undefined) {
    updateSection('Key requirements', opts.keyRequirements);
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
 * Remove all children from a completed item (keeps the parent)
 * Use after completing a feature/bug to clean up workflow scaffolding
 * Only removes children if ALL are completed - leaves incomplete work visible
 */
export async function removeCompletedChildren(
  specPath: string,
  itemId: string
): Promise<{ removed: number; kept: number; reason?: string }> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Find the item
  let itemInfo;
  try {
    itemInfo = findItemByQuery(spec, itemId);
  } catch {
    return { removed: 0, kept: 0, reason: 'Item not found' };
  }

  const startLine = itemInfo.item.line - 1;
  const itemIndent = lines[startLine].match(/^(\s*)/)?.[1].length || 0;

  // Find all children and check if they're all completed
  const childLines: number[] = [];
  let allCompleted = true;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineMatch = line.match(/^(\s*)-\s+\[([x ])\]/i);
    if (lineMatch) {
      const lineIndent = lineMatch[1].length;
      if (lineIndent > itemIndent) {
        childLines.push(i);
        // Check if completed (case insensitive x)
        if (lineMatch[2].toLowerCase() !== 'x') {
          allCompleted = false;
        }
      } else {
        break;
      }
    } else if (line.match(/^##/)) {
      break;
    }
  }

  // No children to remove
  if (childLines.length === 0) {
    return { removed: 0, kept: 0, reason: 'No children' };
  }

  // Don't remove if some children incomplete
  if (!allCompleted) {
    return { removed: 0, kept: childLines.length, reason: 'Some children incomplete' };
  }

  // Remove all children (reverse order to maintain line numbers)
  for (let i = childLines.length - 1; i >= 0; i--) {
    lines.splice(childLines[i], 1);
  }

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
  return { removed: childLines.length, kept: 0 };
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

/**
 * Check if an item has TBC (to be confirmed) fields that need to be filled in
 * Returns array of field names that still have TBC
 */
export interface TbcCheckResult {
  hasTbc: boolean;
  tbcFields: string[];
  itemTitle: string;
}

export async function checkItemTbc(specPath: string, itemId: string): Promise<TbcCheckResult> {
  const content = await fs.readFile(specPath, 'utf-8');
  const lines = content.split('\n');
  const parser = new SpecParser();
  const spec = parser.parse(content);

  // Find the item
  const itemInfo = findItemByQuery(spec, itemId);
  const startLine = itemInfo.item.line - 1;

  // Find the bounds of this item's content (before next item at same level or header)
  const itemIndent = lines[startLine].match(/^(\s*)/)?.[1].length || 0;
  let endLine = startLine + 1;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at next checklist item at same or higher level
    const checkMatch = line.match(/^(\s*)-\s+\[/);
    if (checkMatch) {
      const indent = checkMatch[1].length;
      if (indent <= itemIndent) {
        break;
      }
    }
    // Stop at headers
    if (line.match(/^##/)) {
      break;
    }
    endLine = i;
  }

  // Check for TBC in the item's content
  const tbcFields: string[] = [];
  let currentSection = '';

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];

    // Track which section we're in
    if (line.match(/^\*\*Key requirements:\*\*/)) {
      currentSection = 'Key requirements';
    } else if (line.match(/^\*\*Files to change:\*\*/)) {
      currentSection = 'Files to change';
    } else if (line.match(/^\*\*Testing:\*\*/)) {
      currentSection = 'Testing';
    }

    // Check for TBC
    if (line.match(/^-\s+TBC\s*$/i) && currentSection) {
      if (!tbcFields.includes(currentSection)) {
        tbcFields.push(currentSection);
      }
    }
  }

  return {
    hasTbc: tbcFields.length > 0,
    tbcFields,
    itemTitle: itemInfo.item.title
  };
}
