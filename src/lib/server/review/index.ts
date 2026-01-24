/**
 * Review Service
 * Stateless UI review - screenshot, compare with Claude, return feedback
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { ReviewRequest, ReviewResult } from './types.js';
import { captureScreenshot, captureWireframe, type ScreenshotOptions, type ViewportPreset } from './screenshot.js';

export type { ReviewRequest, ReviewResult };
export { VIEWPORTS, type ViewportPreset, type ScreenshotOptions } from './screenshot.js';

/** Extended request with viewport option */
export interface ReviewRequestWithOptions extends ReviewRequest {
  viewport?: ViewportPreset | { width: number; height: number };
}

/** Intermediate result after screenshot capture */
export interface CapturedScreenshots {
  /** Screenshot of the live URL */
  urlScreenshot: Buffer;
  /** Screenshot or image of wireframe (if provided) */
  wireframeImage: Buffer | null;
  /** Viewport used */
  viewport: { width: number; height: number };
}

/**
 * Capture screenshots for review
 *
 * Step 1 of review process (BE.27)
 */
export async function captureForReview(
  request: ReviewRequestWithOptions
): Promise<CapturedScreenshots> {
  const options: ScreenshotOptions = {
    viewport: request.viewport || 'desktop'
  };

  // Capture the live URL
  const urlResult = await captureScreenshot(request.url, options);

  // Handle wireframe if provided
  let wireframeImage: Buffer | null = null;
  if (request.wireframePath) {
    if (!existsSync(request.wireframePath)) {
      throw new Error(`Wireframe not found: ${request.wireframePath}`);
    }

    // Try to screenshot HTML, otherwise read as image
    const wireframeResult = await captureWireframe(request.wireframePath, options);
    if (wireframeResult) {
      wireframeImage = wireframeResult.screenshot;
    } else {
      // Read image file directly
      wireframeImage = await readFile(request.wireframePath);
    }
  }

  return {
    urlScreenshot: urlResult.screenshot,
    wireframeImage,
    viewport: urlResult.viewport
  };
}

/**
 * Review a URL against a wireframe/scope
 *
 * 1. Screenshot the URL with Playwright (BE.27 ✓)
 * 2. If wireframe is HTML, screenshot it too (BE.27 ✓)
 * 3. Send to Claude API for visual comparison (BE.28 TODO)
 * 4. Return structured feedback
 */
export async function review(request: ReviewRequestWithOptions): Promise<ReviewResult> {
  // Step 1: Capture screenshots (BE.27)
  const screenshots = await captureForReview(request);

  // Step 2: Analyze with Claude API (BE.28 - TODO)
  // For now, return placeholder indicating screenshots were captured
  throw new Error(
    `Screenshots captured successfully (${screenshots.urlScreenshot.length} bytes). ` +
    `Claude API analysis not yet implemented. See BE.28.`
  );
}
