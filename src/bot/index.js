const config = require("../config");
const sheets = require("../sheets");
const tg = require("../telegram");
const {
  customerFilterKeyboard,
  mainKeyboard,
  listActionKeyboard,
  budgetListKeyboard,
  budgetDeletePickKeyboard,
  confirmDeleteBudgetKeyboard,
  feeListKeyboard,
  campaignListKeyboard,
  dateRangeKeyboard,
  reportTimesKeyboard,
  customerListActionsKeyboard,
  customerManagePickKeyboard,
  confirmDeleteCustomerKeyboard,
  adAccountCustomerKeyboard,
  adAccountActionsKeyboard,
  adAccountManagePickKeyboard,
  confirmDeleteAdAccountKeyboard,
} = require("./keyboards");
const {
  formatCustomerList,
  formatBudgetList,
  formatFeeList,
  formatAdAccountList,
  helpText,
} = require("./format");
const forms = require("./forms");
const { syncYesterday, formatSyncResult } = require("../sync");
const { replyInsights, loadCampaignInsights, formatDigestReport, splitTelegram } = require("../adsReport");
const { resolveDateRange, formatReportTimes } = require("../utils");
const { rememberReportTimes, describeNextReport } = require("../cron");
const {
  parseUidList,
  startRealtimeUidWatch,
  stopRealtimeUidWatch,
  configureUidMonitor,
} = require("../uidMonitor");

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

async function showReportTimes(ctx) {
  forms.clearForm(ctx);
  try {
    const times = await sheets.getReportTimes();
    rememberReportTimes(times, ctx.chatId || ctx.from?.id);
    return ctx.reply(
      [
        "Giờ tự gửi chỉ số chiến dịch (giờ VN)",
        "",
        times.length ? formatReportTimes(times) : "Đang tắt — không gửi tự động.",
        times.length ? describeNextReport(times) : "",
        "",
        "Đổi giờ bằng /dat_gio_bao_cao. Gửi ngay bằng /gui_bao_cao.",
      ]
        .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
        .join("\n"),
      reportTimesKeyboard()
    );
  } catch (err) {
    console.error(err);
    return ctx.reply("Không đọc được Google Sheet.");
  }
}

async function sendDigestNow(ctx) {
  forms.clearForm(ctx);
  await ctx.reply("Đang kéo chỉ số Facebook Ads hôm nay...");
  try {
    const range = resolveDateRange("today");
    const result = await loadCampaignInsights({
      since: range.since,
      until: range.until,
    });
    const text = formatDigestReport(result, range);
    const chunks = splitTelegram(text);
    for (const chunk of chunks) await ctx.reply(chunk);
  } catch (err) {
    console.error("Lỗi /gui_bao_cao:", err);
    await ctx.reply(`Không gửi được báo cáo: ${err.message || err}`);
  }
}

async function runAdsSync(ctx) {
  forms.clearForm(ctx);
  await ctx.reply("Đang kéo số Facebook Ads hôm qua...");
  try {
    const result = await syncYesterday();
    return ctx.reply(formatSyncResult(result), mainKeyboard);
  } catch (err) {
    console.error("Lỗi /dong_bo_ads:", err);
    return ctx.reply(`Không đồng bộ được: ${err.message || err}`, mainKeyboard);
  }
}

function parseCheckUidFilePayload(text) {
  const body = (text || "").replace(/^\/check_uid_file\b\s*/i, "").trim();
  const headerMatch = body.match(/^(?:times?|schedule)\s*[:=]\s*([^\n\r]+)\s*\r?\n?([\s\S]*)$/i);
  if (!headerMatch) {
    return { scheduleText: null, uidText: body };
  }
  const direct = headerMatch[2];
  const scheduleText = String(headerMatch[1] || "").trim();
  const firstLineOnly = /[\n\r]/.test(body) === false;
  if (firstLineOnly && direct === "") {
    const parts = scheduleText.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return {
        scheduleText: parts[0],
        uidText: parts.slice(1).join(" "),
      };
    }
  }
  return {
    scheduleText: headerMatch[1].trim(),
    uidText: (headerMatch[2] || "").trim(),
  };
}

