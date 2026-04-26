export class TelegramClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
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
    const res = await fetch(`${this.baseUrl}/deleteWebhook`);
    return await res.json();
  }

  async setWebhook(url: string, secretToken: string) {
    const res = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
    return await res.json();
  }

  async getWebhookInfo() {
    const res = await fetch(`${this.baseUrl}/getWebhookInfo`);
    return await res.json();
  }

  async setMyCommands(commands: Array<{ command: string; description: string }>, languageCode?: string) {
    const res = await fetch(`${this.baseUrl}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands,
        ...(languageCode ? { language_code: languageCode } : {}),
      }),
    });
    return await res.json();
  }

  async setChatMenuButton(chatId?: string) {
    const res = await fetch(`${this.baseUrl}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(chatId ? { chat_id: chatId } : {}),
        menu_button: { type: 'commands' },
      }),
    });
    return await res.json();
  }

  async sendMessage(chatId: string, text: string, options?: any) {
    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options
      }),
    });
    return await res.json();
  }

  async editMessageText(chatId: string, messageId: number, text: string, options?: any) {
    const res = await fetch(`${this.baseUrl}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        ...options
      }),
    });
    return await res.json();
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean) {
    const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      }),
    });
    return await res.json();
  }
}
