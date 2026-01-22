import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, setSetting } from '$lib/server/db/queries';

// GET /api/settings/llm - Get LLM personalization settings
export const GET: RequestHandler = async () => {
  const tone = getSetting('llm_tone') || 'default';
  const customPrefix = getSetting('llm_custom_prefix') || '';

  return json({
    success: true,
    data: {
      tone,
      customPrefix
    }
  });
};

// POST /api/settings/llm - Update LLM personalization settings
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { tone, customPrefix } = body;

    if (tone !== undefined) {
      const validTones = ['default', 'formal', 'casual', 'concise'];
      if (!validTones.includes(tone)) {
        return json({
          success: false,
          error: `Invalid tone. Must be one of: ${validTones.join(', ')}`
        }, { status: 400 });
      }
      setSetting('llm_tone', tone);
    }

    if (customPrefix !== undefined) {
      // Limit custom prefix to 500 characters
      if (customPrefix.length > 500) {
        return json({
          success: false,
          error: 'Custom instructions must be under 500 characters'
        }, { status: 400 });
      }
      setSetting('llm_custom_prefix', customPrefix);
    }

    return json({
      success: true,
      data: {
        tone: getSetting('llm_tone') || 'default',
        customPrefix: getSetting('llm_custom_prefix') || ''
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
