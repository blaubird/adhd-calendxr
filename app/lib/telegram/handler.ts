import { TelegramClient } from './client';
import { env } from 'app/env';
import { detectTelegramIntent, generateDraftsFromText } from './ai';
import { loadExpandedItems } from 'app/lib/load-items';
import { formatDayKey, nowInTz, parseDayKey } from 'app/lib/datetime';
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
  formatTelegramItemPickerKeyboard,
  formatTelegramMoveDestinationKeyboard,
  formatTelegramNumberedRange,
  formatTelegramRefPreview,
  formatTelegramUpcoming,
  getTelegramListContext,
  markTelegramRefDone,
  moveTelegramRef,
  parseTelegramDayArgs,
  parseTelegramMoveArgs,
  resolveTelegramItemRef,
} from './manage';
import { isTelegramLanguage, t, type TelegramLanguage } from './i18n';
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
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.canceled));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.canceled));
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
      await timeTelegram(metrics, () => client.answerCallbackQuery(queryId, messages.canceled));
      if (messageId) {
        await timeTelegram(metrics, () => client.editMessageText(chatId, messageId, messages.canceled));
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

    // Query-like text -> AI intent router. Other safe text -> direct draft generation.
    try {
      if (!isLikelyCalendarQuery(gated.text)) {
        await sendDraftProposals(client, chatId, gated.text, language, metrics);
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
          await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUnsupportedMessage(language), { parse_mode: 'HTML' }));
          logTelegramTiming('calendar_query_router', startedAt, metrics);
          return;
        }

        const dbStartedAt = Date.now();
        const items = await loadExpandedItems(userId, range.startDay, range.endDay);
        metrics.dbQueryDurationMs = durationSince(dbStartedAt);
        const label = range.rangeDays === 1 ? range.label : range.label || `Next ${range.rangeDays} days`;
        await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramRange(items, range.startDay, range.endDay, label, language), {
          parse_mode: 'HTML',
        }));
        logTelegramTiming('calendar_query_router', startedAt, metrics);
        return;
      }

      if (intent.intent === 'draft_create') {
        await sendDraftProposals(client, chatId, intent.draftInput, language, metrics);
        logTelegramTiming('calendar_query_router', startedAt, metrics);
        return;
      }

      await timeTelegram(metrics, () => client.sendMessage(chatId, formatTelegramUnsupportedMessage(language), { parse_mode: 'HTML' }));
      logTelegramTiming('calendar_query_router', startedAt, metrics);
    } catch (err: any) {
      console.error('[Telegram Handler] AI error', err);
      await timeTelegram(metrics, () => client.sendMessage(chatId, messages.requestFailed(err.message)));
      logTelegramTiming('error', startedAt, metrics);
    }
  }
}
