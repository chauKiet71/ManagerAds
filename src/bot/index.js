const config = require("../config");
const sheets = require("../sheets");
const tg = require("../telegram");
const { customerFilterKeyboard, listActionKeyboard, mainKeyboard, feeListKeyboard } = require("./keyboards");
const { formatCustomerList, formatBudgetList, formatFeeList, helpText } = require("./format");
const forms = require("./forms");

function isCmd(text, name) {
  if (!text) return false;
  const [cmd] = text.trim().split(/\s+/);
  return cmd === `/${name}` || cmd.startsWith(`/${name}@`);
}

function assertAdmin(ctx) {
  if (!config.adminChatId) return true;
  const uid = String(ctx.from?.id || "");
  const cid = String(ctx.chatId || "");
  return uid === String(config.adminChatId).trim() || cid === String(config.adminChatId).trim();
}

async function handleUpdate(update) {
  const ctx = tg.makeCtx(update);
  const text = update.message?.text || "";
  const isStart = text.startsWith("/start");

  if (!assertAdmin(ctx) && !isStart) {
    console.log(
      "Từ chối quyền. ID của bạn:",
      ctx.from?.id,
      "| .env TELEGRAM_ADMIN_CHAT_ID =",
      config.adminChatId
    );
    const msg =
      "Bạn không có quyền sử dụng bot này.\n\n" +
      `Chat ID của bạn: ${ctx.from?.id}\n` +
      "Copy số này vào TELEGRAM_ADMIN_CHAT_ID trong file .env rồi chạy lại bot.\n" +
      "(Không dùng số 'Nhận update' trên terminal.)";
    if (update.callback_query) await ctx.answerCbQuery("Không có quyền").catch(() => {});
    else await ctx.reply(msg);
    return;
  }

  if (update.callback_query) return dispatchCallback(ctx);
  if (update.message?.text) return dispatchText(ctx);
}

async function showCustomers(ctx, status) {
  try {
    const list = await sheets.listCustomers(status);
    await ctx.reply(formatCustomerList(list, status), mainKeyboard);
  } catch (err) {
    console.error(err);
    await ctx.reply("Không đọc được Google Sheet.");
  }
}

async function dispatchText(ctx) {
  const text = (ctx.message?.text || "").trim();
  console.log("TEXT:", JSON.stringify(text), "form:", ctx.session?.form?.type, ctx.session?.form?.step);

  if (isCmd(text, "huy") || text.toLowerCase() === "hủy") {
    if (forms.getForm(ctx)) return forms.cancelForm(ctx);
    return ctx.reply("Không có thao tác nào đang mở.", mainKeyboard);
  }

  if (forms.getForm(ctx) && !text.startsWith("/")) {
    return forms.handleFormText(ctx);
  }

  if (isCmd(text, "start")) {
    forms.clearForm(ctx);
    return ctx.reply(
      [
        "Xin chào. Đây là bot quản lý khách hàng ads.",
        "",
        `Chat ID của bạn: ${ctx.from.id}`,
        "Gán ID này vào TELEGRAM_ADMIN_CHAT_ID trong .env rồi chạy lại bot.",
        "",
        helpText().replace(/<[^>]+>/g, ""),
      ].join("\n"),
      mainKeyboard
    );
  }

  if (isCmd(text, "help") || isCmd(text, "menu")) {
    return ctx.reply(helpText(), { parse_mode: "HTML", ...mainKeyboard });
  }

  if (isCmd(text, "add_khach_hang") || text === "➕ Thêm khách hàng") {
    return forms.startAddCustomer(ctx);
  }
  if (isCmd(text, "them_ngan_sach")) return forms.startAddBudget(ctx);
  if (isCmd(text, "them_thu_phi")) return forms.startAddFee(ctx);
  if (isCmd(text, "sua_thu_phi")) return forms.startEditFee(ctx);
  if (isCmd(text, "doi_trang_thai")) return forms.startChangeStatus(ctx);

  if (isCmd(text, "khach_hang") || text === "👥 Khách hàng") {
    forms.clearForm(ctx);
    return ctx.reply("Chọn danh sách khách hàng:", customerFilterKeyboard);
  }
  if (isCmd(text, "dang_trien_khai")) return showCustomers(ctx, sheets.STATUS.ACTIVE);
  if (isCmd(text, "tam_ngung")) return showCustomers(ctx, sheets.STATUS.PAUSED);

  if (isCmd(text, "ngan_sach") || text === "💰 Ngân sách") {
    forms.clearForm(ctx);
    try {
      const list = await sheets.listBudgets();
      return ctx.reply(formatBudgetList(list), listActionKeyboard("go:add-budget"));
    } catch (err) {
      console.error(err);
      return ctx.reply("Không đọc được Google Sheet.");
    }
  }
  if (isCmd(text, "thu_phi_dv") || text === "🧾 Thu phí DV") {
    forms.clearForm(ctx);
    try {
      const list = await sheets.listFees();
      return ctx.reply(formatFeeList(list), feeListKeyboard(list));
    } catch (err) {
      console.error(err);
      return ctx.reply("Không đọc được Google Sheet.");
    }
  }

  if (text.startsWith("/")) {
    return ctx.reply("Không rõ lệnh. Gửi /help", mainKeyboard);
  }
  return ctx.reply("Dùng nút menu bên dưới hoặc /add_khach_hang.", mainKeyboard);
}

