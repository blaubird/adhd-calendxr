import { TelegramClient } from './client';
import { env } from 'app/env';
import { detectTelegramIntent, generateDraftsFromText } from './ai';
import { loadExpandedItems } from 'app/lib/load-items';
import { formatDayKey, nowInTz } from 'app/lib/datetime';
import { addDays, format } from 'date-fns';
import {
  cancelTelegramPendingDraft,
  confirmTelegramPendingDraft,
  createTelegramPendingDraft,
} from 'app/db';
import {
  formatTelegramDay,
  formatTelegramDraftMessage,
  formatTelegramRange,
  formatTelegramSavedDraft,
} from './format';
import {
  TELEGRAM_AI_COOLDOWN_MS,
  formatTelegramUnsupportedMessage,
  gateTelegramTextBeforeAi,
  isLikelyCalendarQuery,
  validateTelegramQueryRange,
} from './intent';

const aiCooldownByChat = new Map<string, number>();

type TelegramRouteMetrics = {
  telegramDurationMs: number;
  usedAiRouter: boolean;
  usedDraftAi: boolean;
  aiRouterDurationMs?: number;
  draftGenerationDurationMs?: number;
  dbQueryDurationMs?: number;
};

function durationSince(start: number) {
  return Date.now() - start;
}

function logTelegramTiming(route: string, startedAt: number, metrics: TelegramRouteMetrics) {
  console.log('[Telegram timing]', {
    source: 'telegram',
    route,
    durationMs: durationSince(startedAt),
    usedAiRouter: metrics.usedAiRouter,
    usedDraftAi: metrics.usedDraftAi,
    aiRouterDurationMs: metrics.aiRouterDurationMs,
    draftGenerationDurationMs: metrics.draftGenerationDurationMs,
    dbQueryDurationMs: metrics.dbQueryDurationMs,
    telegramDurationMs: metrics.telegramDurationMs || undefined,
  });
}

async function timeTelegram<T>(metrics: TelegramRouteMetrics, operation: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    metrics.telegramDurationMs += durationSince(startedAt);
  }
}

async function sendDraftProposals(client: TelegramClient, chatId: string, text: string, metrics: TelegramRouteMetrics) {
  await timeTelegram(metrics, () => client.sendMessage(chatId, 'Thinking...'));

  metrics.usedDraftAi = true;
  const draftStartedAt = Date.now();
  const aiResult = await generateDraftsFromText(text);
  metrics.draftGenerationDurationMs = durationSince(draftStartedAt);

  if (aiResult.needClarification) {
    await timeTelegram(metrics, () => client.sendMessage(chatId, `Clarification needed:\n\n${aiResult.questions.join('\n')}`));
    return;
  }

  if (!aiResult.drafts || aiResult.drafts.length === 0) {
    await timeTelegram(metrics, () => client.sendMessage(chatId, 'No drafts could be interpreted.'));
    return;
  }

  await timeTelegram(metrics, () => client.sendMessage(chatId, `I prepared ${aiResult.drafts.length} draft(s).`));

  for (const draft of aiResult.drafts) {
    const pendingDraft = await createTelegramPendingDraft(chatId, draft);

    await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramDraftMessage(draft), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Confirm', callback_data: `confirm:${pendingDraft.id}` },
            { text: 'Cancel', callback_data: `cancel:${pendingDraft.id}` }
          ]
        ]
      }
    }));
  }
}

