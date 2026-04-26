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
  validateTelegramQueryRange,
} from './intent';

const aiCooldownByChat = new Map<string, number>();

async function sendDraftProposals(client: TelegramClient, chatId: string, text: string) {
  await client.sendMessage(chatId, 'Thinking...');
  const aiResult = await generateDraftsFromText(text);

  if (aiResult.needClarification) {
    await client.sendMessage(chatId, `Clarification needed:\n\n${aiResult.questions.join('\n')}`);
    return;
  }

  if (!aiResult.drafts || aiResult.drafts.length === 0) {
    await client.sendMessage(chatId, 'No drafts could be interpreted.');
    return;
  }

  await client.sendMessage(chatId, `I prepared ${aiResult.drafts.length} draft(s).`);

  for (const draft of aiResult.drafts) {
    const pendingDraft = await createTelegramPendingDraft(chatId, draft);

    await client.sendMessage(chatId, formatTelegramDraftMessage(draft), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Confirm', callback_data: `confirm:${pendingDraft.id}` },
            { text: 'Cancel', callback_data: `cancel:${pendingDraft.id}` }
          ]
        ]
      }
    });
  }
}

export async function handleTelegramUpdate(update: any, client: TelegramClient, userId: number) {
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
        await client.answerCallbackQuery(queryId, 'Draft expired or not found.');
        if (messageId) await client.editMessageText(chatId, messageId, 'Draft expired or not found.');
        return;
      }

      try {
        const result = await confirmTelegramPendingDraft(userId, draftId, chatId);
        if (!result) {
          await client.answerCallbackQuery(queryId, 'Draft expired or not found.');
          if (messageId) await client.editMessageText(chatId, messageId, 'Draft expired or not found.');
          return;
        }

        const draft = result.draft;
        await client.answerCallbackQuery(queryId, 'Saved!');
        if (messageId) {
          await client.editMessageText(chatId, messageId, formatTelegramSavedDraft(draft));
        }
      } catch (err: any) {
        console.error('[Telegram Handler] Confirm failed', { message: err?.message });
        await client.answerCallbackQuery(queryId, 'Failed to save.');
        if (messageId) await client.editMessageText(chatId, messageId, `❌ Failed to save: ${err.message}`);
      }
      return;
    }

    if (data.startsWith('cancel:')) {
      const draftId = data.split(':')[1];
      if (draftId) {
        await cancelTelegramPendingDraft(draftId, chatId);
      }
      await client.answerCallbackQuery(queryId, 'Canceled.');
      if (messageId) await client.editMessageText(chatId, messageId, `❌ Canceled draft.`);
      return;
    }

    await client.answerCallbackQuery(queryId, 'Unknown action.');
    return;
  }

  // 3. Handle Messages
  if (update.message && update.message.text) {
    const text = update.message.text as string;
    
    // Commands
    if (text === '/start') {
      await client.sendMessage(chatId, `Calendar Brain is awake 🐸\nCommands:\n/today\n/tomorrow\n/week\n/help\n\nSend me a task or event in natural language and I'll prepare a draft.`);
      return;
    }

    if (text === '/help') {
      await client.sendMessage(chatId, `Commands:\n/today - today's items\n/tomorrow - tomorrow's items\n/week - week overview\n\nExamples:\nсоздай завтра в 18:00 стоматолог\nкаждую пятницу в 10:00 волонтёрство\nзавтра купить таблетки и отправить письмо`);
      return;
    }

    if (text === '/today') {
      const now = nowInTz(new Date());
      const dayStr = formatDayKey(now);
      const items = await loadExpandedItems(userId, dayStr, dayStr);
      const humanDay = format(now, 'dd.MM.yyyy');
      await client.sendMessage(chatId, formatTelegramDay(items, `Today — ${humanDay}`), { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/tomorrow') {
      const tomorrow = addDays(nowInTz(new Date()), 1);
      const dayStr = formatDayKey(tomorrow);
      const items = await loadExpandedItems(userId, dayStr, dayStr);
      const humanDay = format(tomorrow, 'dd.MM.yyyy');
      await client.sendMessage(chatId, formatTelegramDay(items, `Tomorrow — ${humanDay}`), { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/week') {
      const now = nowInTz(new Date());
      const rangeStart = formatDayKey(now);
      const rangeEnd = formatDayKey(addDays(now, 6));
      const items = await loadExpandedItems(userId, rangeStart, rangeEnd);
      await client.sendMessage(chatId, formatTelegramRange(items, rangeStart, rangeEnd, 'Next 7 days'), { parse_mode: 'Markdown' });
      return;
    }

    const gated = gateTelegramTextBeforeAi(text);
    if (!gated.allowed) {
      if (gated.message) await client.sendMessage(chatId, gated.message);
      return;
    }

    const lastAiAt = aiCooldownByChat.get(chatId) || 0;
    const nowMs = Date.now();
    if (nowMs - lastAiAt < TELEGRAM_AI_COOLDOWN_MS) {
      await client.sendMessage(chatId, 'Please give me a moment before the next AI-routed request.');
      return;
    }
    aiCooldownByChat.set(chatId, nowMs);

    // Natural Language -> AI Intent Router -> Calendar Query or Draft Generation
    try {
      const intent = await detectTelegramIntent(gated.text);

      if (intent.intent === 'calendar_query') {
        const range = validateTelegramQueryRange(intent.query);
        if (!range) {
          await client.sendMessage(chatId, formatTelegramUnsupportedMessage());
          return;
        }

        const items = await loadExpandedItems(userId, range.startDay, range.endDay);
        const label = range.rangeDays === 1 ? range.label : range.label || `Next ${range.rangeDays} days`;
        await client.sendMessage(chatId, formatTelegramRange(items, range.startDay, range.endDay, label), {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (intent.intent === 'draft_create') {
        await sendDraftProposals(client, chatId, intent.draftInput);
        return;
      }

      await client.sendMessage(chatId, formatTelegramUnsupportedMessage());
    } catch (err: any) {
      console.error('[Telegram Handler] AI error', err);
      await client.sendMessage(chatId, `Failed to handle Telegram request: ${err.message}`);
    }
  }
}
