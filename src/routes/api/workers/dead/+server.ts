/**
 * Dead Worker Detection API
 *
 * GET /api/workers/dead?repoPath=...&thresholdMs=...
 * Returns workers that haven't sent a heartbeat within the threshold
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getActiveWorkers } from '$lib/server/db/queries';

const DEFAULT_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export const GET: RequestHandler = async ({ url }) => {
  const repoPath = url.searchParams.get('repoPath');
  const thresholdMs = parseInt(url.searchParams.get('thresholdMs') || String(DEFAULT_THRESHOLD_MS), 10);

  if (!repoPath) {
    return json({ success: false, error: 'repoPath is required' }, { status: 400 });
  }

  const repo = getRepoByPath(repoPath);
  if (!repo) {
    return json({ success: false, error: 'Repository not found' }, { status: 404 });
  }

  const workers = getActiveWorkers(repo.id);
  const now = Date.now();

  // Pending workers should transition within 5 minutes, otherwise they're likely dead
  const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
  
  const deadWorkers = workers.filter(worker => {
    // Check for stuck PENDING/WAITING workers
    if (worker.status === 'pending' || worker.status === 'waiting') {
      // If created too long ago and still pending, likely dead (Claude session closed before starting)
      if (worker.createdAt) {
        const createdTime = new Date(worker.createdAt + 'Z').getTime();
        if ((now - createdTime) > PENDING_TIMEOUT_MS) {
          return true; // Flag as dead - stuck in pending
        }
      }
      return false;
    }

    // Check heartbeat for active workers
    if (!worker.heartbeatAt) {
      // No heartbeat ever - check if started long ago
      if (worker.startedAt) {
        const startedTime = new Date(worker.startedAt + 'Z').getTime();
        return (now - startedTime) > thresholdMs;
      }
      return false;
    }

    const lastHeartbeat = new Date(worker.heartbeatAt + 'Z').getTime();
    return (now - lastHeartbeat) > thresholdMs;
  });

  return json({
    success: true,
    data: {
      deadWorkers,
      thresholdMs,
      checkedAt: new Date().toISOString(),
      totalActive: workers.length,
      deadCount: deadWorkers.length
    }
  });
};