export async function handleTelegramUpdate(update: any, client: TelegramClient, userId: number) {
  const startedAt = Date.now();
  const metrics: TelegramRouteMetrics = {
    telegramDurationMs: 0,
    usedAiRouter: false,
    usedDraftAi: false,
  };
  const allowedChatId = env.TELEGRAM_ALLOWED_CHAT_ID;
  
  // 1. Extract Chat ID & Validate
  let chatId: string | undefined;
  if (update.message) chatId = update.message.chat.id.toString();
  else if (update.callback_query) chatId = update.callback_query.message.chat.id.toString();

  if (!chatId || (allowedChatId && chatId !== allowedChatId)) {
    if (chatId) {
      console.log(`[Telegram] Unauthorized access attempt from chat ${chatId}`);
    }
    return;
  }

  // 2. Handle Callback Queries (Confirm / Cancel)
  if (update.callback_query) {
    const data = String(update.callback_query.data || '');
    const queryId = update.callback_query.id;
    const messageId = update.callback_query.message?.message_id;

    if (data.startsWith('confirm:')) {
      const draftId = data.split(':')[1];
      if (!draftId) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, 'Draft expired or not found.'));
        if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, 'Draft expired or not found.'));
        logTelegramTiming('callback', startedAt, metrics);
        return;
      }

      try {
        const dbStartedAt = Date.now();
        const result = await confirmTelegramPendingDraft(userId, draftId, chatId);
        metrics.dbQueryDurationMs = durationSince(dbStartedAt);
        if (!result) {
          await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, 'Draft expired or not found.'));
          if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, 'Draft expired or not found.'));
          logTelegramTiming('callback', startedAt, metrics);
          return;
        }

        const draft = result.draft;
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, 'Saved!'));
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, formatTelegramSavedDraft(draft)));
        }
      } catch (err: any) {
        console.error('[Telegram Handler] Confirm failed', { message: err?.message });
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, 'Failed to save.'));
        if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, `❌ Failed to save: ${err.message}`));
      }
      logTelegramTiming('callback', startedAt, metrics);
      return;
    }

    if (data.startsWith('cancel:')) {
      const draftId = data.split(':')[1];
      if (draftId) {
        const dbStartedAt = Date.now();
        await cancelTelegramPendingDraft(draftId, chatId);
        metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      }
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, 'Canceled.'));
      if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, `❌ Canceled draft.`));
      logTelegramTiming('callback', startedAt, metrics);
      return;
    }

    await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, 'Unknown action.'));
    logTelegramTiming('callback', startedAt, metrics);
    return;
  }

  // 3. Handle Messages
  if (update.message && update.message.text) {
    const text = update.message.text as string;
    
    // Commands
    if (text === '/start') {
      await timeTelegram(metrics, () => client.sendMessage(chatId, `Calendar Brain is awake 🐸\nCommands:\n/today\n/tomorrow\n/week\n/help\n\nSend me a task or event in natural language and I'll prepare a draft.`));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (text === '/help') {
      await timeTelegram(metrics, () => client.sendMessage(chatId, `Commands:\n/today - today's items\n/tomorrow - tomorrow's items\n/week - week overview\n\nExamples:\nсоздай завтра в 18:00 стоматолог\nкаждую пятницу в 10:00 волонтёрство\nзавтра купить таблетки и отправить письмо`));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (text === '/today') {
      const now = nowInTz(new Date());
      const dayStr = formatDayKey(now);
      const dbStartedAt = Date.now();
      const items = await loadExpandedItems(userId, dayStr, dayStr);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      const humanDay = format(now, 'dd.MM.yyyy');
      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramDay(items, `Today — ${humanDay}`), { parse_mode: 'Markdown' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (text === '/tomorrow') {
      const tomorrow = addDays(nowInTz(new Date()), 1);
      const dayStr = formatDayKey(tomorrow);
      const dbStartedAt = Date.now();
      const items = await loadExpandedItems(userId, dayStr, dayStr);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      const humanDay = format(tomorrow, 'dd.MM.yyyy');
      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramDay(items, `Tomorrow — ${humanDay}`), { parse_mode: 'Markdown' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (text === '/week') {
      const now = nowInTz(new Date());
      const rangeStart = formatDayKey(now);
      const rangeEnd = formatDayKey(addDays(now, 6));
      const dbStartedAt = Date.now();
      const items = await loadExpandedItems(userId, rangeStart, rangeEnd);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramRange(items, rangeStart, rangeEnd, 'Next 7 days'), { parse_mode: 'Markdown' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    const gated = gateTelegramTextBeforeAi(text);
    if (!gated.allowed) {
      if (gated.message) await timeTelegram(metrics, () => client.sendMessage(chatId, gated.message));
      logTelegramTiming('rejected', startedAt, metrics);
      return;
    }

    const lastAiAt = aiCooldownByChat.get(chatId) || 0;
    const nowMs = Date.now();
    if (nowMs - lastAiAt < TELEGRAM_AI_COOLDOWN_MS) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, 'Please give me a moment before the next AI-routed request.'));
      logTelegramTiming('rejected', startedAt, metrics);
      return;
    }
    aiCooldownByChat.set(chatId, nowMs);

    // Query-like text -> AI intent router. Other safe text -> direct draft generation.
    try {
      if (!isLikelyCalendarQuery(gated.text)) {
        await sendDraftProposals(client, chatId, gated.text, metrics);
        logTelegramTiming('draft_direct', startedAt, metrics);
        return;
      }

      metrics.usedAiRouter = true;
      const routerStartedAt = Date.now();
      const intent = await detectTelegramIntent(gated.text);
      metrics.aiRouterDurationMs = durationSince(routerStartedAt);

      if (intent.intent === 'calendar_query') {
        const range = validateTelegramQueryRange(intent.query);
        if (!range) {
          await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUnsupportedMessage()));
          logTelegramTiming('calendar_query_router', startedAt, metrics);
          return;
        }

        const dbStartedAt = Date.now();
        const items = await loadExpandedItems(userId, range.startDay, range.endDay);
        metrics.dbQueryDurationMs = durationSince(dbStartedAt);
        const label = range.rangeDays === 1 ? range.label : range.label || `Next ${range.rangeDays} days`;
        await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramRange(items, range.startDay, range.endDay, label), {
          parse_mode: 'Markdown',
        }));
        logTelegramTiming('calendar_query_router', startedAt, metrics);
        return;
      }

      if (intent.intent === 'draft_create') {
        await sendDraftProposals(client, chatId, intent.draftInput, metrics);
        logTelegramTiming('calendar_query_router', startedAt, metrics);
        return;
      }

      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUnsupportedMessage()));
      logTelegramTiming('calendar_query_router', startedAt, metrics);
    } catch (err: any) {
      console.error('[Telegram Handler] AI error', err);
      await timeTelegram(metrics, () => client.sendMessage(chatId, `Failed to handle Telegram request: ${err.message}`));
      logTelegramTiming('error', startedAt, metrics);
    }
  }
}
