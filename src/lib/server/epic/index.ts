import fs from 'fs/promises';
import path from 'path';
import { SpecParser } from '../spec/parser';

export interface Epic {
  name: string;
  slug: string;
  description: string;
  tag: string;
  status: 'planning' | 'in-progress' | 'review' | 'complete';
  scope: string[];
  outOfScope: string[];
  overhaul: { task: string; done: boolean }[];
  filePath: string;
  createdAt: string;
}

export interface EpicWithProgress extends Epic {
  itemCount: number;
  completedCount: number;
  progress: number;
}

/**
 * Generate a slug from a name
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Get the epics directory for a repo
 */
function getEpicsDir(repoPath: string): string {
  return path.join(repoPath, 'docs', 'epics');
}

/**
 * Parse an epic markdown file
 */
async function parseEpicFile(filePath: string): Promise<Epic | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let name = '';
    let description = '';
    let tag = '';
    let status: Epic['status'] = 'planning';
    const scope: string[] = [];
    const outOfScope: string[] = [];
    const overhaul: { task: string; done: boolean }[] = [];
    let currentSection = '';
    let createdAt = '';

    for (const line of lines) {
      // Title: # Epic: Name
      if (line.startsWith('# Epic:')) {
        name = line.replace('# Epic:', '').trim();
        continue;
      }

      // Description in blockquote
      if (line.startsWith('> ') && !description) {
        description = line.replace('> ', '').trim();
        continue;
      }

      // Tag
      if (line.startsWith('**Tag:**')) {
        tag = line.replace('**Tag:**', '').trim().replace(/`/g, '');
        continue;
      }

      // Status
      if (line.startsWith('**Status:**')) {
        const statusStr = line.replace('**Status:**', '').trim().toLowerCase();
        if (statusStr.includes('progress')) status = 'in-progress';
        else if (statusStr.includes('review')) status = 'review';
        else if (statusStr.includes('complete')) status = 'complete';
        else status = 'planning';
        continue;
      }

      // Created
      if (line.startsWith('**Created:**')) {
        createdAt = line.replace('**Created:**', '').trim();
        continue;
      }

      // Section headers
      if (line.startsWith('## ')) {
        currentSection = line.replace('## ', '').trim().toLowerCase();
        continue;
      }

      // List items
      if (line.startsWith('- ')) {
        const item = line.replace(/^- \[[ x]\] /, '').replace(/^- /, '').trim();
        const isDone = line.includes('[x]');

        if (currentSection === 'scope') {
          scope.push(item);
        } else if (currentSection === 'out of scope') {
          outOfScope.push(item);
        } else if (currentSection === 'overhaul checklist') {
          overhaul.push({ task: item, done: isDone });
        }
      }
    }

    if (!name) return null;

    return {
      name,
      slug: slugify(name),
      description,
      tag: tag || slugify(name),
      status,
      scope,
      outOfScope,
      overhaul,
      filePath,
      createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new epic
 */
export async function createEpic(
  repoPath: string,
  name: string,
  description: string,
  scope?: string[]
): Promise<Epic> {
  const epicsDir = getEpicsDir(repoPath);

  // Ensure epics directory exists
  await fs.mkdir(epicsDir, { recursive: true });

  const slug = slugify(name);
  const tag = slug;
  const filePath = path.join(epicsDir, `${slug}.md`);
  const createdAt = new Date().toISOString().split('T')[0];

  // Check if epic already exists
  try {
    await fs.access(filePath);
    throw new Error(`Epic "${name}" already exists at ${filePath}`);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Default overhaul checklist
  const defaultOverhaul = [
    'All linked items complete',
    'End-to-end tested',
    'Integration verified',
    'Documentation updated',
    'User sign-off',
  ];

  // Generate markdown content
  const content = `# Epic: ${name}

> ${description}

**Tag:** \`${tag}\`
**Status:** Planning
**Created:** ${createdAt}

## Scope

${(scope || ['TBC']).map(s => `- ${s}`).join('\n')}

## Out of Scope

- TBC

## Overhaul Checklist

${defaultOverhaul.map(t => `- [ ] ${t}`).join('\n')}

---

*Link items to this epic with: \`chkd_tag("ITEM.ID", ["${tag}"])\`*
`;

  await fs.writeFile(filePath, content, 'utf-8');

  return {
    name,
    slug,
    description,
    tag,
    status: 'planning',
    scope: scope || ['TBC'],
    outOfScope: ['TBC'],
    overhaul: defaultOverhaul.map(t => ({ task: t, done: false })),
    filePath,
    createdAt,
  };
}

/**
 * List all epics in a repo
 */
export async function listEpics(repoPath: string): Promise<Epic[]> {
  const epicsDir = getEpicsDir(repoPath);

  try {
    const files = await fs.readdir(epicsDir);
    const epics: Epic[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(epicsDir, file);
      const epic = await parseEpicFile(filePath);
      if (epic) epics.push(epic);
    }

    return epics.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Get epic by name or tag
 */
export async function getEpic(repoPath: string, query: string): Promise<Epic | null> {
  const epics = await listEpics(repoPath);
  const queryLower = query.toLowerCase();

  return epics.find(e =>
    e.slug === queryLower ||
    e.tag === queryLower ||
    e.name.toLowerCase().includes(queryLower)
  ) || null;
}

/**
 * Get epic with progress from spec items
 */
export async function getEpicWithProgress(
  repoPath: string,
  epic: Epic
): Promise<EpicWithProgress> {
  const specPath = path.join(repoPath, 'docs', 'SPEC.md');

  let itemCount = 0;
  let completedCount = 0;

  try {
    const parser = new SpecParser();
    const spec = await parser.parseFile(specPath);

    // Find items with matching tag
    for (const area of spec.areas) {
      for (const item of area.items) {
        if (item.tags?.includes(epic.tag)) {
          itemCount++;
          if (item.completed) completedCount++;
        }
      }
    }
  } catch {
    // Spec not found or parse error
  }

  return {
    ...epic,
    itemCount,
    completedCount,
    progress: itemCount > 0 ? Math.round((completedCount / itemCount) * 100) : 0,
  };
}

/**
 * List all epics with progress
 */
export async function listEpicsWithProgress(repoPath: string): Promise<EpicWithProgress[]> {
  const epics = await listEpics(repoPath);
  return Promise.all(epics.map(e => getEpicWithProgress(repoPath, e)));
}

/**
 * Update epic status
 */
export async function updateEpicStatus(
  repoPath: string,
  query: string,
  status: Epic['status']
): Promise<Epic | null> {
  const epic = await getEpic(repoPath, query);
  if (!epic) return null;

  const content = await fs.readFile(epic.filePath, 'utf-8');

  // Update status line
  const statusMap = {
    'planning': 'Planning',
    'in-progress': 'In Progress',
    'review': 'Review',
    'complete': 'Complete',
  };

  const newContent = content.replace(
    /\*\*Status:\*\* .+/,
    `**Status:** ${statusMap[status]}`
  );

  await fs.writeFile(epic.filePath, newContent, 'utf-8');

  return { ...epic, status };
}

/**
 * Toggle overhaul checklist item
 */
export async function toggleOverhaulItem(
  repoPath: string,
  query: string,
  itemIndex: number
): Promise<Epic | null> {
  const epic = await getEpic(repoPath, query);
  if (!epic) return null;
  if (itemIndex < 0 || itemIndex >= epic.overhaul.length) return null;

  const content = await fs.readFile(epic.filePath, 'utf-8');
  const lines = content.split('\n');

  let checklistIndex = 0;
  let inChecklist = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## Overhaul Checklist')) {
      inChecklist = true;
      continue;
    }

    if (inChecklist && lines[i].startsWith('## ')) {
      break;
    }

    if (inChecklist && lines[i].match(/^- \[[ x]\]/)) {
      if (checklistIndex === itemIndex) {
        const isDone = lines[i].includes('[x]');
        lines[i] = isDone
          ? lines[i].replace('[x]', '[ ]')
          : lines[i].replace('[ ]', '[x]');
        break;
      }
      checklistIndex++;
    }
  }

  await fs.writeFile(epic.filePath, lines.join('\n'), 'utf-8');

  return getEpic(repoPath, query);
}
