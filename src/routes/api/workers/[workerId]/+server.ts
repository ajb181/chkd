/**
 * Worker API - Get, Update, Delete a specific worker
 *
 * GET /api/workers/:workerId - Get worker details
 * PATCH /api/workers/:workerId - Update worker (status, heartbeat, progress)
 * DELETE /api/workers/:workerId - Stop and remove worker
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getWorkerById,
  updateWorker,
  updateWorkerHeartbeat,
  deleteWorker,
  createWorkerHistory,
  createSignal,
  getRepoById
} from '$lib/server/db/queries';
import { removeWorktree } from '$lib/server/git/worktree';
import type { WorkerStatus, WorkerHeartbeatResponse } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
  const { workerId } = params;

  const worker = getWorkerById(workerId);
  if (!worker) {
    return json({ success: false, error: 'Worker not found' }, { status: 404 });
  }

  return json({ success: true, data: worker });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const { workerId } = params;

  const worker = getWorkerById(workerId);
  if (!worker) {
    return json({ success: false, error: 'Worker not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { status, message, progress, heartbeat } = body;

    // If just a heartbeat, use the optimized function
    if (heartbeat && !status) {
      const updated = updateWorkerHeartbeat(workerId, message, progress);
      if (!updated) {
        return json({ success: false, error: 'Failed to update heartbeat' }, { status: 500 });
      }

      // Check if worker should pause/abort
      const response: WorkerHeartbeatResponse = {
        status: updated.status,
        shouldPause: updated.status === 'paused',
        shouldAbort: updated.status === 'error',
      };

      // Include next task if available
      if (updated.nextTaskId && updated.nextTaskTitle) {
        response.nextTask = {
          taskId: updated.nextTaskId,
          taskTitle: updated.nextTaskTitle
        };
      }

      return json({ success: true, data: response });
    }

    // Full update
    const updates: Partial<{
      status: WorkerStatus;
      message: string;
      progress: number;
    }> = {};

    if (status !== undefined) {
      // Validate status transition
      const validStatuses: WorkerStatus[] = ['pending', 'waiting', 'working', 'paused', 'merging', 'merged', 'error'];
      if (!validStatuses.includes(status)) {
        return json({ success: false, error: `Invalid status: ${status}` }, { status: 400 });
      }
      updates.status = status;
    }

    if (message !== undefined) {
      updates.message = message;
    }

    if (progress !== undefined) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return json({ success: false, error: 'Progress must be 0-100' }, { status: 400 });
      }
      updates.progress = progress;
    }

    const updated = updateWorker(workerId, updates);
    if (!updated) {
      return json({ success: false, error: 'Failed to update worker' }, { status: 500 });
    }

    // Create signal for status changes
    if (status && status !== worker.status) {
      createSignal({
        repoId: worker.repoId,
        type: 'status',
        message: `Worker ${workerId.substring(0, 20)}... status: ${worker.status} → ${status}`,
        workerId
      });
    }

    return json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating worker:', error);
    return json({
      success: false,
      error: error.message || 'Failed to update worker'
    }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  const { workerId } = params;
  const force = url.searchParams.get('force') === 'true';
  const deleteBranch = url.searchParams.get('deleteBranch') !== 'false'; // Default true - clean up fully

  const worker = getWorkerById(workerId);
  if (!worker) {
    return json({ success: false, error: 'Worker not found' }, { status: 404 });
  }

  // Prevent deleting active workers without force
  if (!force && worker.status === 'working') {
    return json({
      success: false,
      error: 'Worker is actively working. Use force=true to delete anyway.',
      hint: 'Set status to paused first, or use force=true'
    }, { status: 400 });
  }

  try {
    // Get repo for worktree cleanup
    const repo = getRepoById(worker.repoId);

    // Remove git worktree if it exists
    if (repo && worker.worktreePath) {
      try {
        await removeWorktree(repo.path, worker.worktreePath, deleteBranch);
      } catch (error: any) {
        console.warn(`Failed to remove worktree: ${error.message}`);
        // Continue with worker deletion even if worktree removal fails
      }
    }

    // Create history record
    const startedAt = worker.startedAt ? new Date(worker.startedAt + 'Z').getTime() : null;
    const durationMs = startedAt ? Date.now() - startedAt : null;

    createWorkerHistory({
      workerId: worker.id,
      repoId: worker.repoId,
      taskId: worker.taskId || undefined,
      taskTitle: worker.taskTitle || undefined,
      branchName: worker.branchName || undefined,
      outcome: 'aborted',
      startedAt: worker.startedAt || undefined,
      durationMs: durationMs || undefined
    });

    // Delete worker record
    deleteWorker(workerId);

    // Create signal
    if (repo) {
      createSignal({
        repoId: repo.id,
        type: 'warning',
        message: `Worker ${workerId.substring(0, 20)}... was stopped${force ? ' (forced)' : ''}`
      });
    }

    return json({
      success: true,
      data: { deleted: true, worktreeRemoved: true, branchDeleted: deleteBranch }
    });
  } catch (error: any) {
    console.error('Error deleting worker:', error);
    return json({
      success: false,
      error: error.message || 'Failed to delete worker'
    }, { status: 500 });
  }
};
