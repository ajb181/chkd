/**
 * Workers API - List and Spawn Workers
 *
 * GET /api/workers?repoPath=... - List workers for a repo
 * POST /api/workers - Spawn a new worker
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getRepoByPath,
  getActiveWorkers,
  createWorker,
  countActiveWorkers,
  getWorkerByTask,
  getWorkerByWorktreePath,
  createSignal
} from '$lib/server/db/queries';
import {
  createWorktree,
  copyChkdFilesToWorktree,
  generateWorkerId,
  generateBranchName,
  generateWorktreePath,
  getUsername
} from '$lib/server/git/worktree';
import type { SpawnWorkerRequest, SpawnWorkerResponse } from '$lib/types';

const MAX_WORKERS = 2; // Start with 2 max

export const GET: RequestHandler = async ({ url }) => {
  const repoPath = url.searchParams.get('repoPath');
  const worktreePath = url.searchParams.get('worktreePath');

  // Look up worker by worktree path (for workers identifying themselves)
  if (worktreePath) {
    const worker = getWorkerByWorktreePath(worktreePath);
    return json({
      success: true,
      data: { worker }
    });
  }

  if (!repoPath) {
    return json({ success: false, error: 'repoPath is required' }, { status: 400 });
  }

  const repo = getRepoByPath(repoPath);
  if (!repo) {
    return json({ success: false, error: 'Repository not found' }, { status: 404 });
  }

  const workers = getActiveWorkers(repo.id);

  return json({
    success: true,
    data: {
      workers,
      maxWorkers: MAX_WORKERS,
      canSpawn: workers.length < MAX_WORKERS
    }
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json() as SpawnWorkerRequest;
    const { repoPath, taskId, taskTitle, username: providedUsername, nextTaskId, nextTaskTitle } = body;

    // Validate required fields
    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }
    if (!taskId) {
      return json({ success: false, error: 'taskId is required' }, { status: 400 });
    }
    if (!taskTitle) {
      return json({ success: false, error: 'taskTitle is required' }, { status: 400 });
    }

    // Get repo
    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({ success: false, error: 'Repository not found' }, { status: 404 });
    }

    // Check max workers
    const activeCount = countActiveWorkers(repo.id);
    if (activeCount >= MAX_WORKERS) {
      return json({
        success: false,
        error: `Maximum workers reached (${MAX_WORKERS}). Wait for one to complete.`
      }, { status: 400 });
    }

    // Check if task is already being worked on
    const existingWorker = getWorkerByTask(repo.id, taskId);
    if (existingWorker) {
      return json({
        success: false,
        error: `Task ${taskId} is already being worked on by worker ${existingWorker.id}`
      }, { status: 400 });
    }

    // Get username
    const username = providedUsername || await getUsername(repoPath);

    // Find next available worker number
    const workers = getActiveWorkers(repo.id);
    const usedNumbers = workers.map(w => {
      const match = w.worktreePath?.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
    let workerNumber = 1;
    while (usedNumbers.includes(workerNumber)) {
      workerNumber++;
    }

    // Generate identifiers
    const workerId = generateWorkerId(username);
    const branchName = generateBranchName(username, taskId, taskTitle);
    const worktreePath = generateWorktreePath(repoPath, username, workerNumber);

    // Create git worktree
    try {
      await createWorktree(repoPath, worktreePath, branchName);
      // Copy chkd workflow files (CLAUDE.md, docs/, .claude/) to worktree
      copyChkdFilesToWorktree(repoPath, worktreePath);
    } catch (error: any) {
      return json({
        success: false,
        error: `Failed to create worktree: ${error.message}`
      }, { status: 500 });
    }

    // Create worker record
    const worker = createWorker({
      id: workerId,
      repoId: repo.id,
      username,
      taskId,
      taskTitle,
      worktreePath,
      branchName,
      nextTaskId,
      nextTaskTitle
    });

    // Create manager signal
    createSignal({
      repoId: repo.id,
      type: 'status',
      message: `Worker spawned for ${taskId}: ${taskTitle}`,
      details: { workerId, worktreePath, branchName },
      workerId
    });

    const response: SpawnWorkerResponse = {
      workerId: worker.id,
      worktreePath: worker.worktreePath!,
      branchName: worker.branchName!,
      command: `cd "${worktreePath}" && claude`
    };

    return json({ success: true, data: response });
  } catch (error: any) {
    console.error('Error spawning worker:', error);
    return json({
      success: false,
      error: error.message || 'Failed to spawn worker'
    }, { status: 500 });
  }
};