async function handleCheckUid(ctx, suppliedUid = null) {
  const rawUid = suppliedUid === null
    ? (ctx.message?.text || "").replace(/^\/check_uid\b\s*/i, "").trim()
    : String(suppliedUid || "").trim();
  const stopMatch = rawUid.match(/^(?:off|stop|tat|tắt)(?:\s+(.+))?$/i);
  if (stopMatch) {
    try {
      const stopUids = parseUidList(stopMatch[1] || "");
      const removed = await stopRealtimeUidWatch(stopUids[0] || "");
      if (stopUids.length) {
        return ctx.reply(
          removed
            ? `Đã dừng theo dõi realtime UID ${stopUids[0]}.`
            : `UID ${stopUids[0]} không nằm trong danh sách realtime.`
        );
      }
      return ctx.reply(`Đã dừng toàn bộ ${removed} UID realtime.`);
    } catch (err) {
      return ctx.reply(`Không dừng được monitor realtime: ${err.message || err}`);
    }
  }

  const uidList = parseUidList(rawUid);
  if (!uidList.length) {
    ctx.session.awaitingCheckUid = true;
    return ctx.reply("Gửi UID Facebook cần kiểm tra:");
  }

  ctx.session.awaitingCheckUid = false;
  await ctx.reply(`Đang kiểm tra UID ${uidList[0]}...`);
  try {
    const result = await startRealtimeUidWatch(uidList[0], ctx.chatId);
    if (result.error || !result.status) {
      return ctx.reply(`UID ${uidList[0]}: lỗi kiểm tra (${result.error || "Không xác định được trạng thái"})`);
    }
    return ctx.reply(
      `UID ${result.uid}: ${result.status.toUpperCase()}\n` +
        `Đã bật theo dõi realtime mỗi ${result.intervalSeconds} giây; bot sẽ báo khi LIVE ↔ DIE.`
    );
  } catch (err) {
    console.error("Lỗi /check_uid:", err);
    return ctx.reply(`Kiểm tra UID thất bại: ${err.message || err}`);
  }
}

async function handleCheckUidFile(ctx) {
  const { scheduleText, uidText } = parseCheckUidFilePayload(ctx.message?.text || "");
  if (!scheduleText) {
    return ctx.reply(
      "Nhập lịch và danh sách UID theo mẫu:\n/check_uid_file\ntimes: 12:00,14:33,19:23\n123456789\n987654321"
    );
  }

  const uidList = parseUidList(uidText);
  try {
    const monitor = await configureUidMonitor(scheduleText, uidList);
    if (monitor.disabled) {
      return ctx.reply("Đã tắt lịch tự động check UID.");
    }
    return ctx.reply(
      [
        "Đã lưu cấu hình tự động check UID.",
        `Khung giờ: ${monitor.times.join(", ")}`,
        `Danh sách: ${monitor.uids.length} UID`,
        "Bot sẽ kiểm tra vào mốc giờ tiếp theo; không kiểm tra ngay khi nhận lệnh.",
      ].join("\n")
    );
  } catch (err) {
    console.error("Lỗi lưu cấu hình /check_uid_file:", err);
    return ctx.reply(`Không lưu được cấu hình check UID: ${err.message || err}`);
  }
}

async function showCampaignMenu(ctx) {
  try {
    const customers = await sheets.listCustomers();
    ctx.session.campaignCustomers = customers;
    await ctx.reply(
      "Chọn khách hàng để xem thông số chiến dịch:",
      campaignListKeyboard(customers)
    );
  } catch (err) {
    console.error(err);
    await ctx.reply("Không đọc được Google Sheet.");
  }
}

function askDateRange(ctx, customer) {
  if (!ctx.session) ctx.session = {};
  ctx.session.adsView = { customer: customer || "" };
  const who = customer ? `khách "${customer}"` : "tất cả khách đã gán Ad Account";
  return ctx.reply(
    `Chọn khoảng thời gian (giờ TP. Hồ Chí Minh) — ${who}:`,
    dateRangeKeyboard()
  );
}

async function showCampaigns(ctx, customer) {
  return askDateRange(ctx, customer);
}

async function showCustomers(ctx, status) {
  try {
    const list = await sheets.listCustomers(status);
    const statusKey = status === sheets.STATUS.ACTIVE ? "active" : status === sheets.STATUS.PAUSED ? "paused" : "all";
    ctx.session.customerList = { status, statusKey, items: list };
    await ctx.reply(formatCustomerList(list, status), customerListActionsKeyboard(statusKey));
  } catch (err) {
    console.error(err);
    await ctx.reply("Không đọc được Google Sheet.");
  }
}

