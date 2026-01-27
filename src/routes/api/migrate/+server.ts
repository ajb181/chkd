import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { migrateSpec } from '$lib/server/db/migrate-spec';

// POST /api/migrate - Migrate SPEC.md to database
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const result = await migrateSpec(repoPath);

    if (!result.success) {
      return json({ success: false, error: result.errors.join(', ') }, { status: 500 });
    }

    return json({
      success: true,
      data: {
        repoId: result.repoId,
        itemsImported: result.itemsImported,
        itemsSkipped: result.itemsSkipped,
        itemsUpdated: result.itemsUpdated,
        specDeleted: result.specDeleted
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
