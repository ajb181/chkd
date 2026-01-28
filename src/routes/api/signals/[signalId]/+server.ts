/**
 * Individual Signal API
 *
 * GET /api/signals/:signalId - Get signal by ID
 * DELETE /api/signals/:signalId - Dismiss signal
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSignalById, dismissSignal } from '$lib/server/db/queries';

export const GET: RequestHandler = async ({ params }) => {
  const { signalId } = params;

  const signal = getSignalById(signalId);
  if (!signal) {
    return json({ success: false, error: 'Signal not found' }, { status: 404 });
  }

  return json({ success: true, data: signal });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const { signalId } = params;

  const signal = getSignalById(signalId);
  if (!signal) {
    return json({ success: false, error: 'Signal not found' }, { status: 404 });
  }

  dismissSignal(signalId);

  return json({ success: true, data: { dismissed: true } });
};
