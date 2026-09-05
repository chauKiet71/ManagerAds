const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "👥 Khách hàng" }],
      [{ text: "💰 Ngân sách" }, { text: "🧾 Thu phí DV" }],
      [{ text: "📊 Chiến dịch" }, { text: "📋 DS TKQC" }],
    ],
    resize_keyboard: true,
  },
};

const customerFilterKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "Đang triển khai", callback_data: "kh:active" },
        { text: "Tạm ngưng", callback_data: "kh:paused" },
      ],
      [{ text: "Tất cả", callback_data: "kh:all" }],
    ],
  },
};

const statusKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "Đang triển khai", callback_data: "st:active" }],
      [{ text: "Tạm ngưng", callback_data: "st:paused" }],
    ],
  },
};

function customerPickKeyboard(customers) {
  const rows = customers.map((c, i) => [
    { text: `${i + 1}. ${c.name}`.slice(0, 60), callback_data: `pick:${i}` },
  ]);
  rows.push([{ text: "Hủy", callback_data: "pick:cancel" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function listActionKeyboard(addAction) {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "➕ Thêm", callback_data: addAction }]],
    },
  };
}

function customerListActionsKeyboard(statusKey) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Thêm", callback_data: `khact:add:${statusKey}` }],
        [
          { text: "🗑 Xóa", callback_data: `khact:delete:${statusKey}` },
          { text: "🔄 Cập nhật trạng thái", callback_data: `khact:status:${statusKey}` },
        ],
        [{ text: "↩ Chọn danh sách khác", callback_data: "kh:menu" }],
      ],
    },
  };
}

function customerManagePickKeyboard(customers, action, statusKey) {
  const rows = (customers || []).map((customer, index) => [
    {
      text: `${index + 1}. ${customer.name}`.slice(0, 60),
      callback_data: `khpick:${action}:${statusKey}:${index}`,
    },
  ]);
  rows.push([{ text: "Hủy", callback_data: "kh:menu" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function confirmDeleteCustomerKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "Xác nhận xóa", callback_data: "khdelete:yes" },
        { text: "Không", callback_data: "khdelete:no" },
      ]],
    },
  };
}

const adAccountChoiceKeyboard = {
  reply_markup: {
    inline_keyboard: [[
      { text: "Có", callback_data: "adlink:yes" },
      { text: "Không", callback_data: "adlink:no" },
    ]],
  },
};

function adAccountCustomerKeyboard(customers) {
  const rows = (customers || []).map((customer, index) => [
    { text: `${index + 1}. ${customer.name}`.slice(0, 60), callback_data: `tkqckh:${index}` },
  ]);
  rows.push([{ text: "Hủy", callback_data: "tkqc:cancel" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adAccountActionsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Thêm", callback_data: "tkqc:add" },
          { text: "🗑 Xóa", callback_data: "tkqc:delete" },
          { text: "✏️ Cập nhật", callback_data: "tkqc:update" },
        ],
        [{ text: "↩ Chọn khách hàng khác", callback_data: "tkqc:menu" }],
      ],
    },
  };
}

function adAccountManagePickKeyboard(accounts, action) {
  const rows = (accounts || []).map((account, index) => [
    {
      text: `act_${account.adAccountId}`.slice(0, 60),
      callback_data: `tkqcpick:${action}:${index}`,
    },
  ]);
  rows.push([{ text: "Hủy", callback_data: "tkqc:refresh" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function confirmDeleteAdAccountKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "Xác nhận xóa", callback_data: "tkqcdelete:yes" },
        { text: "Không", callback_data: "tkqcdelete:no" },
      ]],
    },
  };
}

const adAccountBackKeyboard = {
  reply_markup: {
    inline_keyboard: [[{ text: "↩ Danh sách TKQC", callback_data: "tkqc:refresh" }]],
  },
};

function budgetListKeyboard(budgets) {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "➕ Thêm", callback_data: "go:add-budget" },
        { text: "🗑 Xóa", callback_data: "budget:delete" },
        { text: "✏️ Cập nhật", callback_data: "budget:update" },
      ]],
    },
  };
}

function budgetDeletePickKeyboard(budgets) {
  const rows = (budgets || []).map((budget, index) => [
    {
      text: `${index + 1}. ${budget.customer} — ${budget.expireDate || ""}`.slice(0, 60),
      callback_data: `budgetpick:delete:${index}`,
    },
  ]);
  rows.push([{ text: "Hủy", callback_data: "budgetdelete:no" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function confirmDeleteBudgetKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "Xác nhận xóa", callback_data: "budgetdelete:yes" },
        { text: "Không", callback_data: "budgetdelete:no" },
      ]],
    },
  };
}

