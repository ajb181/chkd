import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getProposalById,
  addScopeChange,
  addFlaggedItem,
  generateId,
  type FlaggedItem,
} from '$lib/server/proposal';
import { addFeatureWithWorkflow } from '$lib/server/spec/writer';
import path from 'path';

// POST /api/session/respond-to-proposal - User responds to a proposal
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, proposalId, response } = body;

    if (!repoPath || !proposalId || !response) {
      return json({
        success: false,
        error: 'repoPath, proposalId, and response are required',
      }, { status: 400 });
    }

    if (!['approve', 'reject', 'send-to-chkd'].includes(response)) {
      return json({
        success: false,
        error: 'response must be: approve, reject, or send-to-chkd',
      }, { status: 400 });
    }

    const proposal = getProposalById(repoPath, proposalId);

    if (!proposal) {
      return json({ success: false, error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.status !== 'pending') {
      return json({
        success: false,
        error: `Proposal already ${proposal.status}`,
      }, { status: 400 });
    }

    proposal.respondedAt = new Date();

    if (response === 'approve') {
      proposal.status = 'approved';

      // Add to spec if it's an 'add' type
      let addedToSpec = false;
      if (proposal.type === 'add') {
        const specPath = path.join(repoPath, 'docs', 'SPEC.md');
        const targetArea = proposal.areaCode || 'FE';

        try {
          await addFeatureWithWorkflow(specPath, targetArea, proposal.title, proposal.description);
          addedToSpec = true;
        } catch (err) {
          console.error('Failed to add to spec:', err);
        }
      }

      // Log as scope change
      addScopeChange(repoPath, {
        type: 'added',
        itemId: proposal.id,
        title: proposal.title,
        timestamp: new Date(),
      });

      return json({
        success: true,
        data: {
          status: 'approved',
          message: 'Change approved. Claude can continue.',
          addedToSpec,
        },
      });
    }

    if (response === 'reject') {
      proposal.status = 'rejected';
      return json({
        success: true,
        data: {
          status: 'rejected',
          message: 'Change rejected. Claude should skip this.',
        },
      });
    }

    if (response === 'send-to-chkd') {
      proposal.status = 'sent-to-chkd';

      // Add to flagged for discussion
      const flaggedItem: FlaggedItem = {
        id: generateId(),
        repoPath,
        title: proposal.title,
        description: proposal.description,
        reason: proposal.reason,
        urgency: 'medium',
        type: 'feature',
        status: 'pending',
        createdAt: new Date(),
      };
      addFlaggedItem(flaggedItem);

      return json({
        success: true,
        data: {
          status: 'sent-to-chkd',
          flaggedItemId: flaggedItem.id,
          message: 'Flagged for discussion. Claude should work on other things.',
        },
      });
    }

    return json({ success: false, error: 'Unknown response type' }, { status: 400 });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
