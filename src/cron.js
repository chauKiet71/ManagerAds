const cron = require("node-cron");
const sheets = require("./sheets");
const config = require("./config");
const {
  isSameOrBeforeToday,
  formatMoney,
  resolveDateRange,
  nowClock,
  formatReportTimes,
  nextReportAt,
} = require("./utils");
const { syncYesterday, formatSyncResult } = require("./sync");
const { loadCampaignInsights, formatDigestReport, splitTelegram } = require("./adsReport");
const { startUidMonitor } = require("./uidMonitor");

let cachedTimes = null;
let digestBot = null;
let digestBusy = false;
let nextTimer = null;
let cachedChatId = "";

async function resolveReportChatId() {
  if (cachedChatId) return cachedChatId;
  try {
    cachedChatId = (await sheets.getReportChatId()) || config.adminChatId || "";
  } catch (_) {
    cachedChatId = config.adminChatId || "";
  }
  return cachedChatId;
}

function notifyChatId() {
  return cachedChatId || config.adminChatId;
}

async function checkAndNotify(bot) {
  const chatId = notifyChatId() || (await resolveReportChatId());
  if (!chatId) {
    console.warn("Bỏ qua thông báo: chưa có TELEGRAM_ADMIN_CHAT_ID");
    return;
  }

  const [budgets, fees] = await Promise.all([
    sheets.listBudgets(),
    sheets.listFees(),
  ]);

  for (const b of budgets) {
    if (b.notified || !b.expireDate) continue;
    if (!isSameOrBeforeToday(b.expireDate)) continue;
    const text = [
      "⚠️ HẾT NGÂN SÁCH",
      "",
      `Khách hàng: ${b.customer}`,
      `Ngân sách: ${formatMoney(b.amount)}`,
      `Ngày chuyển khoản: ${b.transferDate}`,
      `Ngày hết ngân sách: ${b.expireDate}`,
    ].join("\n");
    await bot.sendMessage(chatId, text);
    await sheets.markBudgetNotified(b.id);
  }

  for (const f of fees) {
    if (f.notified || !f.feeDate) continue;
    if (!isSameOrBeforeToday(f.feeDate)) continue;
    const text = [
      "🔔 ĐẾN NGÀY THU PHÍ DỊCH VỤ",
      "",
      `Khách hàng: ${f.customer}`,
      `Phí dịch vụ: ${f.amount ? formatMoney(f.amount) : "—"}`,
      `Ngày thu phí dịch vụ: ${f.feeDate}`,
    ].join("\n");
    await bot.sendMessage(chatId, text);
    await sheets.markFeeNotified(f.id);
  }
}

async function sendAdsDigest(bot, { notifySkip = false, chatId } = {}) {
  const to = chatId || (await resolveReportChatId());
  if (!config.metaAccessToken) {
    const msg = "Bỏ qua báo cáo ads: chưa có META_ACCESS_TOKEN";
    console.warn(msg);
    if (notifySkip && to) await bot.sendMessage(to, msg);
    return { ok: false, error: msg };
  }
  if (!to) {
    const msg = "Bỏ qua báo cáo ads: chưa có chat để gửi. Mở /dat_gio_bao_cao một lần.";
    console.warn(msg);
    return { ok: false, error: msg };
  }
  const range = resolveDateRange("today");
  const result = await loadCampaignInsights({
    since: range.since,
    until: range.until,
  });
  const text = formatDigestReport(result, range);
  for (const chunk of splitTelegram(text)) {
    await bot.sendMessage(to, chunk);
  }
  return { ok: true };
}

async function loadReportTimes() {
  if (cachedTimes) return cachedTimes;
  cachedTimes = await sheets.getReportTimes();
  return cachedTimes;
}

function describeNextReport(times = cachedTimes) {
  const next = nextReportAt(times || []);
  if (!next) return "Chưa hẹn lần gửi tới (không có mốc).";
  const mins = Math.max(1, Math.round(next.delayMs / 60000));
  const secs = Math.max(1, Math.round(next.delayMs / 1000));
  if (next.delayMs < 60000) return `Lần gửi tới: ${next.label} (sau ${secs} giây)`;
  return `Lần gửi tới: ${next.label} (sau ${mins} phút)`;
}