async function showAdAccountCustomers(ctx) {
  try {
    const customers = await sheets.listCustomers();
    if (!customers.length) return ctx.reply("Chưa có khách hàng. Hãy thêm khách hàng trước.", mainKeyboard);
    ctx.session.tkqcCustomers = customers;
    return ctx.reply("Chọn khách hàng để xem danh sách TKQC:", adAccountCustomerKeyboard(customers));
  } catch (err) {
    console.error("Lỗi đọc khách hàng cho DS TKQC:", err);
    return ctx.reply("Không đọc được danh sách khách hàng.");
  }
}

async function showAdAccounts(ctx, customer) {
  try {
    const accounts = await sheets.listAdAccounts(customer);
    ctx.session.tkqcView = { customer, accounts };
    return ctx.reply(formatAdAccountList(accounts, customer), adAccountActionsKeyboard());
  } catch (err) {
    console.error("Lỗi đọc DS TKQC:", err);
    return ctx.reply("Không đọc được danh sách tài khoản quảng cáo.");
  }
}

async function showBudgets(ctx) {
  try {
    const list = await sheets.listBudgets();
    ctx.session.budgetList = list;
    return ctx.reply(formatBudgetList(list), budgetListKeyboard(list));
  } catch (err) {
    console.error("Lỗi đọc danh sách ngân sách:", err);
    return ctx.reply("Không đọc được Google Sheet.");
  }
}

