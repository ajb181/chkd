// Quick Wins - markdown file storage
// Stores quick wins in docs/QUICKWINS.md in each repo

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface QuickWin {
  id: string;
  repoId: string;
  title: string;
  description: string | null;
  status: 'open' | 'done';
  createdAt: string;
  completedAt: string | null;
  line: number;  // Line number in file for editing
}

const QUICKWINS_FILE = 'docs/QUICKWINS.md';

// Get the path to QUICKWINS.md for a repo
function getFilePath(repoPath: string): string {
  return path.join(repoPath, QUICKWINS_FILE);
}

// Ensure the file exists with a header
function ensureFile(repoPath: string): void {
  const filePath = getFilePath(repoPath);
  const docsDir = path.dirname(filePath);

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '# Quick Wins\n\nSmall improvements to make when you have time.\n\n');
  }
}

// Parse QUICKWINS.md file
export function parseQuickWins(repoPath: string, repoId: string): QuickWin[] {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const wins: QuickWin[] = [];

  // Match checkbox lines: - [ ] or - [x]
  const checkboxRegex = /^(\s*)- \[([ x])\] (.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(checkboxRegex);

    if (match) {
      const checked = match[2] === 'x';
      const title = match[3].trim();

      // Generate stable ID from title (for consistency across reloads)
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);

      wins.push({
        id,
        repoId,
        title,
        description: null,
        status: checked ? 'done' : 'open',
        createdAt: new Date().toISOString(),  // We don't track this in markdown
        completedAt: checked ? new Date().toISOString() : null,
        line: i + 1  // 1-indexed line number
      });
    }
  }

  return wins;
}

// Get all quick wins for a repo
export function getQuickWins(repoPath: string, repoId: string): QuickWin[] {
  return parseQuickWins(repoPath, repoId);
}

// Add a quick win
export function createQuickWin(repoPath: string, repoId: string, title: string): QuickWin {
  ensureFile(repoPath);
  const filePath = getFilePath(repoPath);

  // Read current content
  let content = fs.readFileSync(filePath, 'utf-8');

  // Find position to insert (after header, before any existing items or at end)
  const lines = content.split('\n');
  let insertIndex = lines.length;

  // Find first checkbox or end of file
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^- \[[ x]\]/)) {
      insertIndex = i;
      break;
    }
  }

  // If no checkboxes found, insert after any header lines
  if (insertIndex === lines.length) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '' && i > 0 && !lines[i-1].startsWith('#') && !lines[i-1].trim().startsWith('>')) {
        insertIndex = i + 1;
        break;
      }
    }
  }

  // Insert the new item
  const newLine = `- [ ] ${title}`;
  lines.splice(insertIndex, 0, newLine);

  // Write back
  fs.writeFileSync(filePath, lines.join('\n'));

  // Return the created item
  const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);
  return {
    id,
    repoId,
    title,
    description: null,
    status: 'open',
    createdAt: new Date().toISOString(),
    completedAt: null,
    line: insertIndex + 1
  };
}

// Complete a quick win (toggle checkbox)
export function completeQuickWin(repoPath: string, quickWinId: string): boolean {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find the item by ID (regenerate ID from title)
  const checkboxRegex = /^(\s*)- \[([ x])\] (.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(checkboxRegex);
    if (match) {
      const title = match[3].trim();
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);

      if (id === quickWinId) {
        // Toggle the checkbox
        const indent = match[1];
        const wasChecked = match[2] === 'x';
        lines[i] = `${indent}- [${wasChecked ? ' ' : 'x'}] ${title}`;
        fs.writeFileSync(filePath, lines.join('\n'));
        return true;
      }
    }
  }

  return false;
}

// Delete a quick win
export function deleteQuickWin(repoPath: string, quickWinId: string): boolean {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find and remove the item by ID
  const checkboxRegex = /^(\s*)- \[([ x])\] (.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(checkboxRegex);
    if (match) {
      const title = match[3].trim();
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);

      if (id === quickWinId) {
        lines.splice(i, 1);
        fs.writeFileSync(filePath, lines.join('\n'));
        return true;
      }
    }
  }

  return false;
}

// Find quick win by query (ID or title match)
export function getQuickWinByQuery(repoPath: string, repoId: string, query: string): QuickWin | null {
  const wins = getQuickWins(repoPath, repoId);
  const queryLower = query.toLowerCase();

  // Try ID match first
  const byId = wins.find(w => w.id === query || w.id.startsWith(query));
  if (byId) return byId;

  // Try title match
  const byTitle = wins.find(w => w.title.toLowerCase().includes(queryLower));
  return byTitle || null;
}

// Update a quick win's title
export function updateQuickWin(repoPath: string, quickWinId: string, newTitle: string): { success: boolean; newId?: string } {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return { success: false };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find the item by ID (regenerate ID from title)
  const checkboxRegex = /^(\s*)- \[([ x])\] (.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(checkboxRegex);
    if (match) {
      const title = match[3].trim();
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);

      if (id === quickWinId) {
        // Update the title
        const indent = match[1];
        const checked = match[2];
        lines[i] = `${indent}- [${checked}] ${newTitle.trim()}`;
        fs.writeFileSync(filePath, lines.join('\n'));

        // Return new ID (since title changed, ID changes)
        const newId = crypto.createHash('md5').update(newTitle.trim()).digest('hex').slice(0, 8);
        return { success: true, newId };
      }
    }
  }

  return { success: false };
}
