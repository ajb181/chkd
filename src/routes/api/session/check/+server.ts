import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, getSetting } from '$lib/server/db/queries';
import { getItemsByRepo, getChildren } from '$lib/server/db/items';

// Area names for display
const AREA_NAMES: Record<string, string> = {
  'SD': 'Site Design',
  'FE': 'Frontend',
  'BE': 'Backend',
  'FUT': 'Future Areas'
};

// POST /api/session/check - Check if a request is on-plan using AI
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, request: userRequest } = body;

    if (!repoPath || !userRequest) {
      return json({ success: false, error: 'repoPath and request are required' }, { status: 400 });
    }

    const repo = getRepoByPath(repoPath);
    if (!repo) {
      return json({
        success: true,
        data: {
          onPlan: false,
          matchedItem: null,
          feedback: 'Repository not in database - all work is off-plan',
          canContinue: true
        }
      });
    }

    // Get all items from DB
    const allItems = getItemsByRepo(repo.id);
    if (allItems.length === 0) {
      return json({
        success: true,
        data: {
          onPlan: false,
          matchedItem: null,
          feedback: 'No spec items in database - all work is off-plan',
          canContinue: true
        }
      });
    }

    // Group items by area and build summary
    const itemsByArea = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (!item.parentId) { // Only top-level items
        if (!itemsByArea.has(item.areaCode)) {
          itemsByArea.set(item.areaCode, []);
        }
        itemsByArea.get(item.areaCode)!.push(item);
      }
    }

    const specSummary = ['SD', 'FE', 'BE', 'FUT']
      .filter(code => itemsByArea.has(code))
      .map(code => {
        const areaItems = itemsByArea.get(code)!;
        const items = areaItems.map(item => {
          const status = item.status === 'done' ? '✓' : item.status === 'in-progress' ? '~' : ' ';
          return `  [${status}] ${item.title}${item.description ? ` - ${item.description}` : ''}`;
        }).join('\n');
        return `## ${AREA_NAMES[code]} (${code})\n${items || '  (no items)'}`;
      }).join('\n\n');

    // Try AI matching if API key is available
    const apiKey = getSetting('anthropic_api_key');

    if (apiKey) {
      const aiResult = await checkWithAI(apiKey, userRequest, specSummary, allItems);
      if (aiResult) {
        return json({ success: true, data: aiResult });
      }
    }

    // Fall back to simple string matching
    return json({
      success: true,
      data: simpleMatch(userRequest, allItems)
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};

// AI-powered matching
async function checkWithAI(
  apiKey: string,
  userRequest: string,
  specSummary: string,
  allItems: any[]
): Promise<{
  onPlan: boolean;
  matchedItem: { id: string; title: string; area: string } | null;
  feedback: string;
  canContinue: boolean;
} | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are checking if a developer's request matches items in their project spec.

PROJECT SPEC:
${specSummary}

DEVELOPER REQUEST: "${userRequest}"

Analyze whether this request matches or relates to any item in the spec.

Respond with JSON only (no markdown):
{
  "onPlan": true/false,
  "matchedItemTitle": "exact title from spec if matched, or null",
  "matchedArea": "area code like BE, FE, SD if matched, or null",
  "feedback": "Brief explanation. If on-plan, say which item it matches. If off-plan, explain why and whether it's a reasonable addition or scope creep.",
  "recommendation": "proceed" or "add_to_spec" or "reconsider"
}

Be helpful but honest. Some off-plan requests are valid new features to add. Others are scope creep to avoid.`
        }]
      })
    });

    if (!response.ok) {
      console.error('Anthropic API error:', await response.text());
      return null; // Fall back to simple matching
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    try {
      const parsed = JSON.parse(content);

      // Find the actual item if matched
      let matchedItem = null;
      if (parsed.matchedItemTitle && parsed.matchedArea) {
        const item = allItems.find(i =>
          i.title.toLowerCase() === parsed.matchedItemTitle.toLowerCase() &&
          i.areaCode === parsed.matchedArea
        );
        if (item) {
          matchedItem = { id: item.id, title: item.title, area: item.areaCode };
        }
      }

      return {
        onPlan: parsed.onPlan === true,
        matchedItem,
        feedback: parsed.feedback || (parsed.onPlan ? 'Matches spec' : 'Not in spec'),
        canContinue: parsed.recommendation !== 'reconsider'
      };
    } catch {
      return null; // JSON parse failed, fall back
    }
  } catch {
    return null; // API call failed, fall back
  }
}

// Simple string-based matching (fallback)
function simpleMatch(
  userRequest: string,
  allItems: any[]
): {
  onPlan: boolean;
  matchedItem: { id: string; title: string; area: string } | null;
  feedback: string;
  canContinue: boolean;
} {
  const query = userRequest.toLowerCase();

  for (const item of allItems) {
    if (item.parentId) continue; // Skip children

    const titleLower = item.title.toLowerCase();
    const descLower = (item.description || '').toLowerCase();

    // Check for keyword matches
    const words = query.split(/\s+/).filter((w: string) => w.length > 3);
    const matchCount = words.filter((w: string) =>
      titleLower.includes(w) || descLower.includes(w)
    ).length;

    if (matchCount >= Math.min(2, words.length) || titleLower.includes(query)) {
      return {
        onPlan: true,
        matchedItem: { id: item.id, title: item.title, area: item.areaCode },
        feedback: `Matches: "${item.title}" in ${AREA_NAMES[item.areaCode]}`,
        canContinue: true
      };
    }
  }

  return {
    onPlan: false,
    matchedItem: null,
    feedback: `"${userRequest}" is not in the spec. Use 'chkd add' to add it, or continue anyway.`,
    canContinue: true
  };
}
