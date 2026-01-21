import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting } from '$lib/server/db/queries';

// POST /api/bugs/polish - Polish a bug title
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { title } = body;

    if (!title) {
      return json({ success: false, error: 'title is required' }, { status: 400 });
    }

    const apiKey = getSetting('anthropic_api_key');

    if (!apiKey) {
      // No API key - return original
      return json({
        success: true,
        data: {
          original: title,
          polished: title,
          aiGenerated: false
        }
      });
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
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Polish this bug report title. Fix spelling/grammar, make it clear and concise (under 80 chars).
Keep the user's intent - don't over-polish. If already good, return as-is.

Bug title: "${title}"

Respond with JSON only (no markdown):
{
  "polished": "The cleaned up bug title"
}`
        }]
      })
    });

    if (!response.ok) {
      return json({
        success: true,
        data: {
          original: title,
          polished: title,
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
          original: title,
          polished: parsed.polished || title,
          aiGenerated: true
        }
      });
    } catch {
      return json({
        success: true,
        data: {
          original: title,
          polished: title,
          aiGenerated: false
        }
      });
    }
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
