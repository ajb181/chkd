import fs from 'fs/promises';
import { SpecParser, type ParsedSpec, type SpecPhase, type SpecItem } from './parser';

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

  // Update phase status emoji
  updatePhaseStatus(lines, spec, itemInfo.phase);

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

  // Update phase status emoji
  updatePhaseStatus(lines, spec, itemInfo.phase);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');
}

/**
 * Add a new item to a phase
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
  const insertLine = findInsertionPoint(lines, phase);

  // Build the new item lines
  const newLines = buildItemLines(title, description, subItems);

  // Insert
  lines.splice(insertLine, 0, ...newLines);

  await fs.writeFile(specPath, lines.join('\n'), 'utf-8');

  const itemId = generateId(phaseNumber, title);

  return { itemId, line: insertLine + 1 };
}

/**
 * Add workflow template sub-items to a new feature
 * Per V2_WORKFLOW_VISION.md
 */
export async function addFeatureWithWorkflow(
  specPath: string,
  phaseNumber: number,
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

  return addItem(specPath, phaseNumber, title, description, workflowSteps);
}

// ============================================
// Helper functions
// ============================================

function findItemById(spec: ParsedSpec, itemId: string): { item: SpecItem; phase: SpecPhase } | null {
  for (const phase of spec.phases) {
    const item = searchItems(phase.items, itemId);
    if (item) {
      return { item, phase };
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

function findInsertionPoint(lines: string[], phase: SpecPhase): number {
  if (phase.items.length > 0) {
    const lastItem = getLastNestedItem(phase.items);
    return lastItem.line;
  }

  // No items, insert after phase header
  const phaseLineIndex = phase.line - 1;
  for (let i = phaseLineIndex + 1; i < lines.length; i++) {
    if (lines[i].match(/^###?\s/)) {
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

function updatePhaseStatus(lines: string[], spec: ParsedSpec, phase: SpecPhase): void {
  // Re-count items after our modification
  const parser = new SpecParser();
  const newSpec = parser.parse(lines.join('\n'));
  const newPhase = newSpec.phases.find(p => p.number === phase.number);

  if (!newPhase) return;

  const allItems = getAllItems(newPhase.items);
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

  const phaseLineIndex = phase.line - 1;
  const phaseLine = lines[phaseLineIndex];
  // Match phase header, stripping ANY trailing emojis (fixes duplication bug)
  // The 'u' flag is required for emoji character classes to work correctly
  const match = phaseLine.match(/^(###\s+Phase\s+\d+:\s+.+?)(?:\s+[✅🚧📋])*\s*$/u);

  if (match) {
    lines[phaseLineIndex] = `${match[1]} ${emoji}`;
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

function generateId(phaseNum: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `phase${phaseNum}-${slug}`;
}
