const sheets = require("../sheets");
const meta = require("../meta");
const {
  todayStr,
  normalizeDate,
  parseDate,
  toIsoDate,
  parseMoney,
  escapeHtml,
  formatMoney,
  parseReportTimes,
  formatReportTimes,
  nowClock,
} = require("../utils");
const { replyInsights } = require("../adsReport");
const { rememberReportTimes } = require("../cron");
const {
  statusKeyboard,
  customerPickKeyboard,
  mainKeyboard,
  feePickKeyboard,
  budgetPickKeyboard,
  platformKeyboard,
  campaignPickKeyboard,
  adAccountChoiceKeyboard,
} = require("./keyboards");

const STATUS_FROM_CB = {
  active: sheets.STATUS.ACTIVE,
  paused: sheets.STATUS.PAUSED,
};

function isCancelText(text) {
  return /^\/huy\b/i.test(text || "") || String(text).trim().toLowerCase() === "hủy";
}

function getForm(ctx) {
  return ctx.session?.form || null;
}

function setForm(ctx, form) {
  if (!ctx.session) ctx.session = {};
  ctx.session.form = form;
}

function clearForm(ctx) {
  if (ctx.session) ctx.session.form = null;
}

async function cancelForm(ctx) {
  clearForm(ctx);
  await ctx.reply("Đã hủy thao tác.", mainKeyboard);
}

async function withSheet(ctx, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    console.error("Google Sheet error:", err);
    clearForm(ctx);
    await ctx.reply(
      "Không kết nối được Google Sheet. Kiểm tra credentials.json, GOOGLE_SHEET_ID và quyền Editor.",
      mainKeyboard
    );
    return { ok: false, value: null };
  }
}

async function startAddCustomer(ctx, { status = "" } = {}) {
  try {
    setForm(ctx, { type: "add-customer", step: "name", data: { status } });
    console.log("Bắt đầu thêm KH, form =", ctx.session.form);
    await ctx.reply(
      "Thêm khách hàng\n\nNhập tên khách hàng:\n\nGửi /huy để hủy."
    );
    console.log("Đã gửi câu hỏi tên khách hàng");
  } catch (err) {
    console.error("Lỗi startAddCustomer:", err);
    await ctx.reply("Lỗi khi bắt đầu thêm khách hàng: " + (err.message || err));
  }
}

async function startAddBudget(ctx) {
  setForm(ctx, { type: "add-budget", step: "pick", data: {} });
  return askPick(ctx, "Thêm ngân sách");
}

function budgetSummary(b) {
  return [
    `Khách hàng: ${b.customer}`,
    `Ngân sách: ${b.amount ? formatMoney(b.amount) : "—"}`,
    `Ngày chuyển khoản: ${b.transferDate || "—"}`,
    `Ngày hết ngân sách: ${b.expireDate || "—"}`,
  ].join("\n");
}

async function startEditBudget(ctx) {
  const result = await withSheet(ctx, () => sheets.listBudgets());
  if (!result.ok) return;
  if (!result.value.length) {
    clearForm(ctx);
    await ctx.reply("Chưa có ngân sách. Dùng /them_ngan_sach trước.", mainKeyboard);
    return;
  }
  setForm(ctx, { type: "edit-budget", step: "pick", data: {}, budgets: result.value });
  await ctx.reply(
    "Sửa ngân sách\n\nChọn dòng cần sửa:\n\nGửi /huy để hủy.",
    budgetPickKeyboard(result.value)
  );
}

