// ИМПОРТЫ
require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

// ПРОВЕРКА ТОКЕНА
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN обязателен в .env или Variables');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// КОНФИГУРАЦИЯ
const CONFIG = {
  // 🔗 Замени на свой URL от опубликованного Apps Script
  GOOGLE_SHEETS_API: 'https://script.google.com/macros/s/AKfycbx-y37OLu71QFtoLUT_2IKQncwqr39DVkd6cFM4394OHTZzH2QTTLyNDgDmuRYDCqO2/exec',

  // ⏰ Уведомления за 1 час
  NOTIFICATION_HOURS_BEFORE: 1,

  // 🌍 Временная зона (Tashkent)
  TIME_ZONE: 'Asia/Tashkent'
};

// ХРАНИЛИЩЕ ДАННЫХ (в памяти)
let ADMIN_CHAT_IDS = new Set(); // Только для доступа
let MANAGERS_DATA = [];        // Полная информация
let ALL_TASKS = [];            // Из Cooperation
let ALL_CLIENTS = [];          // Из Leads

// ГЛАВНЫЙ МЕНЕДЖЕР (ты, владелец)
const OWNER_CHAT_ID = '299788619'; // ← Замени на свой!

function isOwner(chatId) {
  return chatId.toString() === OWNER_CHAT_ID;
}

// АВТОРИЗАЦИЯ: Чтение Managers из Google Таблицы
async function loadManagers() {
  try {
    const url = `${CONFIG.GOOGLE_SHEETS_API}?sheet=Managers`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Node.js Bot' }
    });

    if (Array.isArray(response.data)) {
      MANAGERS_DATA = response.data.filter(m => m['ChatID']);
      
      // Обновляем список разрешённых ID
      ADMIN_CHAT_IDS = new Set(
        MANAGERS_DATA
          .filter(m => ['admin', 'manager'].includes((m['Lavozimi'] || '').toLowerCase()))
          .map(m => m['ChatID'].toString())
          .filter(Boolean)
      );

      console.log(`✅ Загружено ${MANAGERS_DATA.length} администраторов`);
    }
  } catch (error) {
    console.warn('⚠️ Не удалось загрузить Managers:', error.message);
    // Оставляем предыдущие данные
  }
}

// ЗАГРУЗКА ЗАДАЧ И КЛИЕНТОВ
async function loadTasks() {
  try {
    const url = `${CONFIG.GOOGLE_SHEETS_API}?sheet=Cooperation`;
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Node.js Bot' }
    });

    if (Array.isArray(response.data)) {
      ALL_TASKS = response.data.filter(t => t['Mijoz IDsi'] && t['Keyingi harakat sanasi']);
      console.log(`✅ Загружено ${ALL_TASKS.length} задач`);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки задач:', error.message);
  }
}

async function loadClients() {
  try {
    const url = `${CONFIG.GOOGLE_SHEETS_API}?sheet=Leads`;
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Node.js Bot' }
    });

    if (Array.isArray(response.data)) {
      ALL_CLIENTS = response.data;
      console.log(`✅ Загружено ${ALL_CLIENTS.length} клиентов`);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки клиентов:', error.message);
  }
}

