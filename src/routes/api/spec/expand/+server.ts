import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, getRepoByPath } from '$lib/server/db/queries';
import { getItemsByArea } from '$lib/server/db/items';
import type { AreaCode } from '$lib/types';

// Area metadata
const AREA_NAMES: Record<string, string> = {
  'SD': 'Site Design',
  'FE': 'Frontend',
  'BE': 'Backend',
  'FUT': 'Future Areas'
};

// POST /api/spec/expand - Use AI to expand a feature idea into a story
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, title, areaCode } = body;

    if (!title) {
      return json({ success: false, error: 'title is required' }, { status: 400 });
    }

    const apiKey = getSetting('anthropic_api_key');
    const llmTone = getSetting('llm_tone') || 'default';
    const llmCustomPrefix = getSetting('llm_custom_prefix') || '';

    if (!apiKey) {
      // No API key - return a simple template instead
      return json({
        success: true,
        data: {
          title,
          polishedTitle: title,
          description: '',
          story: `As a user, I want ${title.toLowerCase()} so that I can improve my workflow.`,
          suggestedArea: areaCode || guessArea(title),
          tasks: [],
          aiGenerated: false
        }
      });
    }

    // Get existing spec context from DB
    let specContext = '';
    if (repoPath) {
      try {
        const repo = getRepoByPath(repoPath);
        if (repo) {
          const areas: AreaCode[] = ['SD', 'FE', 'BE', 'FUT'];
          const areaNames = areas.map(code => AREA_NAMES[code]).join(', ');
          specContext = `\nExisting areas: ${areaNames}`;

          // Get recent items from each area
          const recentItems: string[] = [];
          for (const code of areas) {
            const items = getItemsByArea(repo.id, code);
            recentItems.push(...items.slice(0, 3).map(i => i.title));
          }
          if (recentItems.length > 0) {
            specContext += `\nRecent items: ${recentItems.slice(0, 9).join(', ')}`;
          }
        }
      } catch {
        // No spec yet
      }
    }

    // Build tone instruction
    let toneInstruction = '';
    if (llmTone === 'formal') {
      toneInstruction = '\n\nUSE A FORMAL, PROFESSIONAL TONE in all generated text.';
    } else if (llmTone === 'casual') {
      toneInstruction = '\n\nUSE A CASUAL, FRIENDLY TONE in all generated text.';
    } else if (llmTone === 'concise') {
      toneInstruction = '\n\nBE EXTREMELY CONCISE - use shortest possible descriptions.';
    }

    // Build custom instructions
    const customInstructions = llmCustomPrefix
      ? `\n\nUSER CUSTOM INSTRUCTIONS:\n${llmCustomPrefix}`
      : '';

    // Call Anthropic API with enhanced prompt
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You help prepare feature ideas for a software spec. Your job:${toneInstruction}${customInstructions}

1. POLISH the title: Fix spelling/grammar, make it concise (under 80 chars ideally)
2. PRESERVE context: If the title is long/rambling, extract the key idea as title and move details to description
3. DON'T over-polish: Keep the user's voice and intent. Just clean it up.
4. Generate a brief user story
5. Suggest which area it belongs to
6. Generate smart workflow tasks adapted to this specific feature

WORKFLOW PHILOSOPHY (8 steps):
1. Explore first (research problem, check existing code)
2. Design approach + endpoint contracts
3. Prototype with mock data (fast iteration)
4. Get user feedback BEFORE full implementation
5. Implement real logic
6. Polish based on actual usage
7. Capture and document any changes (if applicable)
8. Get final sign-off from user

Feature idea: "${title}"
${areaCode ? `Target area: ${areaCode}` : ''}
${specContext}

Respond with JSON only (no markdown code blocks):
{
  "polishedTitle": "Clean, concise title (under 80 chars)",
  "description": "Any context moved from title + brief expansion. Can be empty if title was already concise.",
  "story": "As a [user type], I want [feature] so that [benefit].",
  "suggestedArea": "SD" or "FE" or "BE",
  "tasks": ["Task 1: specific to this feature", "Task 2: adapted step", ...]
}

For tasks: Adapt the 8-step workflow to this feature. Keep tasks SHORT (under 60 chars).
Simple fixes: 3-4 steps. Medium features: 5-6 steps. Complex features: all 8.`
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
          polishedTitle: title,
          description: '',
          story: `As a user, I want ${title.toLowerCase()} so that I can improve my workflow.`,
          suggestedArea: areaCode || guessArea(title),
          tasks: [],
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
          polishedTitle: parsed.polishedTitle || title,
          description: parsed.description || '',
          story: parsed.story || '',
          suggestedArea: areaCode || parsed.suggestedArea || guessArea(title),
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          aiGenerated: true
        }
      });
    } catch {
      // JSON parse failed, use template
      return json({
        success: true,
        data: {
          title,
          polishedTitle: title,
          description: '',
          story: `As a user, I want ${title.toLowerCase()} so that I can improve my workflow.`,
          suggestedArea: areaCode || guessArea(title),
          tasks: [],
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
