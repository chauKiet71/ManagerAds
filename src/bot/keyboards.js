const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "➕ Thêm khách hàng" }, { text: "👥 Khách hàng" }],
      [{ text: "💰 Ngân sách" }, { text: "🧾 Thu phí DV" }],
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

module.exports = {
  mainKeyboard,
  customerFilterKeyboard,
  statusKeyboard,
  customerPickKeyboard,
  listActionKeyboard,
};
