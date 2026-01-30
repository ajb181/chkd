import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getRepoByPath, getBugs } from '$lib/server/db/queries';
import { getProgress, getItemsByStatus } from '$lib/server/db/items';

// GET /api/status - Human-friendly status overview
// Used by CLI: chkd status
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath') || process.cwd();

    // Find repo
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({
        success: true,
        data: {
          registered: false,
          message: 'This directory is not registered with chkd. Run: chkd init'
        }
      });
    }

    // Get session
    const session = getSession(repo.id);

    // Get spec progress from DB
    const progress = getProgress(repo.id);
    const hasItems = progress.total > 0;

    // Build human-friendly status
    const status: any = {
      registered: true,
      repo: {
        name: repo.name,
        path: repo.path,
        branch: repo.branch,
      },
      session: {
        status: session.status,
        mode: session.mode,
        currentTask: session.currentTask,
        iteration: session.iteration,
        elapsedMs: session.elapsedMs,
      },
    };

    if (hasItems) {
      // Find items in progress for current phase info
      const inProgressItems = getItemsByStatus(repo.id, 'in-progress');
      const currentPhase = inProgressItems.length > 0 ? {
        name: inProgressItems[0].areaCode,
        status: 'in-progress'
      } : null;

      status.spec = {
        title: repo.name,
        progress: progress.percent,
        totalItems: progress.total,
        completedItems: progress.done,
        currentPhase,
      };
    }

    // Human-readable summary (don't repeat current task - CLI shows it separately)
    // Include bug count when idle to help prioritization
    const bugs = getBugs(repo.id);
    const openBugs = bugs.filter(b => b.status !== 'fixed' && b.status !== 'wont_fix');
    const bugNote = openBugs.length > 0 ? ` (${openBugs.length} open bug${openBugs.length > 1 ? 's' : ''})` : '';
    
    if (session.currentTask) {
      status.summary = `Use 'chkd progress' to see sub-items.`;
    } else if (session.anchor) {
      // User set an anchor - show that
      status.summary = `Ready. Next up: ${session.anchor.title}${bugNote}`;
    } else if (hasItems) {
      // No anchor - prompt discussion instead of auto-suggesting
      status.summary = progress.percent === 100
        ? `All ${progress.total} items complete! 🎉`
        : `Ready. Discuss with user what to work on next.${bugNote}`;
    } else {
      status.summary = 'No spec items in database. Run migration if you have a SPEC.md file.';
    }
    
    // Include bug count in response
    status.bugs = {
      open: openBugs.length,
      total: bugs.length
    };

    return json({ success: true, data: status });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
