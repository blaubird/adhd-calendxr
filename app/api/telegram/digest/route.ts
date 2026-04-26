import { NextResponse } from 'next/server';

import { env } from 'app/env';
import { sendTelegramDigest } from 'app/lib/telegram/digest';
import {
  createTelegramClient,
  getTelegramDigestChatId,
  getTelegramUserId,
} from 'app/lib/telegram/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  if (!env.CRON_SECRET) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    console.error('[telegram/digest] CRON_SECRET is missing');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    console.warn('[telegram/digest] unauthorized request');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const client = createTelegramClient();
    const chatId = getTelegramDigestChatId();
    const userId = await getTelegramUserId();
    const result = await sendTelegramDigest(client, chatId, userId);

    return NextResponse.json({
      ok: true,
      day: result.day,
      itemCount: result.itemCount,
      activeCount: result.activeCount,
    });
  } catch (error: any) {
    console.error('[telegram/digest] failed', { message: error?.message, name: error?.name });
    return NextResponse.json({ ok: false, error: 'Digest failed' }, { status: 500 });
  }
}
