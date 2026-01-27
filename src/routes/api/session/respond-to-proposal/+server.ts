import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getProposalById,
  addScopeChange,
  addFlaggedItem,
  generateId,
  type FlaggedItem,
} from '$lib/server/proposal';
import { getWorkflowByType } from '$lib/server/spec/workflow';
import { getRepoByPath } from '$lib/server/db/queries';
import { createItem, getNextSectionNumber } from '$lib/server/db/items';
import type { AreaCode } from '$lib/types';

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

      // Add to DB if it's an 'add' type
      let addedToDb = false;
      if (proposal.type === 'add') {
        const repo = getRepoByPath(repoPath);
        if (repo) {
          const targetArea = (proposal.areaCode || 'FE') as AreaCode;

          try {
            const sectionNumber = getNextSectionNumber(repo.id, targetArea);
            const displayId = `${targetArea}.${sectionNumber}`;
            const fullTitle = `${displayId} ${proposal.title}`;

            const newItem = createItem({
              repoId: repo.id,
              displayId,
              title: fullTitle,
              description: proposal.description || undefined,
              areaCode: targetArea,
              sectionNumber,
              sortOrder: sectionNumber - 1,
              status: 'open',
              priority: 'medium'
            });

            // Add workflow sub-tasks
            const tasks = getWorkflowByType(undefined, targetArea);
            tasks.forEach((taskTitle: string, index: number) => {
              createItem({
                repoId: repo.id,
                displayId: `${displayId}.${index + 1}`,
                title: taskTitle,
                areaCode: targetArea,
                sectionNumber,
                parentId: newItem.id,
                sortOrder: index,
                status: 'open',
                priority: 'medium'
              });
            });

            addedToDb = true;
          } catch (err) {
            console.error('Failed to add to DB:', err);
          }
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
          addedToDb,
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
