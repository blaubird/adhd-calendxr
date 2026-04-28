import type { TelegramLanguage } from './i18n';

export const TELEGRAM_COMMANDS = [
  'start',
  'help',
  'today',
  'tomorrow',
  'day',
  'upcoming',
  'week',
  'list',
  'done',
  'delete',
  'move',
  'cancel',
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
    day: 'Show a specific day',
    upcoming: 'Show today and tomorrow',
    week: 'Show next 7 days',
    list: "Show today's numbered list",
    done: 'Mark listed item done',
    delete: 'Delete listed item',
    move: 'Move listed item',
    cancel: 'Cancel pending action',
    settings: 'Bot settings',
    language: 'Change language',
  },
  fr: {
    start: 'Démarrer ou relancer le bot',
    help: 'Afficher l’aide',
    today: 'Voir aujourd’hui',
    tomorrow: 'Voir demain',
    day: 'Voir une journée',
    upcoming: 'Voir aujourd’hui et demain',
    week: 'Voir les 7 prochains jours',
    list: 'Voir la liste numérotée du jour',
    done: 'Marquer un élément comme terminé',
    delete: 'Supprimer un élément listé',
    move: 'Déplacer un élément listé',
    cancel: 'Annuler l’action en attente',
    settings: 'Paramètres du bot',
    language: 'Changer la langue',
  },
  uk: {
    start: 'Запустити або перезапустити бота',
    help: 'Показати допомогу',
    today: 'Показати сьогодні',
    tomorrow: 'Показати завтра',
    day: 'Показати день',
    upcoming: 'Показати сьогодні й завтра',
    week: 'Показати наступні 7 днів',
    list: 'Показати нумерований список на сьогодні',
    done: 'Позначити елемент виконаним',
    delete: 'Видалити елемент зі списку',
    move: 'Перенести елемент зі списку',
    cancel: 'Скасувати очікувану дію',
    settings: 'Налаштування бота',
    language: 'Змінити мову',
  },
  ru: {
    start: 'Запустить или перезапустить бота',
    help: 'Показать помощь',
    today: 'Показать сегодня',
    tomorrow: 'Показать завтра',
    day: 'Показать день',
    upcoming: 'Показать сегодня и завтра',
    week: 'Показать следующие 7 дней',
    list: 'Показать нумерованный список на сегодня',
    done: 'Отметить элемент выполненным',
    delete: 'Удалить элемент из списка',
    move: 'Перенести элемент из списка',
    cancel: 'Отменить ожидающее действие',
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
