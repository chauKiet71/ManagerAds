require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}. Xem README (Railway / .env)`);
  }
  return value;
}

function loadGoogleCredentials() {
  const jsonRaw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (jsonRaw) {
    const json = JSON.parse(jsonRaw);
    return { email: json.client_email, key: json.private_key };
  }

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (credPath) {
    const path = require("path");
    const fs = require("fs");
    const abs = path.resolve(process.cwd(), credPath);
    const json = JSON.parse(fs.readFileSync(abs, "utf8"));
    return {
      email: json.client_email,
      key: json.private_key,
    };
  }

  return {
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

const google = loadGoogleCredentials();

module.exports = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || "",
  sheetId: required("GOOGLE_SHEET_ID"),
  googleEmail: google.email,
  googleKey: google.key,
  notifyHour: Number(process.env.NOTIFY_HOUR || 8),
  timezone: process.env.TZ || "Asia/Ho_Chi_Minh",
  port: process.env.PORT ? Number(process.env.PORT) : 0,
  metaAccessToken: process.env.META_ACCESS_TOKEN || "",
  metaApiVersion: process.env.META_API_VERSION || "v21.0",
  adsReportHours: process.env.ADS_REPORT_HOURS || "8,12,16,20,23",
};