// ПРОВЕРКА ДОСТУПА
function isAuthorized(chatId) {
  const idStr = chatId.toString();
  return isOwner(idStr) || ADMIN_CHAT_IDS.has(idStr);
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
function filterByDate(tasks, targetDate) {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  return tasks.filter(task => {
    const taskDate = new Date(task['Keyingi harakat sanasi']);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate.getTime() === target.getTime();
  });
}

function getActionEmoji(action) {
  if (!action) return '📋';
  const a = action.toLowerCase();
  if (a.includes('demo') || a.includes('dars')) return '🎓';
  if (a.includes('qo\'ng\'iroq')) return '📞';
  if (a.includes('konsul')) return '📊';
  if (a.includes('sinov')) return '🎯';
  return '📋';
}

function formatTime(dateString) {
  try {
    return new Date(dateString).toLocaleTimeString('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Noma\'lum';
  }
}

function getClientInfo(clientId) {
  const client = ALL_CLIENTS.find(c => c['Mijoz IDsi'] === clientId);
  return {
    name: client?.['Ism Familiya'] || `Mijoz #${clientId.slice(-6)}`,
    phone: client?.['Telefon raqami'] || '+998 -- --- --'
  };
}

async function formatTask(task) {
  const { name, phone } = getClientInfo(task['Mijoz IDsi']);
  const emoji = getActionEmoji(task['Keyingi harakat']);
  const time = formatTime(task['Keyingi harakat sanasi']);

  return (
    `${emoji} *${task['Keyingi harakat']}*\n\n` +
    `👤 *Mijoz:* ${name}\n` +
    `📱 *Telefon:* ${phone}\n` +
    `🕒 *Vaqt:* ${time}\n` +
    `👨‍💼 *Xodim:* ${task['Xodim'] || 'Ko\'rsatilmagan'}`
  );
}

// КОМАНДЫ БОТА

// /start
bot.start(async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (!isAuthorized(chatId)) {
    return ctx.replyWithMarkdown('🚫 *Ruxsat yo‘q*');
  }

  // Автообновление данных
  await Promise.all([loadManagers(), loadTasks(), loadClients()]);

  const user = MANAGERS_DATA.find(m => m['ChatID'].toString() === chatId);
  const name = user ? user['Xodim'] : ctx.from.first_name;

  let welcome = `🌟 *Salom, ${name}*!\n\n`;

  if (isOwner(chatId)) {
    welcome += `👑 *Siz — asosiy menejer*\n`;
  } else {
    welcome += `👨‍💼 *Siz — administrator*\n`;
  }

  welcome += `\n📌 Sizning Chat ID: \`${chatId}\`\n\n`;
  welcome += `📅 Boshlash uchun /bugungi\n`;
  welcome += `📆 Ertangi vazifalar uchun /ertangi`;

  ctx.replyWithMarkdown(welcome);
});

// /bugungi
bot.command('bugungi', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!isAuthorized(chatId)) return ctx.reply('❌ Ruxsat yo‘q');

  await loadTasks();
  const today = new Date();
  const tasks = filterByDate(ALL_TASKS, today).filter(t => !t['Bajarildimi?']);

  if (tasks.length === 0) {
    return ctx.reply('📅 Bugun vazifa yo‘q');
  }

  ctx.replyWithMarkdown(`📅 *BUGUNGI VAZIFALAR (${tasks.length})*\n`);
  for (const task of tasks) {
    const message = await formatTask(task);
    const keyboard = {
      inline_keyboard: [[{
        text: '✅ Bajarildi',
        callback_ `done_${task.ID}`
      }]]
    };

    ctx.replyWithMarkdown(message, { reply_markup: keyboard });
  }
});

// /ertangi
bot.command('ertangi', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!isAuthorized(chatId)) return ctx.reply('❌ Ruxsat yo‘q');

  await loadTasks();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tasks = filterByDate(ALL_TASKS, tomorrow).filter(t => !t['Bajarildimi?']);

  if (tasks.length === 0) {
    return ctx.reply('📅 Ertangi vazifa yo‘q');
  }

  ctx.replyWithMarkdown(`📆 *ERTANGI VAZIFALAR (${tasks.length})*\n`);
  for (const task of tasks) {
    const message = await formatTask(task);
    const keyboard = {
      inline_keyboard: [[{
        text: '✅ Bajarildi',
        callback_ `done_${task.ID}`
      }]]
    };

    ctx.replyWithMarkdown(message, { reply_markup: keyboard });
  }
});

