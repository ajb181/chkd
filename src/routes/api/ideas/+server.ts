import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath } from '$lib/server/db/queries';
import {
  getIdeas,
  getIdeasByStatus,
  createIdea,
  getIdeaByQuery,
  updateIdeaStatus,
  deleteIdea
} from '$lib/server/ideas';

// Email notification stub - logs notifications
// To enable real emails, implement sendEmail() with your email service (SendGrid, SES, etc.)
async function notifySubmitter(
  email: string | null,
  ideaTitle: string,
  status: 'approved' | 'rejected',
  feedback?: string,
  promotedTo?: string
): Promise<void> {
  if (!email) return;

  const subject = status === 'approved'
    ? `Your idea "${ideaTitle}" has been approved!`
    : `Update on your idea "${ideaTitle}"`;

  const body = status === 'approved'
    ? `Great news! Your feature idea "${ideaTitle}" has been approved and added to the development plan${promotedTo ? ` as ${promotedTo}` : ''}.\n\n${feedback ? `Feedback: ${feedback}` : ''}`
    : `Your feature idea "${ideaTitle}" was reviewed but won't be implemented at this time.\n\nFeedback: ${feedback || 'No additional feedback provided.'}`;

  // Log the notification (actual email sending requires configuration)
  console.log(`[IDEAS] Email notification would be sent to ${email}:`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body: ${body.substring(0, 100)}...`);

  // TODO: Implement actual email sending
  // await sendEmail({ to: email, subject, body });
}

// GET /api/ideas - List ideas for a repo (from markdown file)
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const status = url.searchParams.get('status') as 'submitted' | 'reviewing' | 'approved' | 'rejected' | null;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    const repoId = repo?.id || 'unknown';

    const ideas = status
      ? getIdeasByStatus(repoPath, repoId, status)
      : getIdeas(repoPath, repoId);

    return json({ success: true, data: ideas });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// POST /api/ideas - Submit a new idea (adds to markdown file)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, description, submitterEmail } = body;

    if (!repoPath || !title || !description) {
      return json({
        success: false,
        error: 'repoPath, title, and description are required'
      }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    const repoId = repo?.id || 'unknown';

    const idea = createIdea(repoPath, repoId, title, description, submitterEmail);

    return json({
      success: true,
      data: {
        id: idea.id,
        title: idea.title,
        status: idea.status,
        message: `Idea submitted: ${title}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// PATCH /api/ideas - Update idea status (move to review, approve, reject)
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, query, status, feedback, promotedTo } = body;

    if (!repoPath || !query || !status) {
      return json({
        success: false,
        error: 'repoPath, query, and status are required'
      }, { status: 400 });
    }

    const validStatuses = ['submitted', 'reviewing', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    const repoId = repo?.id || 'unknown';

    const idea = getIdeaByQuery(repoPath, repoId, query);
    if (!idea) {
      return json({ success: false, error: `Idea not found: ${query}` }, { status: 404 });
    }

    const updated = updateIdeaStatus(repoPath, idea.id, status, feedback, promotedTo);
    if (!updated) {
      return json({ success: false, error: 'Failed to update idea status' }, { status: 500 });
    }

    // Send email notification for approve/reject status changes
    if ((status === 'approved' || status === 'rejected') && idea.submitterEmail) {
      await notifySubmitter(idea.submitterEmail, idea.title, status, feedback, promotedTo);
    }

    const statusMessages = {
      submitted: 'returned to submitted',
      reviewing: 'moved to review',
      approved: 'approved',
      rejected: 'rejected'
    };

    return json({
      success: true,
      data: {
        id: idea.id,
        title: idea.title,
        status,
        feedback,
        promotedTo,
        message: `Idea ${statusMessages[status as keyof typeof statusMessages]}: ${idea.title}`
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// DELETE /api/ideas - Delete an idea
export const DELETE: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const id = url.searchParams.get('id');

    if (!repoPath || !id) {
      return json({ success: false, error: 'repoPath and id are required' }, { status: 400 });
    }

    const deleted = deleteIdea(repoPath, id);
    if (!deleted) {
      return json({ success: false, error: 'Idea not found' }, { status: 404 });
    }

    return json({ success: true, data: { message: 'Idea deleted' } });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
