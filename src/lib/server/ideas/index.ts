// Ideas - markdown file storage for external story submissions
// Stores ideas in docs/IDEAS.md in each repo

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface Idea {
  id: string;
  repoId: string;
  title: string;
  description: string;
  submitterEmail: string | null;
  status: 'submitted' | 'reviewing' | 'approved' | 'rejected';
  feedback: string | null;
  promotedTo: string | null;  // Spec item ID if approved (e.g., "SD.5")
  createdAt: string;
  updatedAt: string;
  line: number;  // Line number in file for editing
}

const IDEAS_FILE = 'docs/IDEAS.md';

// Get the path to IDEAS.md for a repo
function getFilePath(repoPath: string): string {
  return path.join(repoPath, IDEAS_FILE);
}

// Ensure the file exists with a header
function ensureFile(repoPath: string): void {
  const filePath = getFilePath(repoPath);
  const docsDir = path.dirname(filePath);

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# Feature Ideas

Ideas submitted by stakeholders and users. Review and promote to spec when ready.

## Submitted

<!-- New ideas appear here -->

## Under Review

<!-- Ideas being actively considered -->

## Approved

<!-- Ideas promoted to the spec -->

## Rejected

<!-- Ideas that won't be implemented -->
`);
  }
}

// Parse IDEAS.md file
export function parseIdeas(repoPath: string, repoId: string): Idea[] {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const ideas: Idea[] = [];

  let currentSection: 'submitted' | 'reviewing' | 'approved' | 'rejected' = 'submitted';
  let currentIdea: Partial<Idea> | null = null;
  let ideaStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track section headers
    if (line.startsWith('## Submitted')) {
      currentSection = 'submitted';
      continue;
    } else if (line.startsWith('## Under Review')) {
      currentSection = 'reviewing';
      continue;
    } else if (line.startsWith('## Approved')) {
      currentSection = 'approved';
      continue;
    } else if (line.startsWith('## Rejected')) {
      currentSection = 'rejected';
      continue;
    }

    // Match idea headers: ### Title
    const titleMatch = line.match(/^### (.+)$/);
    if (titleMatch) {
      // Save previous idea if exists
      if (currentIdea && currentIdea.title) {
        ideas.push(currentIdea as Idea);
      }

      const title = titleMatch[1].trim();
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);
      ideaStartLine = i + 1;

      currentIdea = {
        id,
        repoId,
        title,
        description: '',
        submitterEmail: null,
        status: currentSection,
        feedback: null,
        promotedTo: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        line: ideaStartLine
      };
      continue;
    }

    // Parse metadata and description for current idea
    if (currentIdea) {
      const emailMatch = line.match(/^> Email: (.+)$/);
      const feedbackMatch = line.match(/^> Feedback: (.+)$/);
      const promotedMatch = line.match(/^> Promoted to: (.+)$/);
      const dateMatch = line.match(/^> Submitted: (.+)$/);

      if (emailMatch) {
        currentIdea.submitterEmail = emailMatch[1].trim();
      } else if (feedbackMatch) {
        currentIdea.feedback = feedbackMatch[1].trim();
      } else if (promotedMatch) {
        currentIdea.promotedTo = promotedMatch[1].trim();
      } else if (dateMatch) {
        currentIdea.createdAt = dateMatch[1].trim();
      } else if (line.trim() && !line.startsWith('>') && !line.startsWith('<!--')) {
        // Add to description
        if (currentIdea.description) {
          currentIdea.description += '\n' + line;
        } else {
          currentIdea.description = line;
        }
      }
    }
  }

  // Don't forget the last idea
  if (currentIdea && currentIdea.title) {
    ideas.push(currentIdea as Idea);
  }

  return ideas;
}

// Get all ideas for a repo
export function getIdeas(repoPath: string, repoId: string): Idea[] {
  return parseIdeas(repoPath, repoId);
}

// Get ideas by status
export function getIdeasByStatus(repoPath: string, repoId: string, status: Idea['status']): Idea[] {
  return getIdeas(repoPath, repoId).filter(i => i.status === status);
}

// Create a new idea
export function createIdea(
  repoPath: string,
  repoId: string,
  title: string,
  description: string,
  submitterEmail?: string
): Idea {
  ensureFile(repoPath);
  const filePath = getFilePath(repoPath);

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find the "## Submitted" section
  let insertIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## Submitted')) {
      // Find next section or end
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('## ')) {
          insertIndex = j;
          break;
        }
      }
      if (insertIndex === -1) {
        insertIndex = lines.length;
      }
      break;
    }
  }

  // If no Submitted section, add at end
  if (insertIndex === -1) {
    insertIndex = lines.length;
  }

  // Build the idea entry
  const now = new Date().toISOString();
  const ideaLines = [
    '',
    `### ${title}`,
    `> Submitted: ${now}`
  ];

  if (submitterEmail) {
    ideaLines.push(`> Email: ${submitterEmail}`);
  }

  ideaLines.push('');
  ideaLines.push(description);
  ideaLines.push('');

  // Insert before next section
  lines.splice(insertIndex, 0, ...ideaLines);

  fs.writeFileSync(filePath, lines.join('\n'));

  const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);
  return {
    id,
    repoId,
    title,
    description,
    submitterEmail: submitterEmail || null,
    status: 'submitted',
    feedback: null,
    promotedTo: null,
    createdAt: now,
    updatedAt: now,
    line: insertIndex + 2  // Line of the ### header
  };
}

