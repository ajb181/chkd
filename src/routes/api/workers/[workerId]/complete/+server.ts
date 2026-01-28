/**
 * Worker Complete API - Signal worker task completion and handle merge
 *
 * POST /api/workers/:workerId/complete - Worker signals task is done
 *   - Checks for merge conflicts
 *   - Auto-merges if clean, or returns conflict info
 *   - Updates worker status and creates history
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getWorkerById,
  updateWorker,
  createWorkerHistory,
  createSignal,
  getRepoById
} from '$lib/server/db/queries';
import {
  checkConflicts,
  mergeBranch,
  getBranchStats,
  removeWorktree,
  getDefaultBranch
} from '$lib/server/git/worktree';
import type { WorkerCompleteResponse } from '$lib/types';

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

  if (!worker.branchName) {
    return json({ success: false, error: 'Worker has no branch to merge' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { autoMerge = true, commitMessage } = body;

    // Update worker status to merging
    updateWorker(workerId, { status: 'merging', message: 'Checking for conflicts...' });

    // Get target branch
    const targetBranch = await getDefaultBranch(repo.path);

    // Check for conflicts first
    const conflicts = await checkConflicts(repo.path, worker.branchName, targetBranch);

    if (conflicts.length > 0) {
      // Has conflicts - needs manual resolution
      updateWorker(workerId, {
        status: 'paused',
        message: `Merge conflicts detected in ${conflicts.length} file(s)`
      });

      createSignal({
        repoId: repo.id,
        type: 'help',
        message: `Worker ${worker.taskId || workerId} has merge conflicts`,
        details: {
          conflicts: conflicts.map(c => ({ file: c.file, type: c.type })),
          branchName: worker.branchName,
          targetBranch
        },
        workerId,
        actionRequired: true,
        actionOptions: ['View Conflicts', 'Keep Worker Changes', 'Keep Main', 'Abort']
      });

      const response: WorkerCompleteResponse = {
        mergeStatus: 'conflicts',
        conflicts
      };

      return json({ success: true, data: response });
    }

    // No conflicts - can merge
    if (!autoMerge) {
      // Just report clean merge is possible
      updateWorker(workerId, {
        status: 'paused',
        message: 'Ready to merge (awaiting approval)'
      });

      createSignal({
        repoId: repo.id,
        type: 'decision',
        message: `Worker ${worker.taskId || workerId} ready to merge`,
        details: { branchName: worker.branchName, targetBranch },
        workerId,
        actionRequired: true,
        actionOptions: ['Merge Now', 'Review First', 'Abort']
      });

      const response: WorkerCompleteResponse = {
        mergeStatus: 'pending'
      };

      return json({ success: true, data: response });
    }

    // Auto-merge
    const message = commitMessage ||
      `Merge ${worker.branchName}: ${worker.taskTitle || worker.taskId}`;

    const mergeResult = await mergeBranch(repo.path, worker.branchName, targetBranch, message);

    if (!mergeResult.success) {
      // Merge failed unexpectedly
      updateWorker(workerId, { status: 'error', message: 'Merge failed unexpectedly' });

      createSignal({
        repoId: repo.id,
        type: 'warning',
        message: `Worker ${worker.taskId || workerId} merge failed`,
        workerId
      });

      return json({
        success: false,
        error: 'Merge failed',
        data: { conflicts: mergeResult.conflicts }
      }, { status: 500 });
    }

    // Merge successful!
    const stats = await getBranchStats(repo.path, worker.branchName, targetBranch).catch(() => ({
      filesChanged: mergeResult.filesChanged || 0,
      insertions: mergeResult.insertions || 0,
      deletions: mergeResult.deletions || 0,
      files: []
    }));

    // Update worker status
    updateWorker(workerId, { status: 'merged', progress: 100, message: 'Merged successfully' });

    // Create history
    const startedAt = worker.startedAt ? new Date(worker.startedAt + 'Z').getTime() : null;
    const durationMs = startedAt ? Date.now() - startedAt : null;

    createWorkerHistory({
      workerId: worker.id,
      repoId: worker.repoId,
      taskId: worker.taskId || undefined,
      taskTitle: worker.taskTitle || undefined,
      branchName: worker.branchName,
      outcome: 'merged',
      mergeConflicts: 0,
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
      startedAt: worker.startedAt || undefined,
      durationMs: durationMs || undefined
    });

    // Clean up worktree
    if (worker.worktreePath) {
      try {
        await removeWorktree(repo.path, worker.worktreePath, true); // Delete branch too
      } catch (error: any) {
        console.warn(`Failed to cleanup worktree: ${error.message}`);
      }
    }

    // Create success signal
    createSignal({
      repoId: repo.id,
      type: 'decision',
      message: `✅ Merged ${worker.taskId}: ${worker.taskTitle}`,
      details: {
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions,
        commitHash: mergeResult.commitHash
      },
      workerId
    });

    const response: WorkerCompleteResponse = {
      mergeStatus: 'clean'
    };

    // Include next task if available
    if (worker.nextTaskId && worker.nextTaskTitle) {
      response.nextTask = {
        taskId: worker.nextTaskId,
        taskTitle: worker.nextTaskTitle
      };
    }

    return json({ success: true, data: response });
  } catch (error: any) {
    console.error('Error completing worker:', error);

    updateWorker(workerId, { status: 'error', message: error.message });

    return json({
      success: false,
      error: error.message || 'Failed to complete worker'
    }, { status: 500 });
  }
};
