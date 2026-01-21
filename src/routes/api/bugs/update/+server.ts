import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateBug } from '$lib/server/db/queries';

// POST /api/bugs/update - Update a bug's title and description
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { bugId, title, description } = body;

    if (!bugId) {
      return json({ success: false, error: 'bugId is required' }, { status: 400 });
    }

    if (!title || !title.trim()) {
      return json({ success: false, error: 'title is required' }, { status: 400 });
    }

    const updated = updateBug(bugId, title.trim(), description?.trim() || null);

    if (!updated) {
      return json({ success: false, error: 'Bug not found' }, { status: 404 });
    }

    return json({
      success: true,
      data: { bugId, title: title.trim(), description: description?.trim() || null }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
