export class TelegramClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async requestTelegram(method: string, body?: Record<string, unknown>, meta?: Record<string, unknown>) {
    try {
      const res = await fetch(`${this.baseUrl}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json() as any;
      if (!data?.ok) {
        console.warn('[Telegram API] Non-ok response', {
          method,
          status: res.status,
          description: data?.description,
          ...meta,
        });
      }
      return data;
    } catch (err: any) {
      console.error('[Telegram API] Request failed', {
        method,
        errorName: err?.name,
        errorMessage: err?.message,
        causeName: err?.cause?.name,
        causeMessage: err?.cause?.message,
        ...meta,
      });
      throw err;
    }
  }

  async getUpdates(offset?: number, timeout = 30) {
    const url = new URL(`${this.baseUrl}/getUpdates`);
    if (offset) url.searchParams.append('offset', offset.toString());
    url.searchParams.append('timeout', timeout.toString());
    url.searchParams.append('allowed_updates', '["message", "callback_query"]');

    const res = await fetch(url.toString());
    const data = await res.json() as any;
    if (!data.ok) throw new Error(data.description || 'Failed to get updates');
    return data.result;
  }

  async deleteWebhook() {
    return this.requestTelegram('deleteWebhook');
  }

  async setWebhook(url: string, secretToken: string) {
    return this.requestTelegram('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    }, { hasSecretToken: Boolean(secretToken), urlHost: safeUrlHost(url) });
  }

  async getWebhookInfo() {
    return this.requestTelegram('getWebhookInfo');
  }

  async setMyCommands(commands: Array<{ command: string; description: string }>, languageCode?: string) {
    return this.requestTelegram('setMyCommands', {
      commands,
      ...(languageCode ? { language_code: languageCode } : {}),
    }, { languageCode: languageCode || 'default', commandCount: commands.length });
  }

  async setChatMenuButton(chatId?: string) {
    return this.requestTelegram('setChatMenuButton', {
      ...(chatId ? { chat_id: chatId } : {}),
      menu_button: { type: 'commands' },
    }, { hasChatId: Boolean(chatId) });
  }

  async sendMessage(chatId: string, text: string, options?: any) {
    return this.requestTelegram('sendMessage', {
      chat_id: chatId,
      text,
      ...options
    }, {
      hasChatId: Boolean(chatId),
      textLength: text.length,
      hasReplyMarkup: Boolean(options?.reply_markup),
      parseMode: options?.parse_mode || null,
    });
  }

  async editMessageText(chatId: string, messageId: number, text: string, options?: any) {
    return this.requestTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options
    }, {
      hasChatId: Boolean(chatId),
      hasMessageId: Number.isFinite(messageId),
      textLength: text.length,
      hasReplyMarkup: Boolean(options?.reply_markup),
      parseMode: options?.parse_mode || null,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean) {
    return this.requestTelegram('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    }, {
      hasCallbackQueryId: Boolean(callbackQueryId),
      textLength: text?.length ?? 0,
      showAlert: Boolean(showAlert),
    });
  }
}

function safeUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid-url';
  }
}