// Update idea status (move between sections)
export function updateIdeaStatus(
  repoPath: string,
  ideaId: string,
  newStatus: Idea['status'],
  feedback?: string,
  promotedTo?: string
): boolean {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find the idea by ID
  let ideaStartLine = -1;
  let ideaEndLine = -1;
  const ideaLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = lines[i].match(/^### (.+)$/);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);

      if (id === ideaId) {
        ideaStartLine = i;
        // Find end of this idea (next ### or ## or end)
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('### ') || lines[j].startsWith('## ')) {
            ideaEndLine = j;
            break;
          }
        }
        if (ideaEndLine === -1) {
          ideaEndLine = lines.length;
        }

        // Extract idea content
        for (let j = ideaStartLine; j < ideaEndLine; j++) {
          ideaLines.push(lines[j]);
        }
        break;
      }
    }
  }

  if (ideaStartLine === -1) {
    return false;
  }

  // Remove the idea from its current location
  lines.splice(ideaStartLine, ideaEndLine - ideaStartLine);

  // Add feedback or promotedTo if provided
  if (feedback) {
    // Find or update feedback line
    let hasFeeback = false;
    for (let i = 0; i < ideaLines.length; i++) {
      if (ideaLines[i].startsWith('> Feedback:')) {
        ideaLines[i] = `> Feedback: ${feedback}`;
        hasFeeback = true;
        break;
      }
    }
    if (!hasFeeback) {
      // Add after email line or after title
      for (let i = 0; i < ideaLines.length; i++) {
        if (ideaLines[i].startsWith('> Email:') || ideaLines[i].startsWith('> Submitted:')) {
          ideaLines.splice(i + 1, 0, `> Feedback: ${feedback}`);
          break;
        }
      }
    }
  }

  if (promotedTo) {
    // Add promoted to line
    for (let i = 0; i < ideaLines.length; i++) {
      if (ideaLines[i].startsWith('> Feedback:') || ideaLines[i].startsWith('> Email:') || ideaLines[i].startsWith('> Submitted:')) {
        ideaLines.splice(i + 1, 0, `> Promoted to: ${promotedTo}`);
        break;
      }
    }
  }

  // Find target section
  const sectionMap = {
    'submitted': '## Submitted',
    'reviewing': '## Under Review',
    'approved': '## Approved',
    'rejected': '## Rejected'
  };
  const targetSection = sectionMap[newStatus];

  let insertIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(targetSection)) {
      // Find next section or end
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('## ')) {
          insertIndex = j;
          break;
        }
        insertIndex = lines.length;
      }
      break;
    }
  }

  // Insert idea at target location
  lines.splice(insertIndex, 0, '', ...ideaLines);

  fs.writeFileSync(filePath, lines.join('\n'));
  return true;
}

// Find idea by query (ID or title match)
export function getIdeaByQuery(repoPath: string, repoId: string, query: string): Idea | null {
  const ideas = getIdeas(repoPath, repoId);
  const queryLower = query.toLowerCase();

  // Try ID match first
  const byId = ideas.find(i => i.id === query || i.id.startsWith(query));
  if (byId) return byId;

  // Try title match
  const byTitle = ideas.find(i => i.title.toLowerCase().includes(queryLower));
  return byTitle || null;
}

// Delete an idea
export function deleteIdea(repoPath: string, ideaId: string): boolean {
  const filePath = getFilePath(repoPath);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find the idea by ID
  let ideaStartLine = -1;
  let ideaEndLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = lines[i].match(/^### (.+)$/);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const id = crypto.createHash('md5').update(title).digest('hex').slice(0, 8);

      if (id === ideaId) {
        ideaStartLine = i;
        // Find end of this idea
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('### ') || lines[j].startsWith('## ')) {
            ideaEndLine = j;
            break;
          }
        }
        if (ideaEndLine === -1) {
          ideaEndLine = lines.length;
        }
        break;
      }
    }
  }

  if (ideaStartLine === -1) {
    return false;
  }

  // Remove the idea (including preceding blank line if any)
  if (ideaStartLine > 0 && lines[ideaStartLine - 1].trim() === '') {
    ideaStartLine--;
  }
  lines.splice(ideaStartLine, ideaEndLine - ideaStartLine);

  fs.writeFileSync(filePath, lines.join('\n'));
  return true;
}
