export const TELEGRAM_LANGUAGES = ['en', 'fr', 'uk', 'ru'] as const;

export type TelegramLanguage = (typeof TELEGRAM_LANGUAGES)[number];

export const TELEGRAM_LANGUAGE_LABELS: Record<TelegramLanguage, string> = {
  en: 'English',
  fr: 'Français',
  uk: 'Українська',
  ru: 'Русский',
};

type TelegramMessages = {
  start: string;
  help: string;
  thinking: string;
  clarificationNeeded: string;
  noDrafts: string;
  draftCount: (count: number) => string;
  draftExpired: string;
  saved: string;
  failedToSave: string;
  canceled: string;
  canceledDraft: string;
  unknownAction: string;
  cooldown: string;
  requestFailed: (message: string) => string;
  languageTitle: string;
  languageChanged: string;
  settingsTitle: string;
  settingsLanguage: (language: string) => string;
  changeLanguage: string;
  dayToday: string;
  dayTomorrow: string;
  dayGeneric: string;
  timed: string;
  untimed: string;
  nothingPlanned: string;
  emptyDay: string;
  noItems: string;
  next7Days: string;
  totalActive: (count: number) => string;
  morningDigest: string;
  repeats: string;
  savedPrefix: string;
  noTime: string;
  unsupported: string;
};

