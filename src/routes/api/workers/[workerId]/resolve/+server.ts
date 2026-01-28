/**
 * Worker Conflict Resolution API
 *
 * POST /api/workers/:workerId/resolve - Resolve merge conflicts
 *   - strategy: 'ours' (keep worker changes) | 'theirs' (keep main) | 'abort'
 *   - files: optional array of specific files to resolve
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getWorkerById,
  updateWorker,
  createSignal,
  getRepoById,
  dismissSignal,
  getActiveSignals
} from '$lib/server/db/queries';
import {
  resolveConflicts,
  mergeBranch,
  removeWorktree,
  getDefaultBranch,
  getBranchStats
} from '$lib/server/git/worktree';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ params, request }) => {
  const { workerId } = params;

  const worker = getWorkerById(workerId);
  if (!worker) {
    return json({ success: false, error: 'Worker not found' }, { status: 404 });
  }

  const repo = getRepoById(worker.repoId);
  if (!repo) {
    return json({ success: false, error: 'Repository not found' }, { status: 404 });
  }

  if (!worker.branchName || !worker.worktreePath) {
    return json({ success: false, error: 'Worker has no branch/worktree' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { strategy, files } = body;

    if (!strategy || !['ours', 'theirs', 'abort'].includes(strategy)) {
      return json({
        success: false,
        error: 'Invalid strategy. Use: ours, theirs, or abort'
      }, { status: 400 });
    }

    const targetBranch = await getDefaultBranch(repo.path);

    // Dismiss any existing conflict signals for this worker
    const signals = getActiveSignals(repo.id, true);
    for (const signal of signals) {
      if (signal.workerId === workerId && signal.type === 'help') {
        dismissSignal(signal.id);
      }
    }

    if (strategy === 'abort') {
      // Abort the merge and reset the worker
      try {
        await execAsync(`git merge --abort`, { cwd: worker.worktreePath });
      } catch {
        // May fail if no merge in progress, that's ok
      }

      updateWorker(workerId, {
        status: 'paused',
        message: 'Merge aborted - awaiting instructions'
      });

      createSignal({
        repoId: repo.id,
        type: 'info',
        message: `Merge aborted for ${worker.taskId || workerId}`,
        workerId
      });

      return json({ success: true, data: { resolved: false, aborted: true } });
    }

    // Update status
    updateWorker(workerId, {
      status: 'merging',
      message: `Resolving conflicts using ${strategy === 'ours' ? 'worker' : 'main'} changes...`
    });

    // Resolve conflicts in the worktree
    await resolveConflicts(worker.worktreePath, strategy, files);

    // Commit the resolution
    const commitMessage = `Resolve conflicts: keep ${strategy === 'ours' ? 'worker' : 'main'} changes for ${worker.taskTitle || worker.taskId}`;

    try {
      await execAsync(`git commit -m "${commitMessage}"`, { cwd: worker.worktreePath });
    } catch {
      // Commit may fail if nothing to commit
    }

    // Now try to merge into main
    const mergeResult = await mergeBranch(repo.path, worker.branchName, targetBranch,
      `Merge ${worker.branchName}: ${worker.taskTitle || worker.taskId} (conflicts resolved)`);

    if (!mergeResult.success) {
      updateWorker(workerId, {
        status: 'error',
        message: 'Merge still failed after resolution'
      });

      createSignal({
        repoId: repo.id,
        type: 'warning',
        message: `Merge still failed for ${worker.taskId || workerId}`,
        workerId,
        actionRequired: true,
        actionOptions: ['View Details', 'Manual Resolution', 'Abort']
      });

      return json({
        success: false,
        error: 'Merge failed after conflict resolution',
        data: { conflicts: mergeResult.conflicts }
      }, { status: 500 });
    }

    // Success! Get stats and clean up
    const stats = await getBranchStats(repo.path, worker.branchName, targetBranch).catch(() => ({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      files: []
    }));

    updateWorker(workerId, {
      status: 'merged',
      progress: 100,
      message: 'Merged successfully (conflicts resolved)'
    });

    // Clean up worktree
    try {
      await removeWorktree(repo.path, worker.worktreePath, true);
    } catch (error: any) {
      console.warn(`Failed to cleanup worktree: ${error.message}`);
    }

    createSignal({
      repoId: repo.id,
      type: 'decision',
      message: `✅ Merged ${worker.taskId}: ${worker.taskTitle} (conflicts resolved)`,
      details: {
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions,
        strategy
      },
      workerId
    });

    return json({
      success: true,
      data: {
        resolved: true,
        merged: true,
        stats
      }
    });
  } catch (error: any) {
    console.error('Error resolving conflicts:', error);

    updateWorker(workerId, { status: 'error', message: error.message });

    return json({
      success: false,
      error: error.message || 'Failed to resolve conflicts'
    }, { status: 500 });
  }
};
