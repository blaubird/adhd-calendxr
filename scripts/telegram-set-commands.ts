import 'dotenv/config';
import { env } from '../app/env';
import { buildTelegramCommands } from '../app/lib/telegram/commands';
import { TELEGRAM_LANGUAGES } from '../app/lib/telegram/i18n';
import { createTelegramClient } from '../app/lib/telegram/runtime';

async function assertTelegramOk(result: any, action: string) {
  if (!result?.ok) {
    throw new Error(`${action} failed: ${result?.description || 'unknown error'}`);
  }
}

async function main() {
  const client = createTelegramClient();

  console.log('[Telegram] Registering default bot commands.');
  await assertTelegramOk(await client.setMyCommands(buildTelegramCommands('en')), 'setMyCommands(default)');

  for (const language of TELEGRAM_LANGUAGES) {
    console.log(`[Telegram] Registering ${language} command descriptions.`);
    await assertTelegramOk(
      await client.setMyCommands(buildTelegramCommands(language), language),
      `setMyCommands(${language})`
    );
  }

  console.log('[Telegram] Setting default menu button to commands.');
  await assertTelegramOk(await client.setChatMenuButton(), 'setChatMenuButton(default)');

  if (env.TELEGRAM_ALLOWED_CHAT_ID) {
    console.log('[Telegram] Setting allowed-chat menu button to commands.');
    await assertTelegramOk(await client.setChatMenuButton(env.TELEGRAM_ALLOWED_CHAT_ID), 'setChatMenuButton(chat)');
  }

  console.log('[Telegram] Commands and native menu button configured.');
}

main().catch((err) => {
  console.error('[Telegram] Fatal error setting commands:', err?.message || err);
  process.exit(1);
});
