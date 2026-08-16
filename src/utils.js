const VN_TZ = "Asia/Ho_Chi_Minh";

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { d: get("day"), m: get("month"), y: get("year") };
}

function formatDate(d, m, y) {
  return `${d}/${m}/${y}`;
}

function todayStr() {
  const { d, m, y } = todayParts();
  return formatDate(d, m, y);
}

function yesterdayParts() {
  const t = todayParts();
  const dt = new Date(Date.UTC(t.y, t.m - 1, t.d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return { d: dt.getUTCDate(), m: dt.getUTCMonth() + 1, y: dt.getUTCFullYear() };
}

function yesterdayStr() {
  const p = yesterdayParts();
  return formatDate(p.d, p.m, p.y);
}

function toIsoDate(p) {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

function yesterdayIso() {
  return toIsoDate(yesterdayParts());
}

function isoToDisplay(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return formatDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function parseDate(str) {
  if (!str) return null;
  const cleaned = String(str).trim();
  const match = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return { d, m, y };
}

function normalizeDate(str) {
  const p = parseDate(str);
  return p ? formatDate(p.d, p.m, p.y) : null;
}

function toTime(p) {
  return Date.UTC(p.y, p.m - 1, p.d);
}

function isSameOrBeforeToday(dateStr) {
  const p = parseDate(dateStr);
  if (!p) return false;
  return toTime(p) <= toTime(todayParts());
}

function isToday(dateStr) {
  const p = parseDate(dateStr);
  if (!p) return false;
  const t = todayParts();
  return p.d === t.d && p.m === t.m && p.y === t.y;
}

function formatMoney(value) {
  const n = Number(String(value).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return `${n.toLocaleString("vi-VN")} đ`;
}

function parseMoney(str) {
  const n = Number(String(str).replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  VN_TZ,
  todayStr,
  yesterdayStr,
  yesterdayIso,
  isoToDisplay,
  parseDate,
  normalizeDate,
  isSameOrBeforeToday,
  isToday,
  formatMoney,
  parseMoney,
  escapeHtml,
};
