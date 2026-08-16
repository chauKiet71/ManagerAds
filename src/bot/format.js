const { formatMoney } = require("../utils");
const sheets = require("../sheets");

const STATUS_LABEL = {
  [sheets.STATUS.ACTIVE]: "Đang triển khai",
  [sheets.STATUS.PAUSED]: "Tạm ngưng",
};

function statusTitle(status) {
  if (!status) return "TẤT CẢ KHÁCH HÀNG";
  return (STATUS_LABEL[status] || status).toUpperCase();
}

function formatCustomerList(customers, status) {
  if (!customers.length) {
    return `Chưa có khách hàng${status ? ` ở trạng thái "${STATUS_LABEL[status] || status}"` : ""}.`;
  }
  const lines = [`👥 ${statusTitle(status)} (${customers.length})`, ""];
  customers.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name}`);
    lines.push(`   Lĩnh vực: ${c.field || "—"}`);
    if (!status) lines.push(`   Trạng thái: ${STATUS_LABEL[c.status] || c.status}`);
    lines.push(`   Thời gian: ${c.createdAt || "—"}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function formatBudgetList(items) {
  if (!items.length) {
    return "Chưa có dữ liệu ngân sách.\nDùng /them_ngan_sach để thêm.";
  }
  const lines = [`💰 NGÂN SÁCH (${items.length})`, ""];
  items.forEach((b, i) => {
    lines.push(`${i + 1}. Khách hàng: ${b.customer}`);
    lines.push(`   Ngân sách: ${formatMoney(b.amount)}`);
    lines.push(`   Ngày chuyển khoản: ${b.transferDate}`);
    lines.push(`   Ngày hết ngân sách: ${b.expireDate}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function formatFeeList(items) {
  if (!items.length) {
    return "Chưa có dữ liệu thu phí dịch vụ.\nDùng /them_thu_phi để thêm.";
  }
  const lines = [`🧾 THU PHÍ DỊCH VỤ (${items.length})`, ""];
  items.forEach((f, i) => {
    lines.push(`${i + 1}. Khách hàng: ${f.customer}`);
    lines.push(`   Phí dịch vụ: ${f.amount ? formatMoney(f.amount) : "—"}`);
    lines.push(`   Ngày thu phí dịch vụ: ${f.feeDate}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function helpText() {
  return [
    "<b>Bot quản lý khách hàng Ads</b>",
    "",
    "<b>Khách hàng</b>",
    "/add_khach_hang — thêm khách hàng",
    "/khach_hang — lọc danh sách",
    "/dang_trien_khai — đang triển khai",
    "/tam_ngung — tạm ngưng",
    "/doi_trang_thai — đổi trạng thái",
    "",
    "<b>Ngân sách</b>",
    "/ngan_sach — danh sách ngân sách",
    "/them_ngan_sach — thêm lần chuyển khoản",
    "",
    "<b>Thu phí DV</b>",
    "/thu_phi_dv — danh sách thu phí DV",
    "/them_thu_phi — thêm / cập nhật phí và ngày thu",
    "",
    "/huy — hủy thao tác đang làm",
    "",
    "Dữ liệu lưu trên Google Sheet. Bot tự nhắc hết ngân sách và đến ngày thu phí (mỗi sáng).",
  ].join("\n");
}

module.exports = {
  STATUS_LABEL,
  formatCustomerList,
  formatBudgetList,
  formatFeeList,
  helpText,
};