export const TELEGRAM_MESSAGES: Record<TelegramLanguage, TelegramMessages> = {
  en: {
    start:
      '☾ CALENDXR is awake.\n\n◇ Commands\n/start - Start or restart the bot\n/help - Show help\n/today - Show today\n/tomorrow - Show tomorrow\n/week - Show next 7 days\n/settings - Bot settings\n/language - Change language\n\n◇ Natural language\nSend a task or event and I will prepare a draft.',
    help:
      '☾ Help\n\n◇ Commands\n/today - Show today\n/tomorrow - Show tomorrow\n/week - Show next 7 days\n/settings - Bot settings\n/language - Change language\n\n◇ Examples\n◦ create dentist tomorrow at 18:00\n◦ every Friday at 10:00 volunteering\n◦ tomorrow buy medicine and send the letter',
    thinking: 'Thinking...',
    clarificationNeeded: 'Clarification needed:',
    noDrafts: 'No drafts could be interpreted.',
    draftCount: (count) => `I prepared ${count} draft(s).`,
    draftExpired: 'Draft expired or not found.',
    saved: 'Saved!',
    failedToSave: 'Failed to save.',
    canceled: 'Canceled.',
    canceledDraft: 'Canceled draft.',
    unknownAction: 'Unknown action.',
    cooldown: 'Please give me a moment before the next AI-routed request.',
    requestFailed: (message) => `Failed to handle Telegram request: ${message}`,
    languageTitle: '☾ Language\n\nChoose the bot interface language.',
    languageChanged: 'Language changed to English.',
    settingsTitle: '⚙ Settings',
    settingsLanguage: (language) => `Language: ${language}`,
    changeLanguage: 'Change language',
    dayToday: 'Today',
    dayTomorrow: 'Tomorrow',
    dayGeneric: 'Day',
    timed: 'Timed',
    untimed: 'Untimed',
    nothingPlanned: 'Nothing planned',
    emptyDay: 'The day is empty.',
    noItems: 'No items',
    next7Days: 'Next 7 days',
    totalActive: (count) => `Total active: ${count}`,
    morningDigest: 'Morning Digest',
    repeats: 'Repeats',
    savedPrefix: 'Saved',
    noTime: 'No time',
    unsupported:
      'I only handle calendar queries and draft creation here.\n\nTry:\n◦ what do I have tomorrow\n◦ show me the next 5 days\n◦ tomorrow buy medicine\n◦ every Monday at 10:00 volunteering',
  },
  fr: {
    start:
      '☾ CALENDXR est prêt.\n\n◇ Commandes\n/start - Démarrer ou relancer le bot\n/help - Afficher l’aide\n/today - Voir aujourd’hui\n/tomorrow - Voir demain\n/week - Voir les 7 prochains jours\n/settings - Paramètres du bot\n/language - Changer la langue\n\n◇ Langage naturel\nEnvoyez une tâche ou un événement et je préparerai un brouillon.',
    help:
      '☾ Aide\n\n◇ Commandes\n/today - Voir aujourd’hui\n/tomorrow - Voir demain\n/week - Voir les 7 prochains jours\n/settings - Paramètres du bot\n/language - Changer la langue\n\n◇ Exemples\n◦ créer dentiste demain à 18:00\n◦ chaque vendredi à 10:00 bénévolat\n◦ demain acheter des médicaments et envoyer la lettre',
    thinking: 'Je réfléchis...',
    clarificationNeeded: 'Précision nécessaire :',
    noDrafts: 'Aucun brouillon n’a pu être interprété.',
    draftCount: (count) => `${count} brouillon(s) préparé(s).`,
    draftExpired: 'Brouillon expiré ou introuvable.',
    saved: 'Enregistré !',
    failedToSave: 'Échec de l’enregistrement.',
    canceled: 'Annulé.',
    canceledDraft: 'Brouillon annulé.',
    unknownAction: 'Action inconnue.',
    cooldown: 'Merci d’attendre un instant avant la prochaine requête avec IA.',
    requestFailed: (message) => `Échec du traitement de la requête Telegram : ${message}`,
    languageTitle: '☾ Langue\n\nChoisissez la langue de l’interface du bot.',
    languageChanged: 'La langue a été changée en français.',
    settingsTitle: '⚙ Paramètres',
    settingsLanguage: (language) => `Langue : ${language}`,
    changeLanguage: 'Changer la langue',
    dayToday: 'Aujourd’hui',
    dayTomorrow: 'Demain',
    dayGeneric: 'Jour',
    timed: 'Avec heure',
    untimed: 'Sans heure',
    nothingPlanned: 'Rien de prévu',
    emptyDay: 'La journée est libre.',
    noItems: 'Aucun élément',
    next7Days: '7 prochains jours',
    totalActive: (count) => `Total actif : ${count}`,
    morningDigest: 'Résumé du matin',
    repeats: 'Répétition',
    savedPrefix: 'Enregistré',
    noTime: 'Sans heure',
    unsupported:
      'Je gère seulement les requêtes de calendrier et la création de brouillons ici.\n\nEssayez :\n◦ qu’est-ce que j’ai demain\n◦ montre les 5 prochains jours\n◦ demain acheter des médicaments\n◦ chaque lundi à 10:00 bénévolat',
  },
  uk: {
    start:
      '☾ CALENDXR готовий.\n\n◇ Команди\n/start - Запустити або перезапустити бота\n/help - Показати допомогу\n/today - Показати сьогодні\n/tomorrow - Показати завтра\n/week - Показати наступні 7 днів\n/settings - Налаштування бота\n/language - Змінити мову\n\n◇ Природна мова\nНадішліть задачу або подію, і я підготую чернетку.',
    help:
      '☾ Допомога\n\n◇ Команди\n/today - Показати сьогодні\n/tomorrow - Показати завтра\n/week - Показати наступні 7 днів\n/settings - Налаштування бота\n/language - Змінити мову\n\n◇ Приклади\n◦ створити стоматолога завтра о 18:00\n◦ щоп’ятниці о 10:00 волонтерство\n◦ завтра купити ліки й надіслати лист',
    thinking: 'Думаю...',
    clarificationNeeded: 'Потрібне уточнення:',
    noDrafts: 'Не вдалося розпізнати жодної чернетки.',
    draftCount: (count) => `Підготовлено чернеток: ${count}.`,
    draftExpired: 'Чернетка застаріла або не знайдена.',
    saved: 'Збережено!',
    failedToSave: 'Не вдалося зберегти.',
    canceled: 'Скасовано.',
    canceledDraft: 'Чернетку скасовано.',
    unknownAction: 'Невідома дія.',
    cooldown: 'Зачекайте трохи перед наступним AI-запитом.',
    requestFailed: (message) => `Не вдалося обробити запит Telegram: ${message}`,
    languageTitle: '☾ Мова\n\nОберіть мову інтерфейсу бота.',
    languageChanged: 'Мову змінено на українську.',
    settingsTitle: '⚙ Налаштування',
    settingsLanguage: (language) => `Мова: ${language}`,
    changeLanguage: 'Змінити мову',
    dayToday: 'Сьогодні',
    dayTomorrow: 'Завтра',
    dayGeneric: 'День',
    timed: 'З часом',
    untimed: 'Без часу',
    nothingPlanned: 'Нічого не заплановано',
    emptyDay: 'День вільний.',
    noItems: 'Немає елементів',
    next7Days: 'Наступні 7 днів',
    totalActive: (count) => `Активних усього: ${count}`,
    morningDigest: 'Ранковий огляд',
    repeats: 'Повтор',
    savedPrefix: 'Збережено',
    noTime: 'Без часу',
    unsupported:
      'Тут я обробляю лише запити календаря та створення чернеток.\n\nСпробуйте:\n◦ що у мене завтра\n◦ покажи найближчі 5 днів\n◦ завтра купити ліки\n◦ щопонеділка о 10:00 волонтерство',
  },
  ru: {
    start:
      '☾ CALENDXR готов.\n\n◇ Команды\n/start - Запустить или перезапустить бота\n/help - Показать помощь\n/today - Показать сегодня\n/tomorrow - Показать завтра\n/week - Показать следующие 7 дней\n/settings - Настройки бота\n/language - Изменить язык\n\n◇ Естественный язык\nОтправьте задачу или событие, и я подготовлю черновик.',
    help:
      '☾ Помощь\n\n◇ Команды\n/today - Показать сегодня\n/tomorrow - Показать завтра\n/week - Показать следующие 7 дней\n/settings - Настройки бота\n/language - Изменить язык\n\n◇ Примеры\n◦ создай завтра в 18:00 стоматолог\n◦ каждую пятницу в 10:00 волонтёрство\n◦ завтра купить таблетки и отправить письмо',
    thinking: 'Думаю...',
    clarificationNeeded: 'Нужно уточнение:',
    noDrafts: 'Не удалось распознать ни одного черновика.',
    draftCount: (count) => `Подготовлено черновиков: ${count}.`,
    draftExpired: 'Черновик устарел или не найден.',
    saved: 'Сохранено!',
    failedToSave: 'Не удалось сохранить.',
    canceled: 'Отменено.',
    canceledDraft: 'Черновик отменён.',
    unknownAction: 'Неизвестное действие.',
    cooldown: 'Пожалуйста, подождите немного перед следующим AI-запросом.',
    requestFailed: (message) => `Не удалось обработать Telegram-запрос: ${message}`,
    languageTitle: '☾ Язык\n\nВыберите язык интерфейса бота.',
    languageChanged: 'Язык изменён на русский.',
    settingsTitle: '⚙ Настройки',
    settingsLanguage: (language) => `Язык: ${language}`,
    changeLanguage: 'Изменить язык',
    dayToday: 'Сегодня',
    dayTomorrow: 'Завтра',
    dayGeneric: 'День',
    timed: 'По времени',
    untimed: 'Без времени',
    nothingPlanned: 'Ничего не запланировано',
    emptyDay: 'День свободен.',
    noItems: 'Нет элементов',
    next7Days: 'Следующие 7 дней',
    totalActive: (count) => `Всего активных: ${count}`,
    morningDigest: 'Утренний дайджест',
    repeats: 'Повтор',
    savedPrefix: 'Сохранено',
    noTime: 'Без времени',
    unsupported:
      'Здесь я обрабатываю только запросы календаря и создание черновиков.\n\nПопробуйте:\n◦ что у меня завтра\n◦ покажи ближайшие 5 дней\n◦ завтра купить таблетки\n◦ каждый понедельник в 10:00 волонтёрство',
  },
};

export function isTelegramLanguage(value: string): value is TelegramLanguage {
  return TELEGRAM_LANGUAGES.includes(value as TelegramLanguage);
}

export function normalizeTelegramLanguage(value: string | null | undefined): TelegramLanguage {
  return value && isTelegramLanguage(value) ? value : 'en';
}

export function t(language: TelegramLanguage) {
  return TELEGRAM_MESSAGES[language];
}
