import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

interface RecentItem {
  id: string;
  title: string;
  type: 'added' | 'completed';
  date: string;
  commitHash: string;
}

// Parse a spec line to extract item ID and title
function parseSpecLine(line: string): { id: string; title: string } | null {
  // Match: - [x] **SD.1 Title** or - [ ] **FE.2 Title**
  const match = line.match(/- \[[x~\s!]\] \*\*([A-Z]+\.\d+)\s+([^*]+)\*\*/);
  if (match) {
    return { id: match[1], title: match[2].trim() };
  }
  return null;
}

export const GET: RequestHandler = async ({ url }) => {
  const repoPath = url.searchParams.get('repoPath');

  if (!repoPath) {
    return json({ success: false, error: 'repoPath is required' }, { status: 400 });
  }

  const specPath = path.join(repoPath, 'docs', 'SPEC.md');

  if (!fs.existsSync(specPath)) {
    return json({ success: false, error: 'SPEC.md not found' }, { status: 404 });
  }

  try {
    // Get recent git log for SPEC.md (last 20 commits)
    const gitLog = execSync(
      `git log --oneline --follow -20 -- docs/SPEC.md`,
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim();

    if (!gitLog) {
      return json({
        success: true,
        data: { recentAdded: [], recentCompleted: [] }
      });
    }

    const commits = gitLog.split('\n').map(line => {
      const [hash, ...rest] = line.split(' ');
      return { hash, message: rest.join(' ') };
    });

    const recentAdded: RecentItem[] = [];
    const recentCompleted: RecentItem[] = [];
    const seenIds = new Set<string>();

    // For each recent commit, check what changed
    for (const commit of commits.slice(0, 10)) {
      try {
        // Get the diff for this commit
        const diff = execSync(
          `git show ${commit.hash} --format="" -- docs/SPEC.md`,
          { cwd: repoPath, encoding: 'utf-8' }
        );

        // Get commit date
        const dateStr = execSync(
          `git show -s --format=%ci ${commit.hash}`,
          { cwd: repoPath, encoding: 'utf-8' }
        ).trim();

        const lines = diff.split('\n');

        for (const line of lines) {
          // New lines (additions)
          if (line.startsWith('+') && !line.startsWith('+++')) {
            const parsed = parseSpecLine(line.substring(1));
            if (parsed && !seenIds.has(parsed.id)) {
              // Check if this is a new item ([ ]) or newly completed ([x])
              if (line.includes('- [x]') || line.includes('- [~]')) {
                // This was marked complete in this commit
                // Check if the old line had [ ]
                const oldLine = lines.find(l =>
                  l.startsWith('-') &&
                  !l.startsWith('---') &&
                  l.includes(parsed.id) &&
                  l.includes('- [ ]')
                );
                if (oldLine) {
                  recentCompleted.push({
                    ...parsed,
                    type: 'completed',
                    date: dateStr,
                    commitHash: commit.hash
                  });
                  seenIds.add(parsed.id);
                }
              } else if (line.includes('- [ ]')) {
                // Check if this is a truly new item (not in removed lines)
                const wasRemoved = lines.some(l =>
                  l.startsWith('-') &&
                  !l.startsWith('---') &&
                  l.includes(parsed.id)
                );
                if (!wasRemoved) {
                  recentAdded.push({
                    ...parsed,
                    type: 'added',
                    date: dateStr,
                    commitHash: commit.hash
                  });
                  seenIds.add(parsed.id);
                }
              }
            }
          }
        }
      } catch (e) {
        // Skip commits that fail to parse
        continue;
      }
    }

    return json({
      success: true,
      data: {
        recentAdded: recentAdded.slice(0, 5),
        recentCompleted: recentCompleted.slice(0, 5)
      }
    });

  } catch (error) {
    console.error('[RECENT] Error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
