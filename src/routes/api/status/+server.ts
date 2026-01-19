import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllRepos, getSession, getRepoByPath } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import path from 'path';
import fs from 'fs/promises';

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

    // Get spec progress
    let spec = null;
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    try {
      await fs.access(specPath);
      const parser = new SpecParser();
      spec = await parser.parseFile(specPath);
    } catch {
      // No spec file
    }

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

    if (spec) {
      status.spec = {
        title: spec.title,
        progress: spec.progress,
        totalItems: spec.totalItems,
        completedItems: spec.completedItems,
        currentPhase: spec.phases.find(p => p.status === 'in-progress'),
      };
    }

    // Human-readable summary
    if (session.currentTask) {
      status.summary = `Working on: ${session.currentTask.title} (iteration ${session.iteration})`;
    } else if (spec) {
      const nextItem = spec.phases
        .flatMap(p => p.items)
        .find(i => !i.completed);
      status.summary = nextItem
        ? `Ready. Next up: ${nextItem.title}`
        : `All ${spec.totalItems} items complete! 🎉`;
    } else {
      status.summary = 'No spec found. Create docs/SPEC.md to get started.';
    }

    return json({ success: true, data: status });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
