const cron = require("node-cron");
const sheets = require("./sheets");
const config = require("./config");
const { isSameOrBeforeToday, formatMoney, resolveDateRange } = require("./utils");
const { syncYesterday, formatSyncResult } = require("./sync");
const { loadCampaignInsights, formatDigestReport, splitTelegram } = require("./adsReport");

function notifyChatId() {
  return config.adminChatId;
}

async function checkAndNotify(bot) {
  const chatId = notifyChatId();
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

async function sendAdsDigest(bot) {
  const chatId = notifyChatId();
  if (!config.metaAccessToken) {
    console.warn("Bỏ qua báo cáo ads: chưa có META_ACCESS_TOKEN");
    return;
  }
  if (!chatId) {
    console.warn("Bỏ qua báo cáo ads: chưa có TELEGRAM_ADMIN_CHAT_ID");
    return;
  }
  const range = resolveDateRange("today");
  const result = await loadCampaignInsights({
    since: range.since,
    until: range.until,
  });
  const text = formatDigestReport(result, range);
  for (const chunk of splitTelegram(text)) {
    await bot.sendMessage(chatId, chunk);
  }
}

async function syncAdsAndNotify(bot) {
  const chatId = notifyChatId();
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

function startCron(bot) {
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
        const chatId = notifyChatId();
        if (chatId) {
          await bot.sendMessage(chatId, `Lỗi kéo số Facebook Ads: ${err.message || err}`).catch(() => {});
        }
      }
    },
    { timezone: config.timezone }
  );
  console.log(`Cron sync ads: 15 7 * * * (${config.timezone})`);

  const reportHours = [8, 12, 16, 20, 23];
  cron.schedule(
    `0 ${reportHours.join(",")} * * *`,
    async () => {
      try {
        await sendAdsDigest(bot);
      } catch (err) {
        console.error("Lỗi cron báo cáo ads:", err);
        const chatId = notifyChatId();
        if (chatId) {
          await bot.sendMessage(chatId, `Lỗi báo cáo Facebook Ads: ${err.message || err}`).catch(() => {});
        }
      }
    },
    { timezone: config.timezone }
  );
  console.log(`Cron báo cáo ads: 00 ${reportHours.join(",")}h (${config.timezone})`);
}

module.exports = { startCron, checkAndNotify, syncAdsAndNotify, sendAdsDigest };