async function dispatchCallback(ctx) {
  const data = ctx.callbackQuery?.data || "";
  console.log("CALLBACK:", data);
  if (await forms.handleFormAction(ctx)) return;
  await ctx.answerCbQuery().catch(() => {});
  if (data === "kh:active") return showCustomers(ctx, sheets.STATUS.ACTIVE);
  if (data === "kh:paused") return showCustomers(ctx, sheets.STATUS.PAUSED);
  if (data === "kh:all") return showCustomers(ctx);
  if (data === "go:add-budget") return forms.startAddBudget(ctx);
  if (data === "go:add-fee") return forms.startAddFee(ctx);
  if (data === "go:edit-fee") return forms.startEditFee(ctx);
}

async function runPolling() {
  await tg.deleteWebhook();
  const me = await tg.getMe();
  console.log(`Bot @${me.username} sẵn sàng`);
  await tg.setMyCommands([
    { command: "add_khach_hang", description: "Thêm khách hàng" },
    { command: "khach_hang", description: "Danh sách khách hàng" },
    { command: "dang_trien_khai", description: "KH đang triển khai" },
    { command: "tam_ngung", description: "KH tạm ngưng" },
    { command: "ngan_sach", description: "Ngân sách" },
    { command: "them_ngan_sach", description: "Thêm ngân sách" },
    { command: "thu_phi_dv", description: "Thu phí dịch vụ" },
    { command: "them_thu_phi", description: "Thêm thu phí DV" },
    { command: "sua_thu_phi", description: "Sửa thu phí DV" },
    { command: "doi_trang_thai", description: "Đổi trạng thái KH" },
    { command: "huy", description: "Hủy thao tác" },
  ]);

  let offset = 0;
  console.log("Polling đã bật, chờ tin nhắn...");
  for (;;) {
    try {
      const updates = await tg.getUpdates(offset);
      console.log("getUpdates trả về", updates.length, "tin");
      for (const update of updates) {
        offset = update.update_id + 1;
        const preview = update.message?.text || update.callback_query?.data || "";
        console.log("Nhận update", update.update_id, preview);
        try {
          await handleUpdate(update);
          console.log("Xong update", update.update_id);
        } catch (err) {
          console.error("Lỗi xử lý update", update.update_id, err);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("getUpdates timeout, gọi lại...");
        continue;
      }
      console.error("Lỗi getUpdates:", err.message || err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

module.exports = { runPolling, sendMessage: tg.sendMessage };
