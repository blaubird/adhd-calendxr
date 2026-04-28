import { TelegramClient } from './client';
import { env } from 'app/env';
import { detectTelegramIntent, generateDraftsFromText } from './ai';
import { loadExpandedItems } from 'app/lib/load-items';
import { formatDayKey, normalizeDayString, nowInTz, parseDayKey } from 'app/lib/datetime';
import { addDays } from 'date-fns';
import {
  cancelTelegramPendingDraft,
  confirmTelegramPendingDraft,
  createTelegramPendingDraft,
  getTelegramSettings,
  setTelegramLanguage,
  setTelegramRemindersEnabled,
} from 'app/db';
import {
  formatTelegramDay,
  formatTelegramDraftMessage,
  formatTelegramLanguageKeyboard,
  formatTelegramLanguageMessage,
  formatTelegramRange,
  formatTelegramSavedDraft,
  formatTelegramSettings,
  formatTelegramSettingsKeyboard,
} from './format';
import {
  buildAndSaveTelegramListContext,
  deleteTelegramRef,
  formatTelegramDayList,
  formatTelegramDayListKeyboard,
  formatTelegramCancelKeyboard,
  formatTelegramItemPickerKeyboard,
  formatTelegramMoveDestinationKeyboard,
  formatTelegramNumberedRange,
  formatTelegramPendingChoiceKeyboard,
  formatTelegramRefPreview,
  formatTelegramUpcoming,
  getTelegramListContext,
  matchTelegramRefsByText,
  markTelegramRefDone,
  moveTelegramRef,
  parseTelegramDayArgs,
  parseTelegramMoveArgs,
  resolveTelegramItemRef,
  type TelegramItemRef,
  type TelegramManagementAction,
} from './manage';
import { isTelegramLanguage, t, type TelegramLanguage } from './i18n';
import {
  TELEGRAM_AI_COOLDOWN_MS,
  formatTelegramUnsupportedMessage,
  gateTelegramTextBeforeAi,
  type TelegramIntent,
  validateTelegramQueryRange,
} from './intent';

const aiCooldownByChat = new Map<string, number>();

type PendingTelegramAction = {
  type: TelegramManagementAction;
  contextId: string | null;
  targetDate?: string | null;
  targetTimeStart?: string | null;
  targetTimeEnd?: string | null;
  createdAt: number;
};

const pendingActionByChat = new Map<string, PendingTelegramAction>();
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

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

function normalizeTelegramCommand(text: string) {
  const firstToken = text.trim().split(/\s+/)[0] || '';
  const match = firstToken.match(/^\/([a-z0-9_]+)(?:@[\w_]+)?$/i);
  return match?.[1]?.toLowerCase() || null;
}

function commandArgs(text: string) {
  return text.trim().split(/\s+/).slice(1);
}

function parseItemNumber(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getPendingAction(chatId: string) {
  const pending = pendingActionByChat.get(chatId);
  if (!pending) return null;
  if (Date.now() - pending.createdAt > PENDING_ACTION_TTL_MS) {
    pendingActionByChat.delete(chatId);
    return null;
  }
  return pending;
}

function setPendingAction(chatId: string, pending: Omit<PendingTelegramAction, 'createdAt'>) {
  pendingActionByChat.set(chatId, { ...pending, createdAt: Date.now() });
}

function clearPendingAction(chatId: string) {
  pendingActionByChat.delete(chatId);
}

function safeErrorMeta(err: any) {
  return {
    errorName: err?.name,
    errorMessage: err?.message,
    causeName: err?.cause?.name,
    causeMessage: err?.cause?.message,
  };
}

async function trySendGracefulError(client: TelegramClient, chatId: string, language: TelegramLanguage, metrics: TelegramRouteMetrics) {
  const messages = t(language);
  try {
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.requestFailed('Please try again.')));
  } catch (err: any) {
    console.error('[Telegram Handler] Failed to send graceful error', safeErrorMeta(err));
  }
}

async function sendLanguagePicker(client: TelegramClient, chatId: string, language: TelegramLanguage, metrics: TelegramRouteMetrics) {
  await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramLanguageMessage(language), {
    parse_mode: 'HTML',
    reply_markup: formatTelegramLanguageKeyboard(),
  }));
}

async function sendSettings(
  client: TelegramClient,
  chatId: string,
  language: TelegramLanguage,
  remindersEnabled: boolean,
  metrics: TelegramRouteMetrics
) {
  await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramSettings(language, remindersEnabled), {
    parse_mode: 'HTML',
    reply_markup: formatTelegramSettingsKeyboard(language, remindersEnabled),
  }));
}

