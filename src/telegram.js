const config = require("./config");

const BASE = `https://api.telegram.org/bot${config.telegramToken}`;

async function call(method, payload = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || `Telegram ${method} failed`);
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function sendMessage(chatId, text, extra = {}) {
  const payload = { chat_id: chatId, text };
  if (extra.parse_mode) payload.parse_mode = extra.parse_mode;
  if (extra.reply_markup) payload.reply_markup = extra.reply_markup;
  return call("sendMessage", payload, 15000);
}

async function answerCallbackQuery(id, text) {
  const payload = { callback_query_id: id };
  if (text) payload.text = text;
  return call("answerCallbackQuery", payload, 10000);
}

async function editMessageReplyMarkup(chatId, messageId) {
  return call(
    "editMessageReplyMarkup",
    { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } },
    10000
  );
}

async function getUpdates(offset) {
  return call(
    "getUpdates",
    {
      offset,
      timeout: 20,
      allowed_updates: ["message", "callback_query"],
    },
    40000
  );
}

async function deleteWebhook() {
  return call("deleteWebhook", { drop_pending_updates: true }, 15000);
}

async function getMe() {
  return call("getMe", {}, 15000);
}

async function setMyCommands(commands) {
  return call("setMyCommands", { commands }, 15000);
}

const sessions = new Map();

function getSession(chatId) {
  const key = String(chatId);
  if (!sessions.has(key)) sessions.set(key, { form: null });
  return sessions.get(key);
}

function makeCtx(update) {
  const message = update.message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  const chatId = message?.chat?.id || from?.id;
  const session = getSession(chatId);
  const callbackQuery = update.callback_query;

  return {
    chatId,
    from,
    message: update.message,
    callbackQuery,
    session,
    async reply(text, extra = {}) {
      return sendMessage(chatId, text, extra);
    },
    async answerCbQuery(text) {
      if (!callbackQuery) return;
      return answerCallbackQuery(callbackQuery.id, text);
    },
    async editMessageReplyMarkup() {
      if (!callbackQuery?.message) return;
      return editMessageReplyMarkup(chatId, callbackQuery.message.message_id);
    },
  };
}

module.exports = {
  call,
  sendMessage,
  getUpdates,
  deleteWebhook,
  getMe,
  setMyCommands,
  makeCtx,
  getSession,
};