async function beginEditBudget(ctx, budget) {
  const form = getForm(ctx);
  form.data = {
    id: budget.id,
    customer: budget.customer,
    amount: budget.amount,
    transferDate: budget.transferDate,
    expireDate: budget.expireDate,
  };
  form.step = "amount";
  await ctx.reply(
    [
      "Đang sửa ngân sách",
      budgetSummary(budget),
      "",
      "Nhập <b>ngân sách mới</b> (ví dụ 500000)",
      "Hoặc gửi <b>giu</b> để giữ nguyên số tiền.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
}

async function startAddFee(ctx) {
  setForm(ctx, { type: "add-fee", step: "pick", data: {} });
  return askPick(ctx, "Thêm thu phí DV");
}

function isKeep(text) {
  const t = String(text || "").trim().toLowerCase();
  return t === "giu" || t === "giữ" || t === "-" || t === ".";
}

function feeSummary(fee) {
  return [
    `Khách hàng: ${fee.customer}`,
    `Phí dịch vụ: ${fee.amount ? formatMoney(fee.amount) : "—"}`,
    `Ngày thu phí: ${fee.feeDate || "—"}`,
  ].join("\n");
}

async function startEditFee(ctx) {
  const result = await withSheet(ctx, () => sheets.listFees());
  if (!result.ok) return;
  if (!result.value.length) {
    clearForm(ctx);
    await ctx.reply("Chưa có dữ liệu thu phí. Dùng /them_thu_phi trước.", mainKeyboard);
    return;
  }
  setForm(ctx, { type: "edit-fee", step: "pick", data: {}, fees: result.value });
  await ctx.reply(
    "Sửa thu phí dịch vụ\n\nChọn khách hàng:\n\nGửi /huy để hủy.",
    feePickKeyboard(result.value)
  );
}

async function beginEditFee(ctx, fee) {
  const form = getForm(ctx);
  form.data = {
    customer: fee.customer,
    amount: fee.amount,
    feeDate: fee.feeDate,
  };
  form.step = "amount";
  await ctx.reply(
    [
      "Đang sửa thu phí DV",
      feeSummary(fee),
      "",
      "Nhập <b>phí dịch vụ mới</b> (ví dụ 500000)",
      'Hoặc gửi <b>giu</b> để giữ nguyên số tiền.',
    ].join("\n"),
    { parse_mode: "HTML" }
  );
}

function parseCount(str) {
  const n = Number(String(str).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function startAddCampaign(ctx) {
  setForm(ctx, { type: "add-campaign", step: "pick", data: {} });
  return askPick(ctx, "Nhập thông số chiến dịch");
}

async function startEditCampaign(ctx) {
  const result = await withSheet(ctx, () => sheets.listCampaigns());
  if (!result.ok) return;
  if (!result.value.length) {
    clearForm(ctx);
    await ctx.reply("Chưa có chiến dịch. Dùng /them_chien_dich trước.", mainKeyboard);
    return;
  }
  setForm(ctx, { type: "edit-campaign", step: "pick", data: {}, campaigns: result.value });
  await ctx.reply(
    "Sửa chiến dịch\n\nChọn chiến dịch:\n\nGửi /huy để hủy.",
    campaignPickKeyboard(result.value)
  );
}

function askCampaignName(ctx, prefix) {
  return ctx.reply(
    `${prefix}\n\nNhập <b>tên chiến dịch</b>:\nHoặc gửi <b>giu</b> nếu đang sửa và muốn giữ nguyên.`,
    { parse_mode: "HTML" }
  );
}

async function startChangeStatus(ctx) {
  setForm(ctx, { type: "change-status", step: "pick", data: {} });
  return askPick(ctx, "Đổi trạng thái");
}

async function startLinkAdAccount(ctx) {
  setForm(ctx, { type: "link-ad-account", step: "pick", data: {} });
  return askPick(ctx, "Gán Ad Account Facebook");
}

async function startSetReportTimes(ctx) {
  const current = await withSheet(ctx, () => sheets.getReportTimes());
  if (!current.ok) return;
  setForm(ctx, { type: "set-report-times", step: "times", data: {} });
  await ctx.reply(
    [
      "Đặt giờ tự gửi chỉ số chiến dịch (giờ VN)",
      "",
      `Hiện tại: <b>${formatReportTimes(current.value)}</b>`,
      "",
      "Nhập các mốc, cách nhau bằng dấu phẩy.",
      "Ví dụ: <code>8, 12, 16:30, 20, 23</code>",
      "Gửi <b>tat</b> để tắt gửi tự động.",
      "",
      "Gửi /huy để hủy.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
}

async function startCustomAdsRange(ctx) {
  const customer = ctx.session?.adsView?.customer || "";
  setForm(ctx, { type: "ads-date-range", step: "from", data: { customer } });
  await ctx.reply(
    [
      "Tùy chọn khoảng ngày (giờ VN)",
      customer ? `Khách hàng: ${customer}` : "Tất cả khách đã gán Ad Account",
      "",
      "Nhập <b>ngày bắt đầu</b> (dd/mm/yyyy)",
      "Hoặc một dòng: <code>15/8/2026 - 20/8/2026</code>",
      "",
      "Gửi /huy để hủy.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
}

async function askPick(ctx, title) {
  const result = await withSheet(ctx, () => sheets.listCustomers());
  if (!result.ok) return;
  if (!result.value.length) {
    clearForm(ctx);
    await ctx.reply("Chưa có khách hàng. Dùng /add_khach_hang trước.", mainKeyboard);
    return;
  }
  getForm(ctx).customers = result.value;
  await ctx.reply(
    `${title}\n\nChọn khách hàng:\n\nGửi /huy để hủy.`,
    customerPickKeyboard(result.value)
  );
}

async function handleFormText(ctx) {
  const form = getForm(ctx);
  if (!form) return false;
  const text = (ctx.message?.text || "").trim();
  if (isCancelText(text)) {
    await cancelForm(ctx);
    return true;
  }
  if (text.startsWith("/")) {
    clearForm(ctx);
    return false;
  }

  if (form.type === "add-customer") return handleAddCustomerText(ctx, form, text);
  if (form.type === "add-budget") return handleAddBudgetText(ctx, form, text);
  if (form.type === "edit-budget") return handleEditBudgetText(ctx, form, text);
  if (form.type === "add-fee") return handleAddFeeText(ctx, form, text);
  if (form.type === "edit-fee") return handleEditFeeText(ctx, form, text);
  if (form.type === "add-campaign") return handleAddCampaignText(ctx, form, text);
  if (form.type === "edit-campaign") return handleEditCampaignText(ctx, form, text);
  if (form.type === "link-ad-account") return handleLinkAdAccountText(ctx, form, text);
  if (form.type === "ads-date-range") return handleAdsDateRangeText(ctx, form, text);
  if (form.type === "set-report-times") return handleSetReportTimesText(ctx, form, text);
  if (form.type === "change-status") {
    await ctx.reply(
      form.step === "pick"
        ? "Vui lòng chọn khách hàng bằng nút bên trên, hoặc /huy."
        : "Vui lòng chọn trạng thái bằng nút bên trên."
    );
    return true;
  }
  return false;
}

async function handleSetReportTimesText(ctx, form, text) {
  const parsed = parseReportTimes(text);
  if (parsed.error) {
    await ctx.reply(parsed.error);
    return true;
  }
  const chatId = ctx.chatId || ctx.from?.id;
  const saved = await withSheet(ctx, async () => {
    await sheets.setReportTimes(parsed.times);
    if (chatId) await sheets.setReportChatId(chatId);
  });
  if (!saved.ok) return true;
  const next = rememberReportTimes(parsed.times, chatId);
  clearForm(ctx);
  if (!parsed.times.length) {
    await ctx.reply("Đã tắt gửi chỉ số tự động. Dùng /dat_gio_bao_cao để bật lại.", mainKeyboard);
    return true;
  }
  const clock = nowClock();
  const lines = [
    "✅ Đã lưu giờ gửi chỉ số (giờ VN)",
    formatReportTimes(parsed.times),
    "",
    `Giờ máy bot (VN): ${clock.label}`,
  ];
  if (next) {
    const secs = Math.max(1, Math.round(next.delayMs / 1000));
    lines.push(
      secs < 60
        ? `Lần gửi tới: ${next.label} (sau ${secs} giây)`
        : `Lần gửi tới: ${next.label} (sau ${Math.round(secs / 60)} phút)`
    );
  }
  await ctx.reply(lines.join("\n"), mainKeyboard);
  return true;
}

function parseDateRangeLine(text) {
  const match = String(text)
    .trim()
    .match(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})\s*[-–]\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})$/);
  if (!match) return null;
  const from = parseDate(match[1]);
  const to = parseDate(match[2]);
  if (!from || !to) return null;
  return { since: toIsoDate(from), until: toIsoDate(to) };
}

async function finishCustomAdsRange(ctx, form, since, until) {
  if (since > until) {
    const tmp = since;
    since = until;
    until = tmp;
  }
  const customer = form.data.customer || ctx.session?.adsView?.customer || "";
  if (!ctx.session) ctx.session = {};
  ctx.session.adsView = { customer };
  clearForm(ctx);
  await replyInsights(ctx, { customer, rangeKey: "custom", custom: { since, until } });
  return true;
}

async function handleAdsDateRangeText(ctx, form, text) {
  const both = parseDateRangeLine(text);
  if (both) return finishCustomAdsRange(ctx, form, both.since, both.until);

  const parsed = parseDate(text);
  if (!parsed) {
    await ctx.reply("Ngày không hợp lệ. Ví dụ: 15/8/2026 hoặc 15/8/2026 - 20/8/2026");
    return true;
  }
  const iso = toIsoDate(parsed);
  if (form.step === "from") {
    form.data.since = iso;
    form.step = "to";
    await ctx.reply("Nhập <b>ngày kết thúc</b> (dd/mm/yyyy):", { parse_mode: "HTML" });
    return true;
  }
  return finishCustomAdsRange(ctx, form, form.data.since, iso);
}

async function handleLinkAdAccountText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn khách hàng bằng nút bên trên, hoặc /huy.");
    return true;
  }
  const adAccountId = meta.normalizeAdAccountId(text);
  if (!adAccountId) {
    await ctx.reply(
      "Ad Account ID không hợp lệ. Dán số từ Ads Manager, ví dụ act_123456789 hoặc 123456789."
    );
    return true;
  }
  const saved = await withSheet(ctx, () =>
    sheets.upsertAdAccount({
      customer: form.data.customer,
      adAccountId,
    })
  );
  if (!saved.ok) return true;
  clearForm(ctx);
  await ctx.reply(
    [
      "✅ Đã gán Ad Account",
      "",
      `Khách hàng: ${saved.value.customer}`,
      `Ad Account ID: act_${saved.value.adAccountId}`,
      "",
      "Dùng /dong_bo_ads để kéo số hôm qua.",
    ].join("\n"),
    mainKeyboard
  );
  return true;
}

async function handleAddCustomerText(ctx, form, text) {
  console.log("Nhận text trong form thêm KH, step =", form.step, "text =", text);
  if (form.step === "name") {
    form.data.name = text;
    form.step = "field";
    await ctx.reply(`Đã nhận tên: <b>${escapeHtml(text)}</b>\n\nNhập <b>lĩnh vực</b>:`, {
      parse_mode: "HTML",
    });
    return true;
  }
  if (form.step === "field") {
    form.data.field = text;
    if (form.data.status) {
      return askCustomerAdAccount(ctx, form);
    }
    form.step = "status";
    await ctx.reply("Chọn <b>trạng thái</b>:", {
      parse_mode: "HTML",
      ...statusKeyboard,
    });
    return true;
  }
  if (form.step === "account") {
    const adAccountId = meta.normalizeAdAccountId(text);
    if (!adAccountId) {
      await ctx.reply("Ad Account ID không hợp lệ. Ví dụ: act_123456789 hoặc 123456789.");
      return true;
    }
    return finishAddCustomer(ctx, form, adAccountId);
  }
  await ctx.reply(
    form.step === "link-account"
      ? "Vui lòng chọn Có hoặc Không bằng nút bên trên, hoặc /huy."
      : "Vui lòng chọn trạng thái bằng nút bên trên, hoặc /huy."
  );
  return true;
}

async function askCustomerAdAccount(ctx, form) {
  form.step = "link-account";
  await ctx.reply("Bạn có muốn gán tài khoản quảng cáo cho khách hàng này không?", adAccountChoiceKeyboard);
  return true;
}

async function finishAddCustomer(ctx, form, adAccountId = "") {
  const result = await withSheet(ctx, async () => {
    const existing = await sheets.findCustomerByName(form.data.name);
    if (existing) return { duplicate: existing };
    const customer = await sheets.addCustomer({
      name: form.data.name,
      field: form.data.field,
      status: form.data.status,
    });
    let linkedAccount = null;
    let linkError = "";
    if (adAccountId) {
      try {
        linkedAccount = await sheets.upsertAdAccount({ customer: customer.name, adAccountId });
      } catch (err) {
        linkError = err.message || String(err);
      }
    }
    return { customer, linkedAccount, linkError };
  });
  if (!result.ok) return true;
  if (result.value.duplicate) {
    clearForm(ctx);
    await ctx.reply(`Khách hàng "${form.data.name}" đã tồn tại.`, mainKeyboard);
    return true;
  }

  const { customer, linkedAccount, linkError } = result.value;
  clearForm(ctx);
  const lines = [
    "✅ Đã thêm khách hàng thành công",
    "",
    `ID: ${customer.id}`,
    `Tên: ${customer.name}`,
    `Lĩnh vực: ${customer.field}`,
    `Trạng thái: ${customer.status}`,
  ];
  if (linkedAccount) lines.push(`Ad Account ID: act_${linkedAccount.adAccountId}`);
  if (linkError) lines.push(`⚠️ Đã thêm khách hàng nhưng chưa gán được Ad Account: ${linkError}`);
  await ctx.reply(lines.join("\n"), mainKeyboard);
  return true;
}

async function handleAddBudgetText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn khách hàng bằng nút bên trên, hoặc /huy.");
    return true;
  }
  if (form.step === "amount") {
    const amount = parseMoney(text);
    if (!amount) {
      await ctx.reply("Ngân sách không hợp lệ. Nhập số, ví dụ: 500000");
      return true;
    }
    form.data.amount = amount;
    form.step = "transfer";
    await ctx.reply(
      `Nhập <b>ngày chuyển khoản</b> (dd/mm/yyyy)\nHoặc gửi "hom nay" — hôm nay là ${todayStr()}`,
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "transfer") {
    const raw = text.toLowerCase();
    const date = raw === "hom nay" || raw === "hôm nay" ? todayStr() : normalizeDate(text);
    if (!date) {
      await ctx.reply("Ngày không hợp lệ. Ví dụ: 16/8/2026 hoặc hom nay");
      return true;
    }
    form.data.transferDate = date;
    form.step = "expire";
    await ctx.reply(
      "Nhập <b>ngày hết ngân sách</b> (dd/mm/yyyy)\nĐến ngày này bot sẽ tự thông báo.",
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "expire") {
    const date = normalizeDate(text);
    if (!date) {
      await ctx.reply("Ngày không hợp lệ. Ví dụ: 20/8/2026");
      return true;
    }
    const created = await withSheet(ctx, () =>
      sheets.addBudget({
        customer: form.data.customer,
        amount: form.data.amount,
        transferDate: form.data.transferDate,
        expireDate: date,
      })
    );
    if (!created.ok) return true;
    clearForm(ctx);
    await ctx.reply(
      [
        "✅ Đã lưu ngân sách vào Google Sheet",
        "",
        `Khách hàng: ${created.value.customer}`,
        `Ngân sách: ${Number(created.value.amount).toLocaleString("vi-VN")} đ`,
        `Ngày chuyển khoản: ${created.value.transferDate}`,
        `Ngày hết ngân sách: ${created.value.expireDate}`,
      ].join("\n"),
      mainKeyboard
    );
    return true;
  }
  return true;
}

function parseBudgetDate(text, fallback) {
  if (isKeep(text)) return fallback || null;
  const raw = String(text || "").trim().toLowerCase();
  if (raw === "hom nay" || raw === "hôm nay") return todayStr();
  return normalizeDate(text);
}

async function handleEditBudgetText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn dòng ngân sách bằng nút bên trên, hoặc /huy.");
    return true;
  }
  if (form.step === "amount") {
    if (isKeep(text)) {
      form.data.amount = parseMoney(String(form.data.amount)) || form.data.amount;
    } else {
      const amount = parseMoney(text);
      if (!amount) {
        await ctx.reply('Ngân sách không hợp lệ. Nhập số, ví dụ 500000 — hoặc gửi "giu" để giữ nguyên.');
        return true;
      }
      form.data.amount = amount;
    }
    form.step = "transfer";
    await ctx.reply(
      [
        `Ngân sách sẽ lưu: <b>${form.data.amount ? formatMoney(form.data.amount) : "—"}</b>`,
        "",
        `Nhập <b>ngày chuyển khoản mới</b> (dd/mm/yyyy), "hom nay", hoặc <b>giu</b>.`,
        `Hiện tại: ${form.data.transferDate || "—"}`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "transfer") {
    const date = parseBudgetDate(text, form.data.transferDate);
    if (!date) {
      await ctx.reply('Ngày không hợp lệ. Ví dụ 16/8/2026, hom nay, hoặc "giu".');
      return true;
    }
    form.data.transferDate = date;
    form.step = "expire";
    await ctx.reply(
      [
        `Ngày chuyển khoản: <b>${date}</b>`,
        "",
        `Nhập <b>ngày hết ngân sách mới</b> (dd/mm/yyyy) hoặc <b>giu</b>.`,
        `Hiện tại: ${form.data.expireDate || "—"}`,
        "Đổi ngày hết thì bot sẽ nhắc lại khi đến hạn.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "expire") {
    const date = parseBudgetDate(text, form.data.expireDate);
    if (!date) {
      await ctx.reply("Ngày không hợp lệ. Ví dụ 20/8/2026 hoặc giu.");
      return true;
    }
    const saved = await withSheet(ctx, () =>
      sheets.updateBudget(form.data.id, {
        amount: form.data.amount,
        transferDate: form.data.transferDate,
        expireDate: date,
      })
    );
    if (!saved.ok) return true;
    if (!saved.value) {
      clearForm(ctx);
      await ctx.reply("Không tìm thấy dòng ngân sách để sửa.", mainKeyboard);
      return true;
    }
    clearForm(ctx);
    await ctx.reply(
      [
        "✅ Đã cập nhật ngân sách",
        "",
        `Khách hàng: ${saved.value.customer}`,
        `Ngân sách: ${saved.value.amount ? formatMoney(saved.value.amount) : "—"}`,
        `Ngày chuyển khoản: ${saved.value.transferDate}`,
        `Ngày hết ngân sách: ${saved.value.expireDate}`,
      ].join("\n"),
      mainKeyboard
    );
    return true;
  }
  return true;
}

async function handleAddFeeText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn khách hàng bằng nút bên trên, hoặc /huy.");
    return true;
  }
  if (form.step === "amount") {
    const amount = parseMoney(text);
    if (!amount) {
      await ctx.reply("Phí dịch vụ không hợp lệ. Nhập số, ví dụ: 500000");
      return true;
    }
    form.data.amount = amount;
    form.step = "date";
    await ctx.reply(
      "Nhập <b>ngày thu phí dịch vụ</b> (dd/mm/yyyy)\nĐến ngày này bot sẽ tự thông báo.",
      { parse_mode: "HTML" }
    );
    return true;
  }
  const date = normalizeDate(text);
  if (!date) {
    await ctx.reply("Ngày không hợp lệ. Ví dụ: 20/8/2026");
    return true;
  }
  const created = await withSheet(ctx, () =>
    sheets.upsertFee({
      customer: form.data.customer,
      amount: form.data.amount,
      feeDate: date,
    })
  );
  if (!created.ok) return true;
  clearForm(ctx);
  await ctx.reply(
    [
      "✅ Đã lưu thu phí dịch vụ vào Google Sheet",
      "",
      `Khách hàng: ${created.value.customer}`,
      `Phí dịch vụ: ${Number(created.value.amount).toLocaleString("vi-VN")} đ`,
      `Ngày thu phí dịch vụ: ${created.value.feeDate}`,
    ].join("\n"),
    mainKeyboard
  );
  return true;
}

async function handleEditFeeText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn khách hàng bằng nút bên trên, hoặc /huy.");
    return true;
  }
  if (form.step === "amount") {
    if (isKeep(text)) {
      form.data.amount = parseMoney(String(form.data.amount)) || form.data.amount;
    } else {
      const amount = parseMoney(text);
      if (!amount) {
        await ctx.reply('Phí không hợp lệ. Nhập số, ví dụ 500000 — hoặc gửi "giu" để giữ nguyên.');
        return true;
      }
      form.data.amount = amount;
    }
    form.step = "date";
    await ctx.reply(
      [
        `Phí sẽ lưu: <b>${form.data.amount ? formatMoney(form.data.amount) : "—"}</b>`,
        "",
        "Nhập <b>ngày thu phí mới</b> (dd/mm/yyyy)",
        'Hoặc gửi <b>giu</b> để giữ nguyên ngày.',
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "date") {
    let date = form.data.feeDate;
    if (!isKeep(text)) {
      date = normalizeDate(text);
      if (!date) {
        await ctx.reply('Ngày không hợp lệ. Ví dụ 20/8/2026 — hoặc gửi "giu" để giữ nguyên.');
        return true;
      }
    }
    if (!date) {
      await ctx.reply("Chưa có ngày thu phí. Nhập ngày, ví dụ 20/8/2026");
      return true;
    }
    const saved = await withSheet(ctx, () =>
      sheets.upsertFee({
        customer: form.data.customer,
        amount: form.data.amount,
        feeDate: date,
      })
    );
    if (!saved.ok) return true;
    clearForm(ctx);
    await ctx.reply(
      [
        "✅ Đã cập nhật thu phí dịch vụ",
        "",
        `Khách hàng: ${saved.value.customer}`,
        `Phí dịch vụ: ${saved.value.amount ? formatMoney(saved.value.amount) : "—"}`,
        `Ngày thu phí dịch vụ: ${saved.value.feeDate}`,
      ].join("\n"),
      mainKeyboard
    );
    return true;
  }
  return true;
}

async function saveCampaign(ctx, form, isEdit) {
  const data = {
    customer: form.data.customer,
    name: form.data.name,
    platform: form.data.platform,
    spend: form.data.spend,
    reach: form.data.reach,
    clicks: form.data.clicks,
    results: form.data.results,
    date: form.data.date,
  };
  const saved = await withSheet(ctx, () =>
    isEdit ? sheets.updateCampaign(form.data.id, data) : sheets.addCampaign(data)
  );
  if (!saved.ok) return true;
  if (isEdit && !saved.value) {
    clearForm(ctx);
    await ctx.reply("Không tìm thấy chiến dịch để sửa.", mainKeyboard);
    return true;
  }
  clearForm(ctx);
  await ctx.reply(
    [
      isEdit ? "✅ Đã cập nhật chiến dịch" : "✅ Đã lưu thông số chiến dịch",
      "",
      `Khách hàng: ${data.customer}`,
      `Chiến dịch: ${data.name}`,
      `Nền tảng: ${data.platform}`,
      `Chi tiêu: ${data.spend ? formatMoney(data.spend) : "—"}`,
      `Tiếp cận: ${data.reach ?? "—"}`,
      `Click: ${data.clicks ?? "—"}`,
      `Kết quả: ${data.results ?? "—"}`,
      `Ngày: ${data.date}`,
    ].join("\n"),
    mainKeyboard
  );
  return true;
}

async function handleAddCampaignText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn khách hàng bằng nút bên trên, hoặc /huy.");
    return true;
  }
  if (form.step === "name") {
    if (!text) {
      await ctx.reply("Nhập tên chiến dịch.");
      return true;
    }
    form.data.name = text;
    form.step = "platform";
    await ctx.reply("Chọn <b>nền tảng</b>:", { parse_mode: "HTML", ...platformKeyboard });
    return true;
  }
  if (form.step === "platform") {
    await ctx.reply("Vui lòng chọn nền tảng bằng nút bên trên.");
    return true;
  }
  if (form.step === "spend") {
    const amount = parseMoney(text);
    if (!amount) {
      await ctx.reply("Chi tiêu không hợp lệ. Nhập số, ví dụ: 500000");
      return true;
    }
    form.data.spend = amount;
    form.step = "reach";
    await ctx.reply("Nhập <b>tiếp cận</b> (số người / impression), ví dụ 12000:", {
      parse_mode: "HTML",
    });
    return true;
  }
  if (form.step === "reach") {
    const n = parseCount(text);
    if (n === null) {
      await ctx.reply("Số tiếp cận không hợp lệ. Nhập số, ví dụ: 12000");
      return true;
    }
    form.data.reach = n;
    form.step = "clicks";
    await ctx.reply("Nhập số <b>click</b>, ví dụ 340:", { parse_mode: "HTML" });
    return true;
  }
  if (form.step === "clicks") {
    const n = parseCount(text);
    if (n === null) {
      await ctx.reply("Số click không hợp lệ. Nhập số, ví dụ: 340");
      return true;
    }
    form.data.clicks = n;
    form.step = "results";
    await ctx.reply("Nhập số <b>kết quả</b> (tin nhắn / lead / đơn...), ví dụ 28:", {
      parse_mode: "HTML",
    });
    return true;
  }
  if (form.step === "results") {
    const n = parseCount(text);
    if (n === null) {
      await ctx.reply("Số kết quả không hợp lệ. Nhập số, ví dụ: 28");
      return true;
    }
    form.data.results = n;
    form.step = "date";
    await ctx.reply(
      `Nhập <b>ngày</b> của số liệu (dd/mm/yyyy)\nHoặc gửi "hom nay" — hôm nay là ${todayStr()}`,
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "date") {
    const raw = text.toLowerCase();
    const date = raw === "hom nay" || raw === "hôm nay" ? todayStr() : normalizeDate(text);
    if (!date) {
      await ctx.reply("Ngày không hợp lệ. Ví dụ: 16/8/2026 hoặc hom nay");
      return true;
    }
    form.data.date = date;
    return saveCampaign(ctx, form, false);
  }
  return true;
}

async function handleEditCampaignText(ctx, form, text) {
  if (form.step === "pick") {
    await ctx.reply("Vui lòng chọn chiến dịch bằng nút bên trên, hoặc /huy.");
    return true;
  }
  if (form.step === "name") {
    if (!isKeep(text)) {
      if (!text) {
        await ctx.reply("Nhập tên chiến dịch hoặc gửi giu.");
        return true;
      }
      form.data.name = text;
    }
    form.step = "platform";
    await ctx.reply(
      `Nền tảng hiện tại: <b>${escapeHtml(form.data.platform || "—")}</b>\nChọn nền tảng mới, hoặc gửi <b>giu</b>.`,
      { parse_mode: "HTML", ...platformKeyboard }
    );
    return true;
  }
  if (form.step === "platform") {
    if (isKeep(text)) {
      form.step = "spend";
      await ctx.reply(
        `Chi tiêu hiện tại: ${form.data.spend ? formatMoney(form.data.spend) : "—"}\nNhập chi tiêu mới hoặc gửi <b>giu</b>.`,
        { parse_mode: "HTML" }
      );
      return true;
    }
    await ctx.reply("Chọn nền tảng bằng nút, hoặc gửi giu.");
    return true;
  }
  if (form.step === "spend") {
    if (!isKeep(text)) {
      const amount = parseMoney(text);
      if (!amount) {
        await ctx.reply("Chi tiêu không hợp lệ. Nhập số hoặc giu.");
        return true;
      }
      form.data.spend = amount;
    }
    form.step = "reach";
    await ctx.reply(
      `Tiếp cận hiện tại: ${form.data.reach ?? "—"}\nNhập số mới hoặc gửi <b>giu</b>.`,
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "reach") {
    if (!isKeep(text)) {
      const n = parseCount(text);
      if (n === null) {
        await ctx.reply("Số không hợp lệ. Nhập số hoặc giu.");
        return true;
      }
      form.data.reach = n;
    }
    form.step = "clicks";
    await ctx.reply(
      `Click hiện tại: ${form.data.clicks ?? "—"}\nNhập số mới hoặc gửi <b>giu</b>.`,
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "clicks") {
    if (!isKeep(text)) {
      const n = parseCount(text);
      if (n === null) {
        await ctx.reply("Số không hợp lệ. Nhập số hoặc giu.");
        return true;
      }
      form.data.clicks = n;
    }
    form.step = "results";
    await ctx.reply(
      `Kết quả hiện tại: ${form.data.results ?? "—"}\nNhập số mới hoặc gửi <b>giu</b>.`,
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "results") {
    if (!isKeep(text)) {
      const n = parseCount(text);
      if (n === null) {
        await ctx.reply("Số không hợp lệ. Nhập số hoặc giu.");
        return true;
      }
      form.data.results = n;
    }
    form.step = "date";
    await ctx.reply(
      `Ngày hiện tại: ${form.data.date || "—"}\nNhập ngày mới (dd/mm/yyyy), hom nay, hoặc <b>giu</b>.`,
      { parse_mode: "HTML" }
    );
    return true;
  }
  if (form.step === "date") {
    if (!isKeep(text)) {
      const raw = text.toLowerCase();
      const date = raw === "hom nay" || raw === "hôm nay" ? todayStr() : normalizeDate(text);
      if (!date) {
        await ctx.reply("Ngày không hợp lệ. Ví dụ 16/8/2026, hom nay, hoặc giu.");
        return true;
      }
      form.data.date = date;
    }
    return saveCampaign(ctx, form, true);
  }
  return true;
}

async function handleFormAction(ctx) {
  const data = ctx.callbackQuery?.data || "";
  const form = getForm(ctx);

  if (data === "pick:cancel") {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}
    await cancelForm(ctx);
    return true;
  }

  if (data.startsWith("cdpick:")) {
    const idx = Number(data.slice(7));
    await ctx.answerCbQuery();
    const form = getForm(ctx);
    const camp = (form?.campaigns || [])[idx];
    if (!form || form.type !== "edit-campaign" || !camp) {
      await ctx.reply("Phiên sửa đã hết. Thử lại /sua_chien_dich.");
      clearForm(ctx);
      return true;
    }
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}
    form.data = {
      id: camp.id,
      customer: camp.customer,
      name: camp.name,
      platform: camp.platform,
      spend: camp.spend,
      reach: camp.reach,
      clicks: camp.clicks,
      results: camp.results,
      date: camp.date,
    };
    form.step = "name";
    await ctx.reply(
      [
        "Đang sửa chiến dịch",
        `Khách hàng: ${camp.customer}`,
        `Tên hiện tại: ${camp.name || "—"}`,
        "",
        "Nhập <b>tên chiến dịch mới</b> hoặc gửi <b>giu</b>.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }

  if (data.startsWith("plat:")) {
    await ctx.answerCbQuery();
    const form = getForm(ctx);
    if (!form || (form.type !== "add-campaign" && form.type !== "edit-campaign")) {
      await ctx.reply("Phiên nhập liệu đã hết.");
      return true;
    }
    if (form.step !== "platform") {
      await ctx.reply("Không ở bước chọn nền tảng.");
      return true;
    }
    form.data.platform = data.slice(5);
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}
    form.step = "spend";
    const hint =
      form.type === "edit-campaign"
        ? `Chi tiêu hiện tại: ${form.data.spend ? formatMoney(form.data.spend) : "—"}\nNhập chi tiêu mới hoặc gửi <b>giu</b>.`
        : "Nhập <b>chi tiêu</b> (ví dụ 500000):";
    await ctx.reply(hint, { parse_mode: "HTML" });
    return true;
  }

  if (data.startsWith("nspick:")) {
    const idx = Number(data.slice(7));
    await ctx.answerCbQuery();
    let form = getForm(ctx);
    if (!form || form.type !== "edit-budget") {
      const result = await withSheet(ctx, () => sheets.listBudgets());
      if (!result.ok) return true;
      setForm(ctx, { type: "edit-budget", step: "pick", data: {}, budgets: result.value });
      form = getForm(ctx);
    }
    const budget = (form.budgets || [])[idx];
    if (!budget) {
      await ctx.reply("Không tìm thấy dòng ngân sách.");
      clearForm(ctx);
      return true;
    }
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}
    await beginEditBudget(ctx, budget);
    return true;
  }

  if (data.startsWith("feepick:")) {
    const idx = Number(data.slice(8));
    await ctx.answerCbQuery();
    let form = getForm(ctx);
    if (!form || form.type !== "edit-fee") {
      const result = await withSheet(ctx, () => sheets.listFees());
      if (!result.ok) return true;
      setForm(ctx, { type: "edit-fee", step: "pick", data: {}, fees: result.value });
      form = getForm(ctx);
    }
    const fee = (form.fees || [])[idx];
    if (!fee) {
      await ctx.reply("Không tìm thấy dòng thu phí.");
      clearForm(ctx);
      return true;
    }
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}
    await beginEditFee(ctx, fee);
    return true;
  }

  if (data.startsWith("pick:")) {
    if (!form || form.step !== "pick") {
      await ctx.answerCbQuery("Phiên đã hết, thử lại lệnh.");
      return true;
    }
    const customer = (form.customers || [])[Number(data.slice(5))];
    await ctx.answerCbQuery();
    if (!customer) {
      await ctx.reply("Không tìm thấy khách hàng.");
      clearForm(ctx);
      return true;
    }
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}

    if (form.type === "add-budget") {
      form.data.customer = customer.name;
      form.step = "amount";
      await ctx.reply(
        `Khách hàng: <b>${escapeHtml(customer.name)}</b>\n\nNhập <b>ngân sách</b> (ví dụ 500000):`,
        { parse_mode: "HTML" }
      );
      return true;
    }
    if (form.type === "add-fee") {
      form.data.customer = customer.name;
      form.step = "amount";
      await ctx.reply(
        `Khách hàng: <b>${escapeHtml(customer.name)}</b>\n\nNhập <b>phí dịch vụ</b> (ví dụ 500000):`,
        { parse_mode: "HTML" }
      );
      return true;
    }
    if (form.type === "add-campaign") {
      form.data.customer = customer.name;
      form.step = "name";
      await ctx.reply(
        `Khách hàng: <b>${escapeHtml(customer.name)}</b>\n\nNhập <b>tên chiến dịch</b>:`,
        { parse_mode: "HTML" }
      );
      return true;
    }
    if (form.type === "change-status") {
      form.data.customer = customer;
      form.step = "status";
      await ctx.reply(
        `Khách hàng: <b>${escapeHtml(customer.name)}</b>\nTrạng thái hiện tại: ${customer.status}\n\nChọn trạng thái mới:`,
        { parse_mode: "HTML", ...statusKeyboard }
      );
      return true;
    }
    if (form.type === "link-ad-account") {
      form.data.customer = customer.name;
      form.step = "account";
      await ctx.reply(
        [
          `Khách hàng: <b>${escapeHtml(customer.name)}</b>`,
          "",
          "Nhập <b>Ad Account ID</b> (từ URL Ads Manager: <code>act=123456789</code>).",
          "Ví dụ: <code>act_123456789</code> hoặc <code>123456789</code>",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
      return true;
    }
    return true;
  }

  if (data === "adlink:yes" || data === "adlink:no") {
    await ctx.answerCbQuery();
    if (!form || form.type !== "add-customer" || form.step !== "link-account") {
      await ctx.reply("Phiên thêm khách hàng đã hết. Vui lòng thử lại.");
      return true;
    }
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}
    if (data === "adlink:no") return finishAddCustomer(ctx, form);
    form.step = "account";
    await ctx.reply(
      [
        "Nhập <b>Ad Account ID</b> của khách hàng.",
        "Ví dụ: <code>act_123456789</code> hoặc <code>123456789</code>.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return true;
  }

  if (data === "st:active" || data === "st:paused") {
    await ctx.answerCbQuery();
    if (!form) {
      await ctx.reply("Phiên nhập liệu đã hết. Thử lại lệnh.");
      return true;
    }
    const status = STATUS_FROM_CB[data.split(":")[1]];
    try {
      await ctx.editMessageReplyMarkup();
    } catch (_) {}

    if (form.type === "add-customer") {
      if (!form.data.name || !form.data.field) {
        clearForm(ctx);
        await ctx.reply("Thiếu tên hoặc lĩnh vực. Thử lại /add_khach_hang.");
        return true;
      }
      form.data.status = status;
      return askCustomerAdAccount(ctx, form);
    }

    if (form.type === "change-status") {
      const customer = form.data.customer;
      if (!customer) {
        clearForm(ctx);
        await ctx.reply("Phiên nhập liệu đã hết.");
        return true;
      }
      const updated = await withSheet(ctx, () =>
        sheets.updateCustomerStatus(customer.id, status)
      );
      if (!updated.ok) return true;
      clearForm(ctx);
      await ctx.reply(`✅ Đã đổi trạng thái "${customer.name}" → ${status}`, mainKeyboard);
      return true;
    }
  }

  return false;
}

module.exports = {
  getForm,
  clearForm,
  cancelForm,
  isCancelText,
  startAddCustomer,
  startAddBudget,
  startEditBudget,
  startAddFee,
  startEditFee,
  startAddCampaign,
  startEditCampaign,
  startChangeStatus,
  startLinkAdAccount,
  startCustomAdsRange,
  startSetReportTimes,
  handleFormText,
  handleFormAction,
};