function budgetPickKeyboard(budgets) {
  const rows = (budgets || []).map((b, i) => [
    {
      text: `${i + 1}. ${b.customer} — ${b.expireDate || ""}`.slice(0, 60),
      callback_data: `nspick:${i}`,
    },
  ]);
  rows.push([{ text: "Hủy", callback_data: "pick:cancel" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function feeListKeyboard(fees) {
  const rows = (fees || []).slice(0, 20).map((f, i) => [
    { text: `✏️ ${i + 1}. ${f.customer}`.slice(0, 60), callback_data: `feepick:${i}` },
  ]);
  rows.push([
    { text: "➕ Thêm", callback_data: "go:add-fee" },
    { text: "✏️ Sửa", callback_data: "go:edit-fee" },
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

const platformKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "Facebook", callback_data: "plat:Facebook" },
        { text: "Google", callback_data: "plat:Google" },
      ],
      [
        { text: "TikTok", callback_data: "plat:TikTok" },
        { text: "Khác", callback_data: "plat:Khác" },
      ],
    ],
  },
};

function reportTimesKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✏️ Đổi giờ", callback_data: "go:set-report-times" },
          { text: "📤 Gửi ngay", callback_data: "go:send-digest" },
        ],
        [{ text: "Tắt tự động", callback_data: "go:off-report-times" }],
      ],
    },
  };
}

function dateRangeKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Hôm nay", callback_data: "dr:today" },
          { text: "Hôm qua", callback_data: "dr:yesterday" },
        ],
        [{ text: "Hôm nay và hôm qua", callback_data: "dr:today_yday" }],
        [
          { text: "7 ngày qua", callback_data: "dr:d7" },
          { text: "14 ngày qua", callback_data: "dr:d14" },
        ],
        [
          { text: "28 ngày qua", callback_data: "dr:d28" },
          { text: "30 ngày qua", callback_data: "dr:d30" },
        ],
        [
          { text: "Tuần này", callback_data: "dr:week" },
          { text: "Tuần trước", callback_data: "dr:last_week" },
        ],
        [
          { text: "Tháng này", callback_data: "dr:month" },
          { text: "Tháng trước", callback_data: "dr:last_month" },
        ],
        [{ text: "Tùy chọn ngày…", callback_data: "dr:custom" }],
        [{ text: "« Chọn khách khác", callback_data: "go:campaign-menu" }],
      ],
    },
  };
}

function campaignListKeyboard(customers) {
  const rows = (customers || []).slice(0, 20).map((c, i) => [
    { text: c.name.slice(0, 60), callback_data: `cview:${i}` },
  ]);
  rows.unshift([{ text: "Tất cả chiến dịch", callback_data: "cview:all" }]);
  rows.push([{ text: "➕ Nhập thông số", callback_data: "go:add-campaign" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function campaignPickKeyboard(campaigns) {
  const rows = (campaigns || []).map((c, i) => [
    {
      text: `${i + 1}. ${c.customer} — ${c.name}`.slice(0, 60),
      callback_data: `cdpick:${i}`,
    },
  ]);
  rows.push([{ text: "Hủy", callback_data: "pick:cancel" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function feePickKeyboard(fees) {
  const rows = (fees || []).map((f, i) => [
    { text: `${i + 1}. ${f.customer}`.slice(0, 60), callback_data: `feepick:${i}` },
  ]);
  rows.push([{ text: "Hủy", callback_data: "pick:cancel" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = {
  mainKeyboard,
  customerFilterKeyboard,
  statusKeyboard,
  customerPickKeyboard,
  listActionKeyboard,
  customerListActionsKeyboard,
  customerManagePickKeyboard,
  confirmDeleteCustomerKeyboard,
  adAccountChoiceKeyboard,
  adAccountCustomerKeyboard,
  adAccountActionsKeyboard,
  adAccountManagePickKeyboard,
  confirmDeleteAdAccountKeyboard,
  adAccountBackKeyboard,
  budgetListKeyboard,
  budgetDeletePickKeyboard,
  confirmDeleteBudgetKeyboard,
  budgetPickKeyboard,
  feeListKeyboard,
  feePickKeyboard,
  platformKeyboard,
  campaignListKeyboard,
  campaignPickKeyboard,
  dateRangeKeyboard,
  reportTimesKeyboard,
};
