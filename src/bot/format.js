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

function formatAdAccountList(items, customer) {
  if (!items.length) return `Khách hàng "${customer}" chưa có tài khoản quảng cáo.`;
  const lines = [`📋 DS TKQC — ${customer.toUpperCase()} (${items.length})`, ""];
  items.forEach((item, index) => {
    lines.push(`${index + 1}. act_${item.adAccountId}`);
  });
  return lines.join("\n");
}

function formatCount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const n = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("vi-VN");
}

function pct(num, den) {
  const a = Number(String(num ?? "").replace(/[^\d]/g, ""));
  const b = Number(String(den ?? "").replace(/[^\d]/g, ""));
  if (!b || !Number.isFinite(a)) return "—";
  return `${((a / b) * 100).toFixed(2)}%`;
}

function formatCampaignList(items, customer) {
  if (!items.length) {
    return customer
      ? `Chưa có chiến dịch cho "${customer}".\nDùng /dong_bo_ads để kéo từ Facebook, hoặc /them_chien_dich để nhập tay.`
      : "Chưa có chiến dịch.\nDùng /dong_bo_ads để kéo từ Facebook, hoặc /them_chien_dich để nhập tay.";
  }
  const lines = [];
  items.forEach((c, i) => {
    lines.push(`${i + 1}. Khách: ${c.customer || customer || "—"}`);
    lines.push(`   Chiến dịch: ${c.name || "—"}`);
    lines.push(`   Chi tiêu: ${c.spend ? formatMoney(c.spend) : "—"}`);
    lines.push(`   Tiếp cận: ${formatCount(c.reach)}  |  Click: ${formatCount(c.clicks)}`);
    lines.push(`   Kết quả: ${formatCount(c.results)}  |  CTR: ${pct(c.clicks, c.reach)}`);
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
    "/danh_sach_khach_hang — danh sách và quản lý khách hàng",
    "/khach_hang — bí danh ngắn của /danh_sach_khach_hang",
    "/dang_trien_khai — đang triển khai",
    "/tam_ngung — tạm ngưng",
    "/doi_trang_thai — đổi trạng thái",
    "",
    "<b>Ngân sách</b>",
    "/ngan_sach — danh sách ngân sách",
    "/them_ngan_sach — thêm lần chuyển khoản",
    "/sua_ngan_sach — sửa ngân sách hoặc ngày hết",
    "",
    "<b>Thu phí DV</b>",
    "/thu_phi_dv — danh sách thu phí DV",
    "/them_thu_phi — thêm phí và ngày thu",
    "/sua_thu_phi — sửa phí hoặc ngày thu",
    "",
    "<b>Chiến dịch ads</b>",
    "/chien_dich — xem thông số (chọn hôm nay, hôm qua, 7 ngày…)",
    "/gan_ad_account — gán Ad Account Facebook cho khách",
    "/ds_tkqc — xem và quản lý danh sách tài khoản quảng cáo",
    "/dong_bo_ads — lưu số hôm qua vào Google Sheet",
    "/gio_bao_cao — xem giờ tự gửi chỉ số",
    "/dat_gio_bao_cao — đặt giờ gửi (ví dụ 8, 12, 16:30, 20, 23)",
    "/gui_bao_cao — gửi chỉ số hôm nay ngay",
    "/them_chien_dich — nhập thông số (chi tiêu, click...)",
    "/sua_chien_dich — sửa thông số chiến dịch",
    "/check_uid — kiểm tra và theo dõi realtime 1 UID; dừng bằng /check_uid off <UID>",
    "/check_uid_file — lưu danh sách UID và lịch tự động check, cập nhật `STATUS` trên sheet `Via`",
    "",
    "/huy — hủy thao tác đang làm",
    "",
    "Dữ liệu lưu trên Google Sheet. Bot nhắc hết ngân sách / thu phí mỗi sáng; 7:15 lưu số hôm qua. Giờ gửi chỉ số hôm nay tự chỉnh bằng /dat_gio_bao_cao.",
  ].join("\n");
}

module.exports = {
  STATUS_LABEL,
  formatCustomerList,
  formatBudgetList,
  formatAdAccountList,
  formatFeeList,
  formatCampaignList,
  helpText,
};