async function dispatchText(ctx) {
  const text = (ctx.message?.text || "").trim();
  console.log("TEXT:", JSON.stringify(text), "form:", ctx.session?.form?.type, ctx.session?.form?.step);

  if (isCmd(text, "huy") || text.toLowerCase() === "hủy") {
    if (forms.getForm(ctx)) return forms.cancelForm(ctx);
    if (ctx.session.awaitingCheckUid) {
      ctx.session.awaitingCheckUid = false;
      return ctx.reply("Đã hủy nhập UID.", mainKeyboard);
    }
    return ctx.reply("Không có thao tác nào đang mở.", mainKeyboard);
  }

  if (ctx.session.awaitingCheckUid && !text.startsWith("/")) {
    return handleCheckUid(ctx, text);
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

  if (isCmd(text, "check_uid_file")) return handleCheckUidFile(ctx);
  if (isCmd(text, "check_uid")) return handleCheckUid(ctx);

  if (isCmd(text, "add_khach_hang") || text === "➕ Thêm khách hàng") {
    return forms.startAddCustomer(ctx);
  }
  if (isCmd(text, "them_ngan_sach")) return forms.startAddBudget(ctx);
  if (isCmd(text, "sua_ngan_sach")) return forms.startEditBudget(ctx);
  if (isCmd(text, "them_thu_phi")) return forms.startAddFee(ctx);
  if (isCmd(text, "sua_thu_phi")) return forms.startEditFee(ctx);
  if (isCmd(text, "doi_trang_thai")) return forms.startChangeStatus(ctx);
  if (isCmd(text, "them_chien_dich")) return forms.startAddCampaign(ctx);
  if (isCmd(text, "sua_chien_dich")) return forms.startEditCampaign(ctx);
  if (isCmd(text, "gan_ad_account")) return forms.startLinkAdAccount(ctx);
  if (isCmd(text, "dong_bo_ads")) return runAdsSync(ctx);
  if (isCmd(text, "gio_bao_cao")) return showReportTimes(ctx);
  if (isCmd(text, "dat_gio_bao_cao")) return forms.startSetReportTimes(ctx);
  if (isCmd(text, "gui_bao_cao")) return sendDigestNow(ctx);

  if (isCmd(text, "danh_sach_khach_hang") || isCmd(text, "khach_hang") || text === "👥 Khách hàng") {
    forms.clearForm(ctx);
    return ctx.reply("Chọn danh sách khách hàng:", customerFilterKeyboard);
  }
  if (isCmd(text, "dang_trien_khai")) return showCustomers(ctx, sheets.STATUS.ACTIVE);
  if (isCmd(text, "tam_ngung")) return showCustomers(ctx, sheets.STATUS.PAUSED);

  if (isCmd(text, "ds_tkqc") || text === "📋 DS TKQC") {
    forms.clearForm(ctx);
    return showAdAccountCustomers(ctx);
  }

  if (isCmd(text, "ngan_sach") || text === "💰 Ngân sách") {
    forms.clearForm(ctx);
    return showBudgets(ctx);
  }
  if (isCmd(text, "chien_dich") || text === "📊 Chiến dịch") {
    forms.clearForm(ctx);
    return showCampaignMenu(ctx);
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
  if (data === "kh:menu") {
    forms.clearForm(ctx);
    return ctx.reply("Chọn danh sách khách hàng:", customerFilterKeyboard);
  }
  if (data.startsWith("khact:")) {
    const [, action, statusKey] = data.split(":");
    const status = statusKey === "active" ? sheets.STATUS.ACTIVE : statusKey === "paused" ? sheets.STATUS.PAUSED : undefined;
    if (action === "add") return forms.startAddCustomer(ctx, { status });
    try {
      const items = await sheets.listCustomers(status);
      if (!items.length) return ctx.reply("Danh sách này chưa có khách hàng.");
      ctx.session.customerManage = { action, status, statusKey, items };
      return ctx.reply(
        action === "delete" ? "Chọn khách hàng cần xóa:" : "Chọn khách hàng cần cập nhật trạng thái:",
        customerManagePickKeyboard(items, action, statusKey)
      );
    } catch (err) {
      console.error("Lỗi mở thao tác khách hàng:", err);
      return ctx.reply("Không đọc được danh sách khách hàng.");
    }
  }
  if (data.startsWith("khpick:")) {
    const [, action, statusKey, rawIndex] = data.split(":");
    const state = ctx.session.customerManage;
    const customer = state?.action === action && state?.statusKey === statusKey
      ? state.items[Number(rawIndex)]
      : null;
    if (!customer) return ctx.reply("Danh sách đã thay đổi. Vui lòng mở lại danh sách khách hàng.");
    if (action === "delete") {
      ctx.session.customerDelete = { customer, status: state.status };
      return ctx.reply(`Xác nhận xóa khách hàng "${customer.name}"?`, confirmDeleteCustomerKeyboard());
    }
    if (action === "status") {
      const nextStatus = customer.status === sheets.STATUS.ACTIVE ? sheets.STATUS.PAUSED : sheets.STATUS.ACTIVE;
      try {
        const updated = await sheets.updateCustomerStatus(customer.id, nextStatus);
        if (!updated) return ctx.reply("Không tìm thấy khách hàng.");
        await ctx.reply(`✅ Đã cập nhật "${customer.name}" → ${nextStatus}`);
        return showCustomers(ctx, state.status);
      } catch (err) {
        console.error("Lỗi cập nhật trạng thái khách hàng:", err);
        return ctx.reply("Không cập nhật được trạng thái khách hàng.");
      }
    }
  }
  if (data === "khdelete:no") {
    ctx.session.customerDelete = null;
    return ctx.reply("Đã hủy xóa khách hàng.", customerFilterKeyboard);
  }
  if (data === "khdelete:yes") {
    const selected = ctx.session.customerDelete;
    if (!selected?.customer) return ctx.reply("Phiên xác nhận đã hết. Vui lòng thử lại.");
    try {
      const deleted = await sheets.deleteCustomer(selected.customer.id);
      ctx.session.customerDelete = null;
      if (!deleted) return ctx.reply("Không tìm thấy khách hàng.");
      await ctx.reply(`✅ Đã xóa khách hàng "${deleted.name}".`);
      return showCustomers(ctx, selected.status);
    } catch (err) {
      console.error("Lỗi xóa khách hàng:", err);
      return ctx.reply("Không xóa được khách hàng.");
    }
  }
  if (data === "tkqc:cancel") return ctx.reply("Đã đóng danh sách TKQC.", mainKeyboard);
  if (data === "tkqc:menu") return showAdAccountCustomers(ctx);
  if (data.startsWith("tkqckh:")) {
    const customer = (ctx.session.tkqcCustomers || [])[Number(data.slice(7))];
    if (!customer) return ctx.reply("Danh sách khách hàng đã thay đổi. Vui lòng mở lại DS TKQC.");
    return showAdAccounts(ctx, customer.name);
  }
  if (data === "tkqc:refresh") {
    const customer = ctx.session.tkqcView?.customer;
    return customer ? showAdAccounts(ctx, customer) : showAdAccountCustomers(ctx);
  }
  if (data === "tkqc:add") {
    const customer = ctx.session.tkqcView?.customer;
    if (!customer) return ctx.reply("Vui lòng chọn khách hàng trước.");
    return forms.startAddAdAccountForCustomer(ctx, customer);
  }
  if (data === "tkqc:delete" || data === "tkqc:update") {
    const view = ctx.session.tkqcView;
    if (!view?.customer) return ctx.reply("Vui lòng chọn khách hàng trước.");
    if (!view.accounts?.length) return ctx.reply("Khách hàng này chưa có TKQC để thao tác.");
    const action = data.slice(5);
    return ctx.reply(
      action === "delete" ? "Chọn TKQC cần xóa:" : "Chọn TKQC cần cập nhật:",
      adAccountManagePickKeyboard(view.accounts, action)
    );
  }
  if (data.startsWith("tkqcpick:")) {
    const [, action, rawIndex] = data.split(":");
    const account = (ctx.session.tkqcView?.accounts || [])[Number(rawIndex)];
    if (!account) return ctx.reply("Danh sách TKQC đã thay đổi. Vui lòng tải lại.");
    if (action === "update") return forms.startEditAdAccount(ctx, account);
    if (action === "delete") {
      ctx.session.tkqcDelete = account;
      return ctx.reply(`Xác nhận xóa TKQC act_${account.adAccountId}?`, confirmDeleteAdAccountKeyboard());
    }
  }
  if (data === "tkqcdelete:no") {
    ctx.session.tkqcDelete = null;
    return showAdAccounts(ctx, ctx.session.tkqcView?.customer || "");
  }
  if (data === "tkqcdelete:yes") {
    const account = ctx.session.tkqcDelete;
    if (!account) return ctx.reply("Phiên xác nhận đã hết. Vui lòng thử lại.");
    try {
      const deleted = await sheets.deleteAdAccount(account.id);
      ctx.session.tkqcDelete = null;
      if (!deleted) return ctx.reply("Không tìm thấy TKQC.");
      await ctx.reply(`✅ Đã xóa TKQC act_${deleted.adAccountId}.`);
      return showAdAccounts(ctx, deleted.customer);
    } catch (err) {
      console.error("Lỗi xóa TKQC:", err);
      return ctx.reply("Không xóa được tài khoản quảng cáo.");
    }
  }
  if (data === "go:add-budget") return forms.startAddBudget(ctx);
  if (data === "go:edit-budget") return forms.startEditBudget(ctx);
  if (data === "budget:update") return forms.startEditBudget(ctx);
  if (data === "budget:delete") {
    try {
      const budgets = await sheets.listBudgets();
      if (!budgets.length) return ctx.reply("Chưa có ngân sách để xóa.");
      ctx.session.budgetDeleteList = budgets;
      return ctx.reply("Chọn dòng ngân sách cần xóa:", budgetDeletePickKeyboard(budgets));
    } catch (err) {
      console.error("Lỗi mở danh sách xóa ngân sách:", err);
      return ctx.reply("Không đọc được danh sách ngân sách.");
    }
  }
  if (data.startsWith("budgetpick:delete:")) {
    const budget = (ctx.session.budgetDeleteList || [])[Number(data.slice(18))];
    if (!budget) return ctx.reply("Danh sách ngân sách đã thay đổi. Vui lòng thử lại.");
    ctx.session.budgetDelete = budget;
    return ctx.reply(
      `Xác nhận xóa ngân sách của "${budget.customer}" (${budget.amount || 0})?`,
      confirmDeleteBudgetKeyboard()
    );
  }
  if (data === "budgetdelete:no") {
    ctx.session.budgetDelete = null;
    return showBudgets(ctx);
  }
  if (data === "budgetdelete:yes") {
    const budget = ctx.session.budgetDelete;
    if (!budget) return ctx.reply("Phiên xác nhận đã hết. Vui lòng thử lại.");
    try {
      const deleted = await sheets.deleteBudget(budget.id);
      ctx.session.budgetDelete = null;
      if (!deleted) return ctx.reply("Không tìm thấy dòng ngân sách.");
      await ctx.reply(`✅ Đã xóa ngân sách của "${deleted.customer}".`);
      return showBudgets(ctx);
    } catch (err) {
      console.error("Lỗi xóa ngân sách:", err);
      return ctx.reply("Không xóa được ngân sách.");
    }
  }
  if (data === "go:add-fee") return forms.startAddFee(ctx);
  if (data === "go:edit-fee") return forms.startEditFee(ctx);
  if (data === "go:add-campaign") return forms.startAddCampaign(ctx);
  if (data === "go:edit-campaign") return forms.startEditCampaign(ctx);
  if (data === "go:campaign-menu") return showCampaignMenu(ctx);
  if (data === "go:set-report-times") return forms.startSetReportTimes(ctx);
  if (data === "go:send-digest") return sendDigestNow(ctx);
  if (data === "go:off-report-times") {
    try {
      await sheets.setReportTimes([]);
      rememberReportTimes([]);
      return ctx.reply("Đã tắt gửi chỉ số tự động. /dat_gio_bao_cao để bật lại.", mainKeyboard);
    } catch (err) {
      return ctx.reply("Không lưu được cài đặt.");
    }
  }
  if (data === "go:ads-range") {
    const customer = ctx.session?.adsView?.customer || "";
    return askDateRange(ctx, customer);
  }
  if (data === "cview:all") return showCampaigns(ctx);
  if (data.startsWith("cview:")) {
    const customers = ctx.session.campaignCustomers || (await sheets.listCustomers());
    const customer = customers[Number(data.slice(6))];
    if (!customer) return ctx.reply("Không tìm thấy khách hàng.");
    return showCampaigns(ctx, customer.name);
  }
  if (data === "dr:custom") return forms.startCustomAdsRange(ctx);
  if (data.startsWith("dr:")) {
    const rangeKey = data.slice(3);
    const customer = ctx.session?.adsView?.customer || "";
    try {
      return await replyInsights(ctx, { customer, rangeKey });
    } catch (err) {
      console.error("Lỗi xem ads:", err);
      return ctx.reply(`Không kéo được số: ${err.message || err}`);
    }
  }
}

async function runPolling() {
  await tg.deleteWebhook();
  const me = await tg.getMe();
  console.log(`Bot @${me.username} sẵn sàng`);
  await tg.setMyCommands([
    { command: "add_khach_hang", description: "Thêm khách hàng" },
    { command: "khach_hang", description: "Danh sách khách hàng" },
    { command: "danh_sach_khach_hang", description: "Danh sách và quản lý khách hàng" },
    { command: "dang_trien_khai", description: "KH đang triển khai" },
    { command: "tam_ngung", description: "KH tạm ngưng" },
    { command: "ngan_sach", description: "Ngân sách" },
    { command: "them_ngan_sach", description: "Thêm ngân sách" },
    { command: "sua_ngan_sach", description: "Sửa ngân sách" },
    { command: "thu_phi_dv", description: "Thu phí dịch vụ" },
    { command: "them_thu_phi", description: "Thêm thu phí DV" },
    { command: "sua_thu_phi", description: "Sửa thu phí DV" },
    { command: "doi_trang_thai", description: "Đổi trạng thái KH" },
    { command: "chien_dich", description: "Xem thông số chiến dịch" },
    { command: "them_chien_dich", description: "Nhập thông số chiến dịch" },
    { command: "sua_chien_dich", description: "Sửa thông số chiến dịch" },
    { command: "gan_ad_account", description: "Gán Ad Account Facebook" },
    { command: "ds_tkqc", description: "Danh sách và quản lý TKQC" },
    { command: "dong_bo_ads", description: "Kéo số Facebook Ads hôm qua" },
    { command: "gio_bao_cao", description: "Xem giờ gửi chỉ số ads" },
    { command: "dat_gio_bao_cao", description: "Đặt giờ gửi chỉ số ads" },
    { command: "gui_bao_cao", description: "Gửi chỉ số hôm nay ngay" },
    { command: "check_uid", description: "Check realtime 1 UID Facebook" },
    {
      command: "check_uid_file",
      description: "Check danh sách UID từ tin nhắn",
    },
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
