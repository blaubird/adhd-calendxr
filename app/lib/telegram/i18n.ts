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
  settingsReminders: (enabled: boolean) => string;
  changeLanguage: string;
  enableReminders: string;
  disableReminders: string;
  remindersEnabled: string;
  remindersDisabled: string;
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
  reminderTitle: string;
  reminderIn15Minutes: string;
  untimedMorningTitle: string;
  doneTitle: string;
  deletedTitle: string;
  movedTitle: string;
  deletePrompt: string;
  confirmDelete: string;
  couldNotFindItem: string;
  couldNotUnderstandDateTime: string;
  moveUsage: string;
  recurringMoveUnsupported: string;
  alreadyDone: string;
  unsupported: string;
};

export const TELEGRAM_MESSAGES: Record<TelegramLanguage, TelegramMessages> = {
  en: {
    start:
      'CALENDXR bot is ready.\n\nYou can use:\n/today\n/tomorrow\n/week\n/language\n/settings\n\nSend a task or event and I will prepare a draft.\n\nDaily digest is off by default. You can enable it in /settings.',
    help:
      'Help\n\n/today - Show today\n/week - Show next 7 days\n/done 2 - Mark listed item done\n/delete 2 - Delete listed item\n/move 2 tomorrow 14:00 - Move listed item\n/settings - Bot settings\n/language - Change language\n\nExamples\ncreate dentist tomorrow at 18:00\nevery Friday at 10:00 volunteering\ntomorrow buy medicine and send the letter',
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
    settingsReminders: (enabled) => `Daily digest: ${enabled ? 'On' : 'Off'}`,
    changeLanguage: 'Change language',
    enableReminders: 'Enable daily digest',
    disableReminders: 'Disable daily digest',
    remindersEnabled: 'Daily digest enabled.',
    remindersDisabled: 'Daily digest disabled.',
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
    reminderTitle: 'Reminder',
    reminderIn15Minutes: 'In 15 minutes',
    untimedMorningTitle: 'Untimed',
    doneTitle: 'Done',
    deletedTitle: 'Deleted',
    movedTitle: 'Moved',
    deletePrompt: 'Delete this item?',
    confirmDelete: 'Confirm delete',
    couldNotFindItem: 'Could not find that item. Run /today first.',
    couldNotUnderstandDateTime: 'I could not understand the date/time.',
    moveUsage: 'Use: /move 2 tomorrow 14:00',
    recurringMoveUnsupported: 'This recurring occurrence cannot be moved yet.',
    alreadyDone: 'That item is already done.',
    unsupported:
      'I only handle calendar queries and draft creation here.\n\nTry:\n◦ what do I have tomorrow\n◦ show me the next 5 days\n◦ tomorrow buy medicine\n◦ every Monday at 10:00 volunteering',
  },
  fr: {
    start:
      'Le bot CALENDXR est prêt.\n\nVous pouvez utiliser :\n/today\n/tomorrow\n/week\n/language\n/settings\n\nEnvoyez une tâche ou un événement et je préparerai un brouillon.\n\nLe résumé quotidien est désactivé par défaut. Vous pouvez l’activer dans /settings.',
    help:
      'Aide\n\n/today - Voir aujourd’hui\n/week - Voir les 7 prochains jours\n/done 2 - Marquer un élément comme terminé\n/delete 2 - Supprimer un élément listé\n/move 2 tomorrow 14:00 - Déplacer un élément listé\n/settings - Paramètres du bot\n/language - Changer la langue\n\nExemples\ncréer dentiste demain à 18:00\nchaque vendredi à 10:00 bénévolat\ndemain acheter des médicaments et envoyer la lettre',
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
    settingsReminders: (enabled) => `Résumé quotidien : ${enabled ? 'Activé' : 'Désactivé'}`,
    changeLanguage: 'Changer la langue',
    enableReminders: 'Activer le résumé quotidien',
    disableReminders: 'Désactiver le résumé quotidien',
    remindersEnabled: 'Résumé quotidien activé.',
    remindersDisabled: 'Résumé quotidien désactivé.',
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
    reminderTitle: 'Rappel',
    reminderIn15Minutes: 'Dans 15 minutes',
    untimedMorningTitle: 'Sans heure',
    doneTitle: 'Terminé',
    deletedTitle: 'Supprimé',
    movedTitle: 'Déplacé',
    deletePrompt: 'Supprimer cet élément ?',
    confirmDelete: 'Confirmer la suppression',
    couldNotFindItem: 'Élément introuvable. Lancez /today d’abord.',
    couldNotUnderstandDateTime: 'Je n’ai pas compris la date ou l’heure.',
    moveUsage: 'Utilisez : /move 2 tomorrow 14:00',
    recurringMoveUnsupported: 'Cette occurrence récurrente ne peut pas encore être déplacée.',
    alreadyDone: 'Cet élément est déjà terminé.',
    unsupported:
      'Je gère seulement les requêtes de calendrier et la création de brouillons ici.\n\nEssayez :\n◦ qu’est-ce que j’ai demain\n◦ montre les 5 prochains jours\n◦ demain acheter des médicaments\n◦ chaque lundi à 10:00 bénévolat',
  },
  uk: {
    start:
      'Бот CALENDXR готовий.\n\nМожна використовувати:\n/today\n/tomorrow\n/week\n/language\n/settings\n\nНадішліть задачу або подію, і я підготую чернетку.\n\nЩоденний огляд типово вимкнений. Його можна ввімкнути в /settings.',
    help:
      'Допомога\n\n/today - Показати сьогодні\n/week - Показати наступні 7 днів\n/done 2 - Позначити елемент виконаним\n/delete 2 - Видалити елемент зі списку\n/move 2 tomorrow 14:00 - Перенести елемент зі списку\n/settings - Налаштування бота\n/language - Змінити мову\n\nПриклади\nстворити стоматолога завтра о 18:00\nщоп’ятниці о 10:00 волонтерство\nзавтра купити ліки й надіслати лист',
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
    settingsReminders: (enabled) => `Щоденний огляд: ${enabled ? 'Увімкнений' : 'Вимкнений'}`,
    changeLanguage: 'Змінити мову',
    enableReminders: 'Увімкнути щоденний огляд',
    disableReminders: 'Вимкнути щоденний огляд',
    remindersEnabled: 'Щоденний огляд увімкнено.',
    remindersDisabled: 'Щоденний огляд вимкнено.',
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
    reminderTitle: 'Нагадування',
    reminderIn15Minutes: 'Через 15 хвилин',
    untimedMorningTitle: 'Без часу',
    doneTitle: 'Готово',
    deletedTitle: 'Видалено',
    movedTitle: 'Перенесено',
    deletePrompt: 'Видалити цей елемент?',
    confirmDelete: 'Підтвердити видалення',
    couldNotFindItem: 'Не вдалося знайти цей елемент. Спочатку запустіть /today.',
    couldNotUnderstandDateTime: 'Не вдалося зрозуміти дату або час.',
    moveUsage: 'Використайте: /move 2 tomorrow 14:00',
    recurringMoveUnsupported: 'Цю повторювану подію поки не можна перенести.',
    alreadyDone: 'Цей елемент уже виконано.',
    unsupported:
      'Тут я обробляю лише запити календаря та створення чернеток.\n\nСпробуйте:\n◦ що у мене завтра\n◦ покажи найближчі 5 днів\n◦ завтра купити ліки\n◦ щопонеділка о 10:00 волонтерство',
  },
  ru: {
    start:
      'Бот CALENDXR готов.\n\nМожно использовать:\n/today\n/tomorrow\n/week\n/language\n/settings\n\nОтправьте задачу или событие, и я подготовлю черновик.\n\nЕжедневная сводка по умолчанию выключена. Её можно включить в /settings.',
    help:
      'Помощь\n\n/today - Показать сегодня\n/week - Показать следующие 7 дней\n/done 2 - Отметить элемент выполненным\n/delete 2 - Удалить элемент из списка\n/move 2 tomorrow 14:00 - Перенести элемент из списка\n/settings - Настройки бота\n/language - Изменить язык\n\nПримеры\nсоздай завтра в 18:00 стоматолог\nкаждую пятницу в 10:00 волонтёрство\nзавтра купить таблетки и отправить письмо',
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
    settingsReminders: (enabled) => `Ежедневная сводка: ${enabled ? 'Включена' : 'Выключена'}`,
    changeLanguage: 'Изменить язык',
    enableReminders: 'Включить ежедневную сводку',
    disableReminders: 'Выключить ежедневную сводку',
    remindersEnabled: 'Ежедневная сводка включена.',
    remindersDisabled: 'Ежедневная сводка выключена.',
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
    reminderTitle: 'Напоминание',
    reminderIn15Minutes: 'Через 15 минут',
    untimedMorningTitle: 'Без времени',
    doneTitle: 'Готово',
    deletedTitle: 'Удалено',
    movedTitle: 'Перенесено',
    deletePrompt: 'Удалить этот элемент?',
    confirmDelete: 'Подтвердить удаление',
    couldNotFindItem: 'Не удалось найти этот элемент. Сначала запустите /today.',
    couldNotUnderstandDateTime: 'Не удалось понять дату или время.',
    moveUsage: 'Используйте: /move 2 tomorrow 14:00',
    recurringMoveUnsupported: 'Этот повторяющийся экземпляр пока нельзя перенести.',
    alreadyDone: 'Этот элемент уже выполнен.',
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
