import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { VERSION } from '$lib/version';

export const GET: RequestHandler = async () => {
  return json({
    status: 'ok',
    version: VERSION,
    timestamp: new Date().toISOString()
  });
};
