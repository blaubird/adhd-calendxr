import type { TelegramLanguage } from './i18n';

export const TELEGRAM_COMMANDS = [
  'start',
  'help',
  'today',
  'tomorrow',
  'week',
  'list',
  'done',
  'delete',
  'move',
  'settings',
  'language',
] as const;

type TelegramCommand = (typeof TELEGRAM_COMMANDS)[number];

export const TELEGRAM_COMMAND_DESCRIPTIONS: Record<TelegramLanguage, Record<TelegramCommand, string>> = {
  en: {
    start: 'Start or restart the bot',
    help: 'Show help',
    today: 'Show today',
    tomorrow: 'Show tomorrow',
    week: 'Show next 7 days',
    list: "Show today's numbered list",
    done: 'Mark listed item done',
    delete: 'Delete listed item',
    move: 'Move listed item',
    settings: 'Bot settings',
    language: 'Change language',
  },
  fr: {
    start: 'Démarrer ou relancer le bot',
    help: 'Afficher l’aide',
    today: 'Voir aujourd’hui',
    tomorrow: 'Voir demain',
    week: 'Voir les 7 prochains jours',
    list: 'Voir la liste numérotée du jour',
    done: 'Marquer un élément comme terminé',
    delete: 'Supprimer un élément listé',
    move: 'Déplacer un élément listé',
    settings: 'Paramètres du bot',
    language: 'Changer la langue',
  },
  uk: {
    start: 'Запустити або перезапустити бота',
    help: 'Показати допомогу',
    today: 'Показати сьогодні',
    tomorrow: 'Показати завтра',
    week: 'Показати наступні 7 днів',
    list: 'Показати нумерований список на сьогодні',
    done: 'Позначити елемент виконаним',
    delete: 'Видалити елемент зі списку',
    move: 'Перенести елемент зі списку',
    settings: 'Налаштування бота',
    language: 'Змінити мову',
  },
  ru: {
    start: 'Запустить или перезапустить бота',
    help: 'Показать помощь',
    today: 'Показать сегодня',
    tomorrow: 'Показать завтра',
    week: 'Показать следующие 7 дней',
    list: 'Показать нумерованный список на сегодня',
    done: 'Отметить элемент выполненным',
    delete: 'Удалить элемент из списка',
    move: 'Перенести элемент из списка',
    settings: 'Настройки бота',
    language: 'Изменить язык',
  },
};

export function buildTelegramCommands(language: TelegramLanguage) {
  const descriptions = TELEGRAM_COMMAND_DESCRIPTIONS[language];
  return TELEGRAM_COMMANDS.map((command) => ({
    command,
    description: descriptions[command],
  }));
}
