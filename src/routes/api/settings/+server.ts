import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, setSetting } from '$lib/server/db/queries';

// GET /api/settings - Get settings (masks API key)
export const GET: RequestHandler = async () => {
  const apiKey = getSetting('anthropic_api_key');

  return json({
    success: true,
    data: {
      hasApiKey: Boolean(apiKey),
      apiKeyPreview: apiKey ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}` : null
    }
  });
};

// POST /api/settings - Update settings
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (apiKey !== undefined) {
      if (apiKey) {
        // Validate it looks like an Anthropic key
        if (!apiKey.startsWith('sk-ant-')) {
          return json({
            success: false,
            error: 'Invalid API key format. Anthropic keys start with sk-ant-'
          }, { status: 400 });
        }
        setSetting('anthropic_api_key', apiKey);
      } else {
        // Clear the key
        setSetting('anthropic_api_key', '');
      }
    }

    return json({
      success: true,
      data: {
        hasApiKey: Boolean(getSetting('anthropic_api_key'))
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