function rescheduleReport(bot = digestBot) {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
  const times = cachedTimes || [];
  const next = nextReportAt(times);
  if (!next || !bot) {
    console.log("Báo cáo ads: tắt hẹn giờ —", formatReportTimes(times));
    return next;
  }
  const delay = Math.max(300, Math.min(next.delayMs, 2147483647));
  console.log(
    `Báo cáo ads: hẹn ${next.label} (sau ${Math.round(delay / 1000)}s), giờ máy VN ${nowClock().label}`
  );
  nextTimer = setTimeout(async () => {
    nextTimer = null;
    if (digestBusy) {
      rescheduleReport(bot);
      return;
    }
    digestBusy = true;
    try {
      console.log("Đến giờ báo cáo ads", next.label);
      await sendAdsDigest(bot, { notifySkip: true });
    } catch (err) {
      console.error("Lỗi gửi báo cáo ads:", err);
      const chatId = await resolveReportChatId();
      if (chatId) {
        await bot
          .sendMessage(chatId, `Lỗi báo cáo Facebook Ads lúc ${next.label}: ${err.message || err}`)
          .catch(() => {});
      }
    } finally {
      digestBusy = false;
      rescheduleReport(bot);
    }
  }, delay);
  return next;
}

function rememberReportTimes(times, chatId) {
  cachedTimes = Array.isArray(times) ? times : null;
  if (chatId) cachedChatId = String(chatId);
  return rescheduleReport(digestBot);
}

async function syncAdsAndNotify(bot) {
  const chatId = await resolveReportChatId();
  if (!config.metaAccessToken) {
    console.warn("Bỏ qua sync ads: chưa có META_ACCESS_TOKEN");
    return;
  }
  const result = await syncYesterday();
  const text = formatSyncResult(result);
  console.log("Sync ads:", text.replace(/\n/g, " | "));
  if (chatId) {
    await bot.sendMessage(chatId, text);
  }
}

async function startCron(bot) {
  digestBot = bot;
  const hour = Math.min(23, Math.max(0, config.notifyHour));
  const expr = `0 ${hour} * * *`;
  cron.schedule(
    expr,
    async () => {
      try {
        await checkAndNotify(bot);
      } catch (err) {
        console.error("Lỗi cron thông báo:", err);
      }
    },
    { timezone: config.timezone }
  );
  console.log(`Cron thông báo: ${expr} (${config.timezone})`);

  cron.schedule(
    "15 7 * * *",
    async () => {
      try {
        await syncAdsAndNotify(bot);
      } catch (err) {
        console.error("Lỗi cron sync ads:", err);
        const chatId = await resolveReportChatId();
        if (chatId) {
          await bot.sendMessage(chatId, `Lỗi kéo số Facebook Ads: ${err.message || err}`).catch(() => {});
        }
      }
    },
    { timezone: config.timezone }
  );
  console.log(`Cron sync ads: 15 7 * * * (${config.timezone})`);

  try {
    cachedTimes = await sheets.getReportTimes();
    cachedChatId = (await sheets.getReportChatId()) || config.adminChatId || "";
    const next = rescheduleReport(bot);
    console.log(
      `Báo cáo ads: giờ VN ${nowClock().label} — mốc ${formatReportTimes(cachedTimes)}` +
        (next ? ` — ${describeNextReport(cachedTimes)}` : "")
    );
  } catch (err) {
    console.warn("Chưa đọc được giờ báo cáo ads:", err.message || err);
  }

  try {
    await startUidMonitor(bot);
  } catch (err) {
    console.warn("Không bật được monitor UID:", err.message || err);
  }
}

module.exports = {
  startCron,
  checkAndNotify,
  syncAdsAndNotify,
  sendAdsDigest,
  rememberReportTimes,
  describeNextReport,
  rescheduleReport,
};
