/**
 * Claude API Visual Analysis Module
 * Sends screenshots to Claude for UI review
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ReviewResult } from './types.js';

// API key - same pattern as cli/llm.ts
const API_KEY = process.env.CHKD_API_KEY || process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!API_KEY) {
      throw new Error('No API key found. Set CHKD_API_KEY or ANTHROPIC_API_KEY environment variable.');
    }
    client = new Anthropic({ apiKey: API_KEY });
  }
  return client;
}

export interface AnalyzeInput {
  /** Screenshot of the live URL (PNG buffer) */
  screenshot: Buffer;
  /** Optional wireframe/design to compare against (PNG/JPG buffer) */
  wireframe?: Buffer | null;
  /** What to check for: "login form", "matches design", etc. */
  scope: string;
}

/** System prompt for UI review */
const SYSTEM_PROMPT = `You are a UI reviewer for web applications. Your job is to analyze screenshots and provide structured feedback.

You will receive:
1. A screenshot of a live web page
2. Optionally, a wireframe or design mockup to compare against
3. A scope describing what to check for

Your response MUST be valid JSON with this exact structure:
{
  "matches": ["What's correct or matches the requirements"],
  "gaps": ["What's missing or doesn't match"],
  "suggestions": ["Improvement ideas"]
}

RULES:
- Be specific and actionable in your feedback
- For "matches": list what IS present and working
- For "gaps": list what's MISSING or WRONG
- For "suggestions": list IMPROVEMENTS (not critical issues)
- Keep each item to one sentence
- If comparing to wireframe, focus on visual/layout differences
- If no wireframe, check against the scope description
- Return 3-7 items per category (fewer if not applicable)
- Return ONLY the JSON object, no markdown or explanation`;

/**
 * Analyze a screenshot using Claude's vision API
 */
export async function analyzeScreenshot(input: AnalyzeInput): Promise<ReviewResult> {
  const { screenshot, wireframe, scope } = input;

  // Build content array with images
  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

  // Add screenshot
  content.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: screenshot.toString('base64')
    }
  });

  // Add wireframe if provided
  if (wireframe) {
    content.push({
      type: 'text',
      text: 'Above is the live screenshot. Below is the wireframe/design to compare against:'
    });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: wireframe.toString('base64')
      }
    });
  }

  // Add scope
  const scopeText = wireframe
    ? `Compare the screenshot to the wireframe. Scope: ${scope}`
    : `Review the screenshot. Scope: ${scope}`;

  content.push({
    type: 'text',
    text: scopeText
  });

  // Call Claude API
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }]
  });

  // Extract text response
  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON response
  const parsed = parseAnalysisResponse(textBlock.text);

  // Calculate score
  const totalItems = parsed.matches.length + parsed.gaps.length;
  const score = totalItems === 0
    ? 100
    : Math.round((parsed.matches.length / totalItems) * 100);

  return {
    matches: parsed.matches,
    gaps: parsed.gaps,
    suggestions: parsed.suggestions,
    score
  };
}

/**
 * Parse Claude's JSON response, handling potential formatting issues
 */
function parseAnalysisResponse(text: string): {
  matches: string[];
  gaps: string[];
  suggestions: string[];
} {
  // Try to extract JSON from response (might have markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    };
  } catch (e) {
    throw new Error(`Failed to parse Claude response: ${e}`);
  }
}

/**
 * Check if API key is configured
 */
export function isAnalysisAvailable(): boolean {
  return !!API_KEY;
}