// /monitoring — faqat senga
bot.command('monitoring', async (ctx) => {
  if (!isOwner(ctx.chat.id.toString())) {
    return ctx.reply('❌ Faqat asosiy menejerga ruxsat');
  }

  await loadTasks();
  const todayCount = filterByDate(ALL_TASKS, new Date()).length;

  ctx.replyWithMarkdown(
    `📊 *MONITORING REPORT*\n\n` +
    `📅 Bugun: ${todayCount} ta vazifa\n` +
    `👥 Jami adminlar: ${ADMIN_CHAT_IDS.size}\n` +
    `🔄 Ma'lumotlar yangilangan`
  );
});

// ОБРАБОТЧИК КНОПКИ "✅ Bajarildi"
bot.action(/done_.+/, async (ctx) => {
  const taskId = ctx.match[0].split('_')[1];
  const chatId = ctx.chat.id.toString();

  if (!isAuthorized(chatId)) {
    return ctx.answerCbQuery('❌ Ruxsat yo‘q');
  }

  try {
    // Отправляем запрос в Apps Script
    await axios.get(`${CONFIG.GOOGLE_SHEETS_API}?action=complete&taskId=${taskId}`, {
      timeout: 10000
    });

    await ctx.answerCbQuery('✅ Vazifa bajarildi!');
    await ctx.reply('🎉 Ajoyib! Vazifa muvaffaqiyatli belgilandi.');

    console.log(`✅ Vazifa ${taskId} belgilandi foydalanuvchi: ${chatId}`);
  } catch (error) {
    console.error(`❌ Xatolik belgilashda ${taskId}:`, error.message);
    await ctx.answerCbQuery('❌ Xatolik yuz berdi');
  }
});

// АВТОМАТИЧЕСКИЕ ЗАДАЧИ
function startScheduledJobs() {
  // Каждые 5 минут — обновляем данные
  setInterval(async () => {
    await loadManagers();
    await loadTasks();
    await loadClients();
    console.log('🔄 Maʼlumotlar yangilandi');
  }, 5 * 60 * 1000);

  // Уведомления за 1 час
  setInterval(async () => {
    await loadTasks();
    const now = new Date();
    const oneHour = new Date(now.getTime() + 60 * 60 * 1000);

    for (const task of ALL_TASKS) {
      if (!task['Keyingi harakat sanasi'] || task['Bajarildimi?']) continue;

      const taskTime = new Date(task['Keyingi harakat sanasi']);
      if (taskTime > now && taskTime <= oneHour) {
        const message = `⏰ *Eslatma!* ${task['Keyingi harakat']} — 1 soat qoldi`;

        // Отправляем всем админам
        for (const id of ADMIN_CHAT_IDS) {
          try {
            await bot.telegram.sendMessage(id, message, { parse_mode: 'Markdown' });
          } catch (e) {
            console.error(`❌ Xabar jo‘natishda xato ${id}:`, e.message);
          }
        }
      }
    }
  }, 5 * 60 * 1000);
}

// ЗАПУСК БОТА
async function startBot() {
  try {
    console.log('🚀 Ilmlar Shahri CRM Bot ishga tushmoqda...');

    // Первичная загрузка
    await loadManagers();
    await loadTasks();
    await loadClients();

    // Запуск
    await bot.launch();
    console.log('✅ Bot ishga tushdi!');

    // Автоматизация
    startScheduledJobs();

    // Уведомление владельцу
    setTimeout(() => {
      bot.telegram.sendMessage(OWNER_CHAT_ID, '🟢 *Bot ishga tushdi! Hamma funksiyalar faol.*', {
        parse_mode: 'Markdown'
      }).catch(console.error);
    }, 3000);

  } catch (error) {
    console.error('❌ Kritik xato:', error);
    process.exit(1);
  }
}

// Graceful stop
process.once('SIGINT', () => {
  console.log('🛑 Bot to‘xtatilmoqda...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('🛑 Bot to‘xtatilmoqda...');
  bot.stop('SIGTERM');
});

// Начало
startBot();
