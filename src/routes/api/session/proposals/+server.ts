import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPendingProposals, getProposals } from '$lib/server/proposal';

// GET /api/session/proposals - Get proposals (pending by default)
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const all = url.searchParams.get('all') === 'true';

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const proposals = all ? getProposals(repoPath) : getPendingProposals(repoPath);

    return json({
      success: true,
      data: {
        proposals,
        count: proposals.length,
        pending: getPendingProposals(repoPath).length,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
