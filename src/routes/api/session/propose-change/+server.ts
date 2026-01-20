import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  addProposal,
  addAuditItem,
  generateId,
  type Proposal,
  type AuditItem,
} from '$lib/server/proposal';
import { getSession, getRepoByPath } from '$lib/server/db/queries';

// POST /api/session/propose-change - Claude proposes a scope change
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, type, title, description, reason, size, areaCode } = body;

    if (!repoPath || !title || !type) {
      return json({
        success: false,
        error: 'repoPath, title, and type are required',
      }, { status: 400 });
    }

    if (!['add', 'modify', 'remove'].includes(type)) {
      return json({
        success: false,
        error: 'type must be: add, modify, or remove',
      }, { status: 400 });
    }

    const proposal: Proposal = {
      id: generateId(),
      repoPath,
      type,
      title,
      description: description || '',
      reason: reason || '',
      size: size || 'big',
      source: 'claude',
      status: 'pending',
      areaCode,
      createdAt: new Date(),
    };

    addProposal(proposal);

    // If it's small, auto-approve and add to audit queue
    if (size === 'small') {
      const repo = getRepoByPath(repoPath);
      const session = repo ? getSession(repo.id) : null;

      const auditItem: AuditItem = {
        id: generateId(),
        repoPath,
        title,
        description,
        type: 'quick-fix',
        addedDuringTask: session?.currentTask?.id || 'unknown',
        tested: false,
        reviewed: false,
        createdAt: new Date(),
      };

      addAuditItem(auditItem);
      proposal.status = 'approved';
      proposal.respondedAt = new Date();

      return json({
        success: true,
        data: {
          proposalId: proposal.id,
          status: 'auto-approved-small',
          auditItemId: auditItem.id,
          message: 'Small change auto-approved. Added to audit queue. Continue working.',
          waitForResponse: false,
        },
      });
    }

    // Big change - Claude should wait for user response
    return json({
      success: true,
      data: {
        proposalId: proposal.id,
        status: 'pending',
        message: 'Proposal created. Waiting for user response.',
        waitForResponse: true,
      },
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
