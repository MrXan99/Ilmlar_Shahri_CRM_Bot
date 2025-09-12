require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

// Проверка токена
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не установлен!');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// === КОНФИГУРАЦИЯ ===
const CONFIG = {
  // URL твоего опубликованного Apps Script
  GOOGLE_SHEETS_API: 'https://script.google.com/macros/s/ABC123/exec', // ← Замени!
};

// Хранилище данных
let ALL_TASKS = [];
let MANAGER_CHAT_IDS = ['299788619']; // ← Твой ChatID

// Функция: получить задачи из Google Таблицы
async function getTasks() {
  try {
    const response = await axios.get(CONFIG.GOOGLE_SHEETS_API);
    if (Array.isArray(response.data)) {
      ALL_TASKS = response.data;
      console.log(`✅ Загружено ${ALL_TASKS.length} задач`);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки задач:', error.message);
  }
}

// Команда /start
bot.start(async (ctx) => {
  const chatId = ctx.chat.id.toString();

  // Только ты и админы
  if (!MANAGER_CHAT_IDS.includes(chatId)) {
    return ctx.reply('🚫 Доступ запрещён.');
  }

  await getTasks();

  ctx.replyWithMarkdown(
    `🌟 *Добро пожаловать!* \n\n` +
    `📌 Ваш ID: \`${chatId}\`\n\n` +
    `Доступные команды:\n` +
    `/bugungi — Задачи на сегодня\n` +
    `/yordam — Помощь`
  );
});

// Команда /bugungi
bot.command('bugungi', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!MANAGER_CHAT_IDS.includes(chatId)) return;

  await getTasks();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tasks = ALL_TASKS.filter(task => {
    const taskDate = new Date(task['Keyingi harakat sanasi']);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate.getTime() === today.getTime();
  });

  if (tasks.length === 0) {
    return ctx.reply('📅 Нет задач на сегодня');
  }

  for (const task of tasks) {
    await ctx.replyWithMarkdown(
      `🎓 *${task['Keyingi harakat']}*\n` +
      `👤 *Клиент:* ${task['Mijoz IDsi'] || 'Не указан'}\n` +
      `🕒 *Время:* ${new Date(task['Keyingi harakat sanasi']).toLocaleTimeString('uz')}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Bajarildi', callback_ `done_${task.ID}` }]
          ]
        }
      }
    });
  }
});

// Обработка кнопки
bot.action(/done_.+/, (ctx) => {
  ctx.answerCbQuery('✅ Vazifa bajarildi!');
  ctx.reply('🎉 Отлично! Задача выполнена.');
});

// Запуск бота
bot.launch();
console.log('✅ Бот запущен!');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