async function sendDraftProposals(
  client: TelegramClient,
  chatId: string,
  text: string,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const messages = t(language);
  await timeTelegram(metrics, () => client.sendMessage(chatId, messages.thinking));

  metrics.usedDraftAi = true;
  const draftStartedAt = Date.now();
  const aiResult = await generateDraftsFromText(text);
  metrics.draftGenerationDurationMs = durationSince(draftStartedAt);

  if (aiResult.needClarification) {
    await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.clarificationNeeded}\n\n${aiResult.questions.join('\n')}`));
    return;
  }

  if (!aiResult.drafts || aiResult.drafts.length === 0) {
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.noDrafts));
    return;
  }

  await timeTelegram(metrics, () => client.sendMessage(chatId, messages.draftCount(aiResult.drafts.length)));

  for (const draft of aiResult.drafts) {
    const pendingDraft = await createTelegramPendingDraft(chatId, draft);

    await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramDraftMessage(draft, language), {
      parse_mode: 'HTML',
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

async function buildDayList(
  chatId: string,
  userId: number,
  day: string,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const dbStartedAt = Date.now();
  const items = await loadExpandedItems(userId, day, day);
  metrics.dbQueryDurationMs = durationSince(dbStartedAt);
  const context = await buildAndSaveTelegramListContext(chatId, `day:${day}`, items);
  return {
    text: formatTelegramDayList(day, context, language),
    replyMarkup: formatTelegramDayListKeyboard(day, context.contextId, language),
  };
}

async function sendDayList(
  client: TelegramClient,
  chatId: string,
  userId: number,
  day: string,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const payload = await buildDayList(chatId, userId, day, language, metrics);
  await timeTelegram(metrics, () => client.sendMessage(chatId, payload.text, {
    parse_mode: 'HTML',
    reply_markup: payload.replyMarkup,
  }));
}

async function editDayList(
  client: TelegramClient,
  chatId: string,
  messageId: number | undefined,
  userId: number,
  day: string,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const payload = await buildDayList(chatId, userId, day, language, metrics);
  if (messageId) {
    await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, payload.text, {
      parse_mode: 'HTML',
      reply_markup: payload.replyMarkup,
    }));
  } else {
    await timeTelegram(metrics, () => client.sendMessage(chatId, payload.text, {
      parse_mode: 'HTML',
      reply_markup: payload.replyMarkup,
    }));
  }
}

async function buildWeekList(chatId: string, userId: number, language: TelegramLanguage, metrics: TelegramRouteMetrics) {
  const now = nowInTz(new Date());
  const rangeStart = formatDayKey(now);
  const rangeEnd = formatDayKey(addDays(now, 6));
  const dbStartedAt = Date.now();
  const items = await loadExpandedItems(userId, rangeStart, rangeEnd);
  metrics.dbQueryDurationMs = durationSince(dbStartedAt);
  const context = await buildAndSaveTelegramListContext(chatId, 'week', items);
  return formatTelegramNumberedRange(t(language).next7Days, rangeStart, rangeEnd, context, language);
}

async function sendUpcomingList(
  client: TelegramClient,
  chatId: string,
  userId: number,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const now = nowInTz(new Date());
  const today = formatDayKey(now);
  const tomorrow = formatDayKey(addDays(now, 1));
  const dbStartedAt = Date.now();
  const items = await loadExpandedItems(userId, today, tomorrow);
  metrics.dbQueryDurationMs = durationSince(dbStartedAt);
  await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUpcoming(items, language, now), { parse_mode: 'HTML' }));
}

function clarificationText(language: TelegramLanguage, question: string | null | undefined) {
  const messages = t(language);
  return `${messages.clarificationNeeded}\n\n${question || messages.couldNotUnderstandDateTime}`;
}

function validateRouterDay(day: string | null | undefined) {
  if (!day) return null;
  const normalized = normalizeDayString(day);
  return normalized === day ? normalized : null;
}

function actionQuestion(action: TelegramManagementAction, language: TelegramLanguage) {
  const messages = t(language);
  if (action === 'done') return messages.whichItemDone;
  if (action === 'delete') return messages.whichItemDelete;
  return messages.whichItemMove;
}

function actionLogName(action: TelegramManagementAction) {
  return action === 'done' ? 'mark_done' : action;
}

function actionableHint(intent: TelegramIntent, originalText: string) {
  if (intent.intent !== 'mark_done' && intent.intent !== 'delete_item' && intent.intent !== 'move_item') {
    return originalText;
  }
  return intent.itemTextHint || intent.title || originalText;
}

async function latestOrTodayContext(
  chatId: string,
  userId: number,
  originalText: string,
  metrics: TelegramRouteMetrics
) {
  const latest = await getTelegramListContext(chatId);
  if (latest) return latest;

  const todayWords = /\b(today|сегодня|сьогодні|aujourd'hui|aujourdhui)\b/i.test(originalText);
  if (!todayWords) return null;

  const today = formatDayKey(nowInTz(new Date()));
  const dbStartedAt = Date.now();
  const items = await loadExpandedItems(userId, today, today);
  metrics.dbQueryDurationMs = durationSince(dbStartedAt);
  return buildAndSaveTelegramListContext(chatId, `day:${today}`, items);
}

async function executeManagementAction(
  action: TelegramManagementAction,
  ref: TelegramItemRef,
  contextId: string | null,
  options: { targetDate?: string | null; targetTimeStart?: string | null },
  client: TelegramClient,
  chatId: string,
  userId: number,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const messages = t(language);

  if (action === 'done') {
    const dbStartedAt = Date.now();
    const result = await markTelegramRefDone(userId, ref);
    metrics.dbQueryDurationMs = durationSince(dbStartedAt);
    if (!result) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem));
      return;
    }
    const title = result.status === 'already_done' ? messages.alreadyDone : messages.doneTitle;
    await timeTelegram(metrics, () => client.sendMessage(chatId, `${title}\n\n${formatTelegramRefPreview(ref)}`, { parse_mode: 'HTML' }));
    return;
  }

  if (action === 'delete') {
    await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.deletePrompt}\n\n${formatTelegramRefPreview(ref)}`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: messages.confirmDelete, callback_data: `item_delete_confirm:${contextId || ''}:${ref.n}` },
          { text: messages.canceled, callback_data: 'item_delete_cancel' },
        ]],
      },
    }));
    return;
  }

  const targetDay = validateRouterDay(options.targetDate);
  if (!targetDay) {
    await timeTelegram(metrics, () => client.sendMessage(chatId, clarificationText(language, messages.whichItemMove), {
      parse_mode: 'HTML',
      reply_markup: formatTelegramCancelKeyboard(language),
    }));
    return;
  }

  const dbStartedAt = Date.now();
  const result = await moveTelegramRef(userId, ref, targetDay, options.targetTimeStart ?? null);
  metrics.dbQueryDurationMs = durationSince(dbStartedAt);
  if (!result) {
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem));
    return;
  }
  if (result.status === 'unsupported_recurring') {
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.recurringMoveUnsupported));
    return;
  }
  await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.movedTitle}\n\n${formatTelegramRefPreview(result.ref)}`, { parse_mode: 'HTML' }));
}

async function askForMatchedItemChoice(
  action: TelegramManagementAction,
  contextId: string | null,
  refs: TelegramItemRef[],
  client: TelegramClient,
  chatId: string,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics,
  options: { targetDate?: string | null; targetTimeStart?: string | null } = {}
) {
  const messages = t(language);
  setPendingAction(chatId, {
    type: action,
    contextId,
    targetDate: options.targetDate ?? null,
    targetTimeStart: options.targetTimeStart ?? null,
    targetTimeEnd: null,
  });
  const heading = refs.length > 1
    ? `${messages.multipleMatches}\n\n${actionQuestion(action, language)}`
    : actionQuestion(action, language);
  const lines = refs.map((ref) => formatTelegramRefPreview({ ...ref, title: `${ref.n}. ${ref.title}` })).join('\n\n');
  await timeTelegram(metrics, () => client.sendMessage(chatId, `${heading}\n\n${lines}`, {
    parse_mode: 'HTML',
    reply_markup: formatTelegramPendingChoiceKeyboard(refs, language),
  }));
}

async function handleNaturalLanguageIntent(
  intent: TelegramIntent,
  originalText: string,
  client: TelegramClient,
  chatId: string,
  userId: number,
  language: TelegramLanguage,
  metrics: TelegramRouteMetrics
) {
  const messages = t(language);

  if (intent.intent === 'show_day') {
    const day = validateRouterDay(intent.date);
    if (!day) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, clarificationText(language, intent.clarificationQuestion), { parse_mode: 'HTML' }));
      return;
    }
    await sendDayList(client, chatId, userId, day, language, metrics);
    return;
  }

  if (intent.intent === 'show_upcoming') {
    await sendUpcomingList(client, chatId, userId, language, metrics);
    return;
  }

  if (intent.intent === 'show_week') {
    if (!intent.dateRangeStart && !intent.dateRangeEnd) {
      const weekText = await buildWeekList(chatId, userId, language, metrics);
      await timeTelegram(metrics, () => client.sendMessage(chatId, weekText, { parse_mode: 'HTML' }));
      return;
    }

    const range = validateTelegramQueryRange({
      startDay: intent.dateRangeStart || '',
      endDay: intent.dateRangeEnd || '',
      label: messages.next7Days,
    });
    if (!range) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, clarificationText(language, intent.clarificationQuestion), { parse_mode: 'HTML' }));
      return;
    }

    const dbStartedAt = Date.now();
    const items = await loadExpandedItems(userId, range.startDay, range.endDay);
    metrics.dbQueryDurationMs = durationSince(dbStartedAt);
    await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramRange(items, range.startDay, range.endDay, range.label, language), {
      parse_mode: 'HTML',
    }));
    return;
  }

  if (intent.intent === 'create_draft') {
    await sendDraftProposals(client, chatId, intent.draftInput || originalText, language, metrics);
    return;
  }

  if (intent.intent === 'mark_done') {
    if (intent.itemNumber) {
      const resolved = await resolveTelegramItemRef(chatId, intent.itemNumber);
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem));
        return;
      }

      await executeManagementAction('done', resolved.ref, resolved.contextId, {}, client, chatId, userId, language, metrics);
      return;
    }

    const context = await latestOrTodayContext(chatId, userId, originalText, metrics);
    if (!context) {
      setPendingAction(chatId, { type: 'done', contextId: null });
      await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.whichItemDone}\n\n${messages.couldNotFindMatchedItem}`, {
        parse_mode: 'HTML',
        reply_markup: formatTelegramCancelKeyboard(language),
      }));
      return;
    }

    const match = matchTelegramRefsByText(context, actionableHint(intent, originalText));
    if (match.status === 'single') {
      await executeManagementAction('done', match.matches[0], context.contextId, {}, client, chatId, userId, language, metrics);
      return;
    }
    if (match.status === 'multiple') {
      await askForMatchedItemChoice('done', context.contextId, match.matches, client, chatId, language, metrics);
      return;
    }

    setPendingAction(chatId, { type: 'done', contextId: context.contextId });
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem, {
      reply_markup: formatTelegramCancelKeyboard(language),
    }));
    return;
  }

  if (intent.intent === 'delete_item') {
    if (intent.itemNumber) {
      const resolved = await resolveTelegramItemRef(chatId, intent.itemNumber);
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem));
        return;
      }
      await executeManagementAction('delete', resolved.ref, resolved.contextId, {}, client, chatId, userId, language, metrics);
      return;
    }

    const context = await latestOrTodayContext(chatId, userId, originalText, metrics);
    if (!context) {
      setPendingAction(chatId, { type: 'delete', contextId: null });
      await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.whichItemDelete}\n\n${messages.couldNotFindMatchedItem}`, {
        parse_mode: 'HTML',
        reply_markup: formatTelegramCancelKeyboard(language),
      }));
      return;
    }

    const match = matchTelegramRefsByText(context, actionableHint(intent, originalText));
    if (match.status === 'single') {
      await executeManagementAction('delete', match.matches[0], context.contextId, {}, client, chatId, userId, language, metrics);
      return;
    }
    if (match.status === 'multiple') {
      await askForMatchedItemChoice('delete', context.contextId, match.matches, client, chatId, language, metrics);
      return;
    }

    setPendingAction(chatId, { type: 'delete', contextId: context.contextId });
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem, {
      reply_markup: formatTelegramCancelKeyboard(language),
    }));
    return;
  }

  if (intent.intent === 'move_item') {
    if (!intent.targetDate) {
      setPendingAction(chatId, { type: 'move', contextId: null });
      await timeTelegram(metrics, () => client.sendMessage(chatId, clarificationText(language, intent.clarificationQuestion || messages.whichItemMove), {
        parse_mode: 'HTML',
        reply_markup: formatTelegramCancelKeyboard(language),
      }));
      return;
    }

    const targetDay = validateRouterDay(intent.targetDate);
    if (!targetDay) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, clarificationText(language, intent.clarificationQuestion), { parse_mode: 'HTML' }));
      return;
    }

    if (intent.itemNumber) {
      const resolved = await resolveTelegramItemRef(chatId, intent.itemNumber);
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem));
        return;
      }
      await executeManagementAction('move', resolved.ref, resolved.contextId, {
        targetDate: targetDay,
        targetTimeStart: intent.targetTimeStart,
      }, client, chatId, userId, language, metrics);
      return;
    }

    const context = await latestOrTodayContext(chatId, userId, originalText, metrics);
    if (!context) {
      setPendingAction(chatId, { type: 'move', contextId: null, targetDate: targetDay, targetTimeStart: intent.targetTimeStart });
      await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.whichItemMove}\n\n${messages.couldNotFindMatchedItem}`, {
        parse_mode: 'HTML',
        reply_markup: formatTelegramCancelKeyboard(language),
      }));
      return;
    }

    const match = matchTelegramRefsByText(context, actionableHint(intent, originalText));
    if (match.status === 'single') {
      await executeManagementAction('move', match.matches[0], context.contextId, {
        targetDate: targetDay,
        targetTimeStart: intent.targetTimeStart,
      }, client, chatId, userId, language, metrics);
      return;
    }
    if (match.status === 'multiple') {
      await askForMatchedItemChoice('move', context.contextId, match.matches, client, chatId, language, metrics, {
        targetDate: targetDay,
        targetTimeStart: intent.targetTimeStart,
      });
      return;
    }

    setPendingAction(chatId, { type: 'move', contextId: context.contextId, targetDate: targetDay, targetTimeStart: intent.targetTimeStart });
    await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem, {
      reply_markup: formatTelegramCancelKeyboard(language),
    }));
    return;
  }

  if (intent.intent === 'clarify') {
    await timeTelegram(metrics, () => client.sendMessage(chatId, clarificationText(language, intent.clarificationQuestion), {
      parse_mode: 'HTML',
      reply_markup: formatTelegramCancelKeyboard(language),
    }));
    return;
  }

  await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUnsupportedMessage(language), { parse_mode: 'HTML' }));
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
      console.log('[Telegram] Unauthorized access attempt', { chatPresent: true });
    }
    return;
  }

  const dbStartedForSettings = Date.now();
  let settings = await getTelegramSettings(chatId);
  metrics.dbQueryDurationMs = durationSince(dbStartedForSettings);
  let language = settings.language;
  const messages = t(language);

  // 2. Handle Callback Queries (Confirm / Cancel / Language / Settings)
  if (update.callback_query) {
    const data = String(update.callback_query.data || '');
    const queryId = update.callback_query.id;
    const messageId = update.callback_query.message?.message_id;

    if (data === 'pending:cancel') {
      clearPendingAction(chatId);
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.cancelledAction));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.cancelledAction));
      }
      logTelegramTiming('callback_pending_cancel', startedAt, metrics);
      return;
    }

    if (data.startsWith('pending_pick:')) {
      const pending = getPendingAction(chatId);
      const itemNumber = parseItemNumber(data.split(':')[1]);
      if (!pending || !itemNumber) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindMatchedItem, true));
        logTelegramTiming('callback_pending_pick', startedAt, metrics);
        return;
      }

      const resolved = await resolveTelegramItemRef(chatId, itemNumber, pending.contextId);
      if (!resolved) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindMatchedItem, true));
        logTelegramTiming('callback_pending_pick', startedAt, metrics);
        return;
      }

      clearPendingAction(chatId);
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
      await executeManagementAction(pending.type, resolved.ref, resolved.contextId, {
        targetDate: pending.targetDate,
        targetTimeStart: pending.targetTimeStart,
      }, client, chatId, userId, language, metrics);
      logTelegramTiming(`callback_pending_${actionLogName(pending.type)}`, startedAt, metrics);
      return;
    }

    if (data.startsWith('day:')) {
      const [, action, rawDay] = data.split(':');
      const baseDay = /^\d{4}-\d{2}-\d{2}$/.test(rawDay || '') ? rawDay : formatDayKey(nowInTz(new Date()));

      if (action === 'week') {
        const text = await buildWeekList(chatId, userId, language, metrics);
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, text, { parse_mode: 'HTML' }));
        } else {
          await timeTelegram(metrics, () => client.sendMessage(chatId, text, { parse_mode: 'HTML' }));
        }
        logTelegramTiming('callback_day_week', startedAt, metrics);
        return;
      }

      const targetDay = action === 'prev'
        ? formatDayKey(addDays(parseDayKey(baseDay), -1))
        : action === 'next'
          ? formatDayKey(addDays(parseDayKey(baseDay), 1))
          : baseDay;

      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
      await editDayList(client, chatId, messageId, userId, targetDay, language, metrics);
      logTelegramTiming('callback_day_nav', startedAt, metrics);
      return;
    }

    if (data.startsWith('act:')) {
      const [, action, contextId] = data.split(':');
      if (action !== 'done' && action !== 'delete' && action !== 'move') {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.unknownAction));
        logTelegramTiming('callback_item_action', startedAt, metrics);
        return;
      }

      const context = await getTelegramListContext(chatId, contextId);
      if (!context) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.noListItems, true));
        logTelegramTiming('callback_item_action', startedAt, metrics);
        return;
      }

      const actionLabel = action === 'done'
        ? messages.actionDone
        : action === 'delete'
          ? messages.actionDelete
          : messages.actionMove;
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.chooseItem(actionLabel), {
          parse_mode: 'HTML',
          reply_markup: formatTelegramItemPickerKeyboard(action, context, language),
        }));
      } else {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.chooseItem(actionLabel), {
          parse_mode: 'HTML',
          reply_markup: formatTelegramItemPickerKeyboard(action, context, language),
        }));
      }
      logTelegramTiming('callback_item_action', startedAt, metrics);
      return;
    }

    if (data.startsWith('pick:')) {
      const [, action, contextId, rawNumber] = data.split(':');
      const itemNumber = parseItemNumber(rawNumber);
      const resolved = itemNumber ? await resolveTelegramItemRef(chatId, itemNumber, contextId) : null;
      if (!itemNumber || !resolved) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindItem, true));
        logTelegramTiming('callback_item_pick', startedAt, metrics);
        return;
      }

      if (action === 'done') {
        const dbStartedAt = Date.now();
        const result = await markTelegramRefDone(userId, resolved.ref);
        metrics.dbQueryDurationMs = durationSince(dbStartedAt);
        if (!result) {
          await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindItem, true));
          logTelegramTiming('callback_item_done', startedAt, metrics);
          return;
        }
        const title = result.status === 'already_done' ? messages.alreadyDone : messages.doneTitle;
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, title));
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, `${title}\n\n${formatTelegramRefPreview(resolved.ref)}`, {
            parse_mode: 'HTML',
          }));
        }
        logTelegramTiming('callback_item_done', startedAt, metrics);
        return;
      }

      if (action === 'delete') {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
        const text = `${messages.deletePrompt}\n\n${formatTelegramRefPreview(resolved.ref)}`;
        const replyMarkup = {
          inline_keyboard: [[
            { text: messages.confirmDelete, callback_data: `item_delete_confirm:${resolved.contextId}:${itemNumber}` },
            { text: messages.canceled, callback_data: 'item_delete_cancel' },
          ]],
        };
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          }));
        } else {
          await timeTelegram(metrics, () => client.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          }));
        }
        logTelegramTiming('callback_item_delete_pick', startedAt, metrics);
        return;
      }

      if (action === 'move') {
        const selectedNumber = itemNumber;
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.moveDestinationTitle, {
            parse_mode: 'HTML',
            reply_markup: formatTelegramMoveDestinationKeyboard(resolved.contextId || contextId, selectedNumber, language),
          }));
        } else {
          await timeTelegram(metrics, () => client.sendMessage(chatId, messages.moveDestinationTitle, {
            parse_mode: 'HTML',
            reply_markup: formatTelegramMoveDestinationKeyboard(resolved.contextId || contextId, selectedNumber, language),
          }));
        }
        logTelegramTiming('callback_item_move_pick', startedAt, metrics);
        return;
      }
    }

    if (data.startsWith('move:')) {
      const [, contextId, rawNumber, target] = data.split(':');
      const itemNumber = parseItemNumber(rawNumber);
      const resolved = itemNumber ? await resolveTelegramItemRef(chatId, itemNumber, contextId) : null;
      if (!itemNumber || !resolved) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindItem, true));
        logTelegramTiming('callback_item_move', startedAt, metrics);
        return;
      }

      if (target === 'type') {
        const selectedNumber = itemNumber;
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
        const text = messages.moveTypeDatePrompt(selectedNumber);
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, text));
        } else {
          await timeTelegram(metrics, () => client.sendMessage(chatId, text));
        }
        logTelegramTiming('callback_item_move_type', startedAt, metrics);
        return;
      }

      const now = nowInTz(new Date());
      const targetDay = target === 'today'
        ? formatDayKey(now)
        : target === 'tomorrow'
          ? formatDayKey(addDays(now, 1))
          : target === 'plus2'
            ? formatDayKey(addDays(now, 2))
            : null;

      if (!targetDay) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.unknownAction));
        logTelegramTiming('callback_item_move', startedAt, metrics);
        return;
      }

      const dbStartedAt = Date.now();
      const result = await moveTelegramRef(userId, resolved.ref, targetDay, null);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      if (!result) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindItem, true));
        logTelegramTiming('callback_item_move', startedAt, metrics);
        return;
      }
      if (result.status === 'unsupported_recurring') {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.recurringMoveUnsupported, true));
        logTelegramTiming('callback_item_move', startedAt, metrics);
        return;
      }

      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.movedTitle));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(
          chatId,
          messageId,
          `${messages.movedTitle}\n\n${formatTelegramRefPreview(result.ref)}`,
          { parse_mode: 'HTML' }
        ));
      }
      logTelegramTiming('callback_item_move', startedAt, metrics);
      return;
    }

    if (data === 'flow:cancel') {
      clearPendingAction(chatId);
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.cancelledAction));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.cancelledAction));
      }
      logTelegramTiming('callback_item_flow_cancel', startedAt, metrics);
      return;
    }

    if (data.startsWith('item_delete_confirm:')) {
      const [, contextId, rawNumber] = data.split(':');
      const itemNumber = parseItemNumber(rawNumber);
      const resolved = itemNumber ? await resolveTelegramItemRef(chatId, itemNumber, contextId) : null;
      if (!resolved) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.couldNotFindItem, true));
        logTelegramTiming('callback_item_delete', startedAt, metrics);
        return;
      }

      const dbStartedAt = Date.now();
      await deleteTelegramRef(userId, resolved.ref);
      clearPendingAction(chatId);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.deletedTitle));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(
          chatId,
          messageId,
          `${messages.deletedTitle}\n\n${formatTelegramRefPreview(resolved.ref)}`,
          { parse_mode: 'HTML' }
        ));
      }
      logTelegramTiming('callback_item_delete', startedAt, metrics);
      return;
    }

    if (data === 'item_delete_cancel') {
      clearPendingAction(chatId);
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.cancelledAction));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.cancelledAction));
      }
      logTelegramTiming('callback_item_delete', startedAt, metrics);
      return;
    }

    if (data.startsWith('language:')) {
      const selectedLanguage = data.split(':')[1];
      if (!isTelegramLanguage(selectedLanguage)) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.unknownAction));
        logTelegramTiming('callback', startedAt, metrics);
        return;
      }

      const dbStartedAt = Date.now();
      await setTelegramLanguage(chatId, selectedLanguage);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      language = selectedLanguage;
      const selectedMessages = t(language);

      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, selectedMessages.languageChanged));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, selectedMessages.languageChanged, {
          parse_mode: 'HTML',
        }));
      } else {
        await timeTelegram(metrics, () => client.sendMessage(chatId, selectedMessages.languageChanged));
      }
      logTelegramTiming('callback_language', startedAt, metrics);
      return;
    }

    if (data === 'settings:language') {
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, formatTelegramLanguageMessage(language), {
          parse_mode: 'HTML',
          reply_markup: formatTelegramLanguageKeyboard(),
        }));
      } else {
        await sendLanguagePicker(client, chatId, language, metrics);
      }
      logTelegramTiming('callback_settings', startedAt, metrics);
      return;
    }

    if (data === 'settings:reminders:on' || data === 'settings:reminders:off') {
      const enabled = data.endsWith(':on');
      const dbStartedAt = Date.now();
      await setTelegramRemindersEnabled(chatId, enabled);
      settings = { ...settings, remindersEnabled: enabled };
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);

      const responseText = enabled ? messages.remindersEnabled : messages.remindersDisabled;
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, responseText));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, formatTelegramSettings(language, settings.remindersEnabled), {
          parse_mode: 'HTML',
          reply_markup: formatTelegramSettingsKeyboard(language, settings.remindersEnabled),
        }));
      } else {
        await sendSettings(client, chatId, language, settings.remindersEnabled, metrics);
      }
      logTelegramTiming('callback_settings', startedAt, metrics);
      return;
    }

    if (data.startsWith('confirm:')) {
      const draftId = data.split(':')[1];
      if (!draftId) {
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.draftExpired));
        if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.draftExpired));
        logTelegramTiming('callback', startedAt, metrics);
        return;
      }

      try {
        const dbStartedAt = Date.now();
        const result = await confirmTelegramPendingDraft(userId, draftId, chatId);
        metrics.dbQueryDurationMs = durationSince(dbStartedAt);
        if (!result) {
          await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.draftExpired));
          if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.draftExpired));
          logTelegramTiming('callback', startedAt, metrics);
          return;
        }

        const draft = result.draft;
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.saved));
        if (messageId) {
          await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, formatTelegramSavedDraft(draft, language), {
            parse_mode: 'HTML',
          }));
        }
      } catch (err: any) {
        console.error('[Telegram Handler] Confirm failed', { message: err?.message });
        await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.failedToSave));
        if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, `${messages.failedToSave} ${err.message}`));
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
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.canceled));
      if (messageId) await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.canceledDraft));
      logTelegramTiming('callback', startedAt, metrics);
      return;
    }

    await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.unknownAction));
    logTelegramTiming('callback', startedAt, metrics);
    return;
  }

  // 3. Handle Messages
  if (update.message && update.message.text) {
    const text = update.message.text as string;
    const command = normalizeTelegramCommand(text);
    
    // Commands
    if (command === 'cancel') {
      clearPendingAction(chatId);
      await timeTelegram(metrics, () => client.sendMessage(chatId, messages.cancelledAction));
      logTelegramTiming('command_cancel', startedAt, metrics);
      return;
    }

    if (command) {
      clearPendingAction(chatId);
    }

    if (command === 'start') {
      await timeTelegram(metrics, () => client.sendMessage(chatId, messages.start, { parse_mode: 'HTML' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'help') {
      await timeTelegram(metrics, () => client.sendMessage(chatId, messages.help, { parse_mode: 'HTML' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'language') {
      await sendLanguagePicker(client, chatId, language, metrics);
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'settings') {
      await sendSettings(client, chatId, language, settings.remindersEnabled, metrics);
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'today' || command === 'list') {
      const now = nowInTz(new Date());
      const dayStr = formatDayKey(now);
      await sendDayList(client, chatId, userId, dayStr, language, metrics);
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'tomorrow') {
      const tomorrow = addDays(nowInTz(new Date()), 1);
      const dayStr = formatDayKey(tomorrow);
      await sendDayList(client, chatId, userId, dayStr, language, metrics);
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'day') {
      const day = parseTelegramDayArgs(commandArgs(text));
      if (!day) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.couldNotUnderstandDateTime}\nUse: /day today, /day tomorrow, /day friday, /day 2026-04-29`));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      await sendDayList(client, chatId, userId, day, language, metrics);
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'upcoming') {
      const now = nowInTz(new Date());
      const today = formatDayKey(now);
      const tomorrow = formatDayKey(addDays(now, 1));
      const dbStartedAt = Date.now();
      const items = await loadExpandedItems(userId, today, tomorrow);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUpcoming(items, language, now), { parse_mode: 'HTML' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'week') {
      const weekText = await buildWeekList(chatId, userId, language, metrics);
      await timeTelegram(metrics, () => client.sendMessage(chatId, weekText, { parse_mode: 'HTML' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'done') {
      const itemNumber = parseItemNumber(commandArgs(text)[0]);
      const resolved = itemNumber ? await resolveTelegramItemRef(chatId, itemNumber) : null;
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindItem));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      const dbStartedAt = Date.now();
      const result = await markTelegramRefDone(userId, resolved.ref);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      if (!result) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindItem));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      const title = result.status === 'already_done' ? messages.alreadyDone : messages.doneTitle;
      await timeTelegram(metrics, () => client.sendMessage(chatId, `${title}\n\n${formatTelegramRefPreview(resolved.ref)}`, { parse_mode: 'HTML' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'delete') {
      const itemNumber = parseItemNumber(commandArgs(text)[0]);
      const resolved = itemNumber ? await resolveTelegramItemRef(chatId, itemNumber) : null;
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindItem));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.deletePrompt}\n\n${formatTelegramRefPreview(resolved.ref)}`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: messages.confirmDelete, callback_data: `item_delete_confirm:${resolved.contextId}:${itemNumber}` },
            { text: messages.canceled, callback_data: 'item_delete_cancel' },
          ]],
        },
      }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command === 'move') {
      const args = commandArgs(text);
      const itemNumber = parseItemNumber(args[0]);
      const parsedMove = parseTelegramMoveArgs(args.slice(1));
      const resolved = itemNumber ? await resolveTelegramItemRef(chatId, itemNumber) : null;
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindItem));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      if (!parsedMove) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.couldNotUnderstandDateTime}\n${messages.moveUsage}`));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      const dbStartedAt = Date.now();
      const result = await moveTelegramRef(userId, resolved.ref, parsedMove.day, parsedMove.timeStart);
      metrics.dbQueryDurationMs = durationSince(dbStartedAt);
      if (!result) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindItem));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      if (result.status === 'unsupported_recurring') {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.recurringMoveUnsupported));
        logTelegramTiming('command', startedAt, metrics);
        return;
      }
      await timeTelegram(metrics, () => client.sendMessage(chatId, `${messages.movedTitle}\n\n${formatTelegramRefPreview(result.ref)}`, { parse_mode: 'HTML' }));
      logTelegramTiming('command', startedAt, metrics);
      return;
    }

    if (command) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUnsupportedMessage(language), { parse_mode: 'HTML' }));
      logTelegramTiming('command_unknown', startedAt, metrics);
      return;
    }

    const pending = getPendingAction(chatId);
    const pendingItemNumber = parseItemNumber(text.trim());
    if (pending && pendingItemNumber) {
      const resolved = await resolveTelegramItemRef(chatId, pendingItemNumber, pending.contextId);
      if (!resolved) {
        await timeTelegram(metrics, () => client.sendMessage(chatId, messages.couldNotFindMatchedItem, {
          reply_markup: formatTelegramCancelKeyboard(language),
        }));
        logTelegramTiming(`text_pending_${actionLogName(pending.type)}_missing`, startedAt, metrics);
        return;
      }

      clearPendingAction(chatId);
      await executeManagementAction(pending.type, resolved.ref, resolved.contextId, {
        targetDate: pending.targetDate,
        targetTimeStart: pending.targetTimeStart,
      }, client, chatId, userId, language, metrics);
      logTelegramTiming(`text_pending_${actionLogName(pending.type)}`, startedAt, metrics);
      return;
    }

    const gated = gateTelegramTextBeforeAi(text, language);
    if (!gated.allowed) {
      if (gated.message) await timeTelegram(metrics, () => client.sendMessage(chatId, gated.message, { parse_mode: 'HTML' }));
      logTelegramTiming('rejected', startedAt, metrics);
      return;
    }

    const lastAiAt = aiCooldownByChat.get(chatId) || 0;
    const nowMs = Date.now();
    if (nowMs - lastAiAt < TELEGRAM_AI_COOLDOWN_MS) {
      await timeTelegram(metrics, () => client.sendMessage(chatId, messages.cooldown));
      logTelegramTiming('rejected', startedAt, metrics);
      return;
    }
    aiCooldownByChat.set(chatId, nowMs);

    // Safe freeform text -> AI intent router. Backend still performs all actions.
    try {
      metrics.usedAiRouter = true;
      const routerStartedAt = Date.now();
      const intent = await detectTelegramIntent(gated.text);
      metrics.aiRouterDurationMs = durationSince(routerStartedAt);

      await handleNaturalLanguageIntent(intent, gated.text, client, chatId, userId, language, metrics);
      logTelegramTiming('ai_intent_router', startedAt, metrics);
    } catch (err: any) {
      console.error('[Telegram Handler] Freeform handling failed', {
        route: 'ai_intent_router',
        chatPresent: Boolean(chatId),
        usedAiRouter: metrics.usedAiRouter,
        usedDraftAi: metrics.usedDraftAi,
        pendingActionType: getPendingAction(chatId)?.type ?? null,
        ...safeErrorMeta(err),
      });
      await trySendGracefulError(client, chatId, language, metrics);
      logTelegramTiming('error', startedAt, metrics);
    }
  }
}
