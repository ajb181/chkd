import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting } from '$lib/server/db/queries';
import { SpecParser } from '$lib/server/spec/parser';
import path from 'path';

// POST /api/spec/expand - Use AI to expand a feature idea into a story
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, areaCode } = body;

    if (!title) {
      return json({ success: false, error: 'title is required' }, { status: 400 });
    }

    const apiKey = getSetting('anthropic_api_key');

    if (!apiKey) {
      // No API key - return a simple template instead
      return json({
        success: true,
        data: {
          title,
          description: '',
          story: `As a user, I want ${title.toLowerCase()} so that I can improve my workflow.`,
          suggestedArea: areaCode || guessArea(title),
          aiGenerated: false
        }
      });
    }

    // Get existing spec context
    let specContext = '';
    if (repoPath) {
      try {
        const specPath = path.join(repoPath, 'docs', 'SPEC.md');
        const parser = new SpecParser();
        const spec = await parser.parseFile(specPath);
        specContext = `\nExisting areas: ${spec.areas.map(a => a.name).join(', ')}`;
        specContext += `\nRecent items: ${spec.areas.flatMap(a => a.items.slice(0, 3).map(i => i.title)).join(', ')}`;
      } catch {
        // No spec yet
      }
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are helping expand a feature idea into a brief user story for a software spec.

Feature idea: "${title}"
${areaCode ? `Target area: ${areaCode}` : ''}
${specContext}

Respond with JSON only (no markdown):
{
  "story": "As a [user type], I want [feature] so that [benefit].",
  "description": "One sentence expanding on the feature.",
  "suggestedArea": "SD" or "FE" or "BE" (Site Design, Frontend, or Backend)
}

Keep it brief and practical. Max 2 sentences each.`
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      // Fall back to template
      return json({
        success: true,
        data: {
          title,
          description: '',
          story: `As a user, I want ${title.toLowerCase()} so that I can improve my workflow.`,
          suggestedArea: areaCode || guessArea(title),
          aiGenerated: false
        }
      });
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    try {
      const parsed = JSON.parse(content);
      return json({
        success: true,
        data: {
          title,
          description: parsed.description || '',
          story: parsed.story || '',
          suggestedArea: areaCode || parsed.suggestedArea || guessArea(title),
          aiGenerated: true
        }
      });
    } catch {
      // JSON parse failed, use template
      return json({
        success: true,
        data: {
          title,
          description: '',
          story: `As a user, I want ${title.toLowerCase()} so that I can improve my workflow.`,
          suggestedArea: areaCode || guessArea(title),
          aiGenerated: false
        }
      });
    }
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// Simple heuristic to guess area from title
function guessArea(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('api') || lower.includes('endpoint') || lower.includes('database') || lower.includes('server')) {
    return 'BE';
  }
  if (lower.includes('component') || lower.includes('store') || lower.includes('state') || lower.includes('hook')) {
    return 'FE';
  }
  if (lower.includes('page') || lower.includes('layout') || lower.includes('design') || lower.includes('ui') || lower.includes('ux')) {
    return 'SD';
  }
  return 'FE'; // Default to frontend
}
