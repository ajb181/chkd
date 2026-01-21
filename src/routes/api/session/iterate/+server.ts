import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getRepoByPath, updateSession } from '$lib/server/db/queries';

// POST /api/session/iterate - Increment iteration and return context reminder
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { repoPath } = await request.json();

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    const session = getSession(repo.id);

    if (!session.currentTask) {
      return json({
        success: false,
        error: 'No active session',
        hint: 'Start a session first with: chkd start "TASK_ID"'
      }, { status: 400 });
    }

    // Increment iteration
    const newIteration = (session.iteration || 0) + 1;
    updateSession(repo.id, { iteration: newIteration });

    // Detect phase from current item
    let phase: string | null = null;
    let phaseNudge: string | null = null;

    if (session.currentItem?.title) {
      const itemLower = session.currentItem.title.toLowerCase();
      if (itemLower.startsWith('explore')) {
        phase = 'Explore';
        phaseNudge = 'Research only. No building yet.';
      } else if (itemLower.startsWith('design')) {
        phase = 'Design';
        phaseNudge = 'Define the approach. Diagram if complex.';
      } else if (itemLower.startsWith('prototype')) {
        phase = 'Prototype';
        phaseNudge = 'Use mock/fake data. Real backend comes later.';
      } else if (itemLower.startsWith('feedback')) {
        phase = 'Feedback';
        phaseNudge = 'Get explicit approval. One approval ≠ blanket approval.';
      } else if (itemLower.startsWith('implement')) {
        phase = 'Implement';
        phaseNudge = 'Build the real logic. Feedback was approved.';
      } else if (itemLower.startsWith('polish')) {
        phase = 'Polish';
        phaseNudge = 'Error states, edge cases, loading states.';
      }
    }

    // Generate contextual reminder based on iteration count
    let reminder: string;
    if (newIteration <= 2) {
      reminder = 'Stay focused on the current item.';
    } else if (newIteration <= 5) {
      reminder = 'Multiple iterations - ensure you\'re making progress.';
    } else if (newIteration <= 10) {
      reminder = 'Extended work cycle. Consider summarizing what\'s been done/agreed.';
    } else {
      reminder = 'Long session. Check in with user if unsure about direction.';
    }

    // Stronger reminder for Feedback phase
    if (phase === 'Feedback') {
      if (newIteration >= 3) {
        reminder = 'Still in Feedback? Easy to get sidetracked here. Stay focused on getting approval for THIS feature.';
      }
      if (newIteration >= 6) {
        reminder = 'Extended Feedback cycle. Summarize what\'s agreed, document decisions, then move on.';
      }
    }

    return json({
      success: true,
      data: {
        iteration: newIteration,
        task: session.currentTask,
        currentItem: session.currentItem,
        phase,
        phaseNudge,
        reminder
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
