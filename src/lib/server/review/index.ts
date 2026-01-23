/**
 * Review Service
 * Stateless UI review - screenshot, compare with Claude, return feedback
 */

import type { ReviewRequest, ReviewResult } from './types.js';

export type { ReviewRequest, ReviewResult };

/**
 * Review a URL against a wireframe/scope
 *
 * 1. Screenshot the URL with Playwright
 * 2. If wireframe is HTML, screenshot it too
 * 3. Send to Claude API for visual comparison
 * 4. Return structured feedback
 */
export async function review(request: ReviewRequest): Promise<ReviewResult> {
  // TODO: Implement in BE.27 (Screenshot capture)
  // TODO: Implement in BE.28 (Claude API visual analysis)

  throw new Error('Review service not yet implemented. See BE.27 and BE.28.');
}
