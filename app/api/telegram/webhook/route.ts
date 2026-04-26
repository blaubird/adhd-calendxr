import { NextResponse } from 'next/server';

import { env } from 'app/env';
import { handleTelegramUpdate } from 'app/lib/telegram/handler';
import { createTelegramClient, getTelegramUserId } from 'app/lib/telegram/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[telegram/webhook] TELEGRAM_WEBHOOK_SECRET is missing');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!providedSecret || providedSecret !== expectedSecret) {
    console.warn('[telegram/webhook] rejected update with invalid secret');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    console.warn('[telegram/webhook] malformed JSON payload');
    return NextResponse.json({ ok: false, error: 'Malformed payload' }, { status: 400 });
  }

  try {
    const client = createTelegramClient();
    const userId = await getTelegramUserId();
    await handleTelegramUpdate(update, client, userId);
  } catch (error: any) {
    console.error('[telegram/webhook] handler failed', { message: error?.message, name: error?.name });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, mode: 'telegram-webhook' });
}
