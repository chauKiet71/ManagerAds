const sheets = require("../sheets");
const { todayStr, normalizeDate, parseMoney, escapeHtml } = require("../utils");
const { statusKeyboard, customerPickKeyboard, mainKeyboard } = require("./keyboards");

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

async function startAddCustomer(ctx) {
  try {
    setForm(ctx, { type: "add-customer", step: "name", data: {} });
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

async function startAddFee(ctx) {
  setForm(ctx, { type: "add-fee", step: "pick", data: {} });
  return askPick(ctx, "Thêm ngày thu phí DV");
}

async function startChangeStatus(ctx) {
  setForm(ctx, { type: "change-status", step: "pick", data: {} });
  return askPick(ctx, "Đổi trạng thái");
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
  if (form.type === "add-fee") return handleAddFeeText(ctx, form, text);
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
    form.step = "status";
    await ctx.reply("Chọn <b>trạng thái</b>:", {
      parse_mode: "HTML",
      ...statusKeyboard,
    });
    return true;
  }
  await ctx.reply("Vui lòng chọn trạng thái bằng nút bên trên, hoặc /huy.");
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
    if (form.type === "change-status") {
      form.data.customer = customer;
      form.step = "status";
      await ctx.reply(
        `Khách hàng: <b>${escapeHtml(customer.name)}</b>\nTrạng thái hiện tại: ${customer.status}\n\nChọn trạng thái mới:`,
        { parse_mode: "HTML", ...statusKeyboard }
      );
      return true;
    }
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
      const exists = await withSheet(ctx, () => sheets.findCustomerByName(form.data.name));
      if (!exists.ok) return true;
      if (exists.value) {
        clearForm(ctx);
        await ctx.reply(`Khách hàng "${form.data.name}" đã tồn tại.`, mainKeyboard);
        return true;
      }
      const created = await withSheet(ctx, () =>
        sheets.addCustomer({
          name: form.data.name,
          field: form.data.field,
          status,
        })
      );
      if (!created.ok) return true;
      clearForm(ctx);
      await ctx.reply(
        [
          "✅ Đã thêm khách hàng vào Google Sheet",
          "",
          `ID: ${created.value.id}`,
          `Tên: ${created.value.name}`,
          `Lĩnh vực: ${created.value.field}`,
          `Trạng thái: ${created.value.status}`,
          `Thời gian: ${created.value.createdAt}`,
        ].join("\n"),
        mainKeyboard
      );
      return true;
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
  startAddFee,
  startChangeStatus,
  handleFormText,
  handleFormAction,
};
