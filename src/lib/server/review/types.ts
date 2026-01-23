/**
 * Review Service Types
 * Stateless UI review - screenshot, compare, return feedback
 */

export interface ReviewRequest {
  /** Live URL to screenshot and review */
  url: string;
  /** Optional local file path: .png/.jpg (image) or .html (will screenshot) */
  wireframePath?: string;
  /** What to check: "login form", "matches design", etc. */
  scope: string;
}

export interface ReviewResult {
  /** What matches the spec/wireframe */
  matches: string[];
  /** What's missing or wrong */
  gaps: string[];
  /** Improvement suggestions */
  suggestions: string[];
  /** Overall match score 0-100 */
  score: number;
}
