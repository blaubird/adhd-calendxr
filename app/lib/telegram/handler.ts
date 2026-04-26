import { TelegramClient } from './client';
import { env } from 'app/env';
import { generateDraftsFromText } from './ai';
import { loadExpandedItems } from 'app/lib/load-items';
import { formatDayKey, nowInTz, TIMEZONE } from 'app/lib/datetime';
import { addDays, startOfWeek, endOfWeek, format } from 'date-fns';
import {
  cancelTelegramPendingDraft,
  confirmTelegramPendingDraft,
  createTelegramPendingDraft,
} from 'app/db';
import { Item } from 'app/types';

function formatItemsList(items: Item[], dateHeader: string) {
  const untimed = items.filter(i => !i.timeStart);
  const timed = items.filter(i => i.timeStart).sort((a, b) => a.timeStart!.localeCompare(b.timeStart!));
  
  let text = `*${dateHeader}*\n\n`;
  if (untimed.length) {
    text += `*No time:*\n` + untimed.map(i => `• ${i.status === 'done' ? '✓ ' : ''}${i.title}`).join('\n') + `\n\n`;
  }
  if (timed.length) {
    text += `*Timed:*\n` + timed.map(i => `${i.timeStart} — ${i.status === 'done' ? '✓ ' : ''}${i.title}`).join('\n') + `\n\n`;
  }
  if (!untimed.length && !timed.length) {
    text += 'No items.\n\n';
  }
  return text.trim();
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
          await client.editMessageText(chatId, messageId, `✅ Saved: ${draft.day} ${draft.timeStart ? draft.timeStart + ' ' : ''}${draft.title}`);
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
      await client.sendMessage(chatId, formatItemsList(items, `Today — ${humanDay}`), { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/tomorrow') {
      const tomorrow = addDays(nowInTz(new Date()), 1);
      const dayStr = formatDayKey(tomorrow);
      const items = await loadExpandedItems(userId, dayStr, dayStr);
      const humanDay = format(tomorrow, 'dd.MM.yyyy');
      await client.sendMessage(chatId, formatItemsList(items, `Tomorrow — ${humanDay}`), { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/week') {
      const now = nowInTz(new Date());
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const items = await loadExpandedItems(userId, formatDayKey(weekStart), formatDayKey(weekEnd));
      
      let responseText = '*This week*\n\n';
      
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        const dStr = formatDayKey(d);
        const humanD = format(d, 'EEE dd.MM');
        
        const dayItems = items.filter(it => it.occurrenceDay === dStr || it.day === dStr);
        responseText += `*${humanD}*\n`;
        if (dayItems.length === 0) {
          responseText += `No items\n\n`;
        } else {
          for (const item of dayItems) {
            if (!item.timeStart) responseText += `• ${item.status === 'done' ? '✓ ' : ''}${item.title}\n`;
            else responseText += `${item.timeStart} — ${item.status === 'done' ? '✓ ' : ''}${item.title}\n`;
          }
          responseText += '\n';
        }
      }
      
      await client.sendMessage(chatId, responseText.trim(), { parse_mode: 'Markdown' });
      return;
    }

    // Natural Language -> AI Draft Generation
    try {
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
        
        let draftMsg = `*${draft.day}* — ${draft.title}`;
        if (draft.timeStart) draftMsg += `\n${draft.timeStart}`;
        else draftMsg += `\nNo time`;
        
        if (draft.recurrenceRule) draftMsg += `\nRepeats: ${draft.recurrenceRule}`;

        await client.sendMessage(chatId, draftMsg, {
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
    } catch (err: any) {
      console.error('[Telegram Handler] AI error', err);
      await client.sendMessage(chatId, `Failed to generate draft: ${err.message}`);
    }
  }
}
