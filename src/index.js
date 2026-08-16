const http = require("http");
const sheets = require("./sheets");
const config = require("./config");
const { runPolling, sendMessage } = require("./bot");
const { startCron, checkAndNotify } = require("./cron");

function startHealthServer() {
  if (!config.port) return;
  http
    .createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("bot-manager-ads ok");
    })
    .listen(config.port, "0.0.0.0", () => {
      console.log("Health server PORT", config.port);
    });
}

async function main() {
  startHealthServer();

  console.log("Kết nối Google Sheet...");
  try {
    await sheets.init();
  } catch (err) {
    console.error("Không kết nối được Google Sheet.");
    console.error("- Kiểm tra GOOGLE_SHEET_ID");
    console.error("- Share sheet cho email service account (quyền Editor)");
    console.error("- Bật Google Sheets API trên Google Cloud");
    console.error(err.message || err);
    process.exit(1);
  }
  console.log("Google Sheet OK:", config.sheetId);

  const bot = { sendMessage };
  await startCron(bot);
  checkAndNotify(bot).catch((err) => {
    console.error("Kiểm tra thông báo lúc khởi động thất bại:", err);
  });

  process.once("SIGINT", () => process.exit(0));
  process.once("SIGTERM", () => process.exit(0));

  await runPolling();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
