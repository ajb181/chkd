import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { review } from '$lib/server/review/index.js';
import type { ReviewRequest } from '$lib/server/review/types.js';

/**
 * POST /api/review-build
 *
 * Stateless UI review service.
 * Screenshots a URL, compares against wireframe/scope, returns feedback.
 *
 * Request:
 * {
 *   "url": "http://localhost:3000/login",
 *   "wireframePath": "/path/to/design.png",  // optional: .png/.jpg or .html
 *   "scope": "login form with email/password validation"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "matches": ["Has email input", "Has password input"],
 *     "gaps": ["Missing forgot password link"],
 *     "suggestions": ["Add loading state to submit button"],
 *     "score": 85
 *   }
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json() as ReviewRequest;

    // Validate required fields
    if (!body.url) {
      return json({ success: false, error: 'url is required' }, { status: 400 });
    }
    if (!body.scope) {
      return json({ success: false, error: 'scope is required' }, { status: 400 });
    }

    // Run review
    const result = await review(body);

    return json({
      success: true,
      data: result
    });
  } catch (error) {
    return json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
};
