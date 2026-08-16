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

function addDays(p, n) {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { d: dt.getUTCDate(), m: dt.getUTCMonth() + 1, y: dt.getUTCFullYear() };
}

function startOfWeekMonday(p) {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const dow = dt.getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(p, -offset);
}

function startOfMonth(p) {
  return { d: 1, m: p.m, y: p.y };
}

function lastDayOfPrevMonth(p) {
  return addDays(startOfMonth(p), -1);
}

function nowClock() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  let h = get("hour");
  const m = get("minute");
  if (h === 24) h = 0;
  return { h, m, label: `${pad(h)}:${pad(m)}` };
}

function nowTimeLabel() {
  return nowClock().label;
}

const DEFAULT_REPORT_TIMES = ["08:00", "12:00", "16:00", "20:00", "23:00"];

function parseReportTimes(text) {
  const raw = String(text || "").trim();
  if (!raw || /^(tat|tắt|off|0)$/i.test(raw)) {
    return { times: [], disabled: true };
  }
  const parts = raw.split(/[,;]+|\s+/).map((s) => s.trim()).filter(Boolean);
  const times = [];
  for (const part of parts) {
    const match = part.match(/^(\d{1,2})(?:[:hg](\d{1,2}))?h?$/i);
    if (!match) {
      return { error: `Không hiểu mốc "${part}". Ví dụ: 8, 12:30, 20h` };
    }
    const h = Number(match[1]);
    const m = Number(match[2] || 0);
    if (h > 23 || m > 59) {
      return { error: `Giờ không hợp lệ: ${part}` };
    }
    times.push(`${pad(h)}:${pad(m)}`);
  }
  return { times: [...new Set(times)].sort(), disabled: false };
}

function formatReportTimes(times) {
  if (!times || !times.length) return "Đang tắt";
  return times.join(" · ");
}

const DATE_RANGE_PRESETS = {
  today: { label: "Hôm nay" },
  yesterday: { label: "Hôm qua" },
  today_yday: { label: "Hôm nay và hôm qua" },
  d7: { label: "7 ngày qua" },
  d14: { label: "14 ngày qua" },
  d28: { label: "28 ngày qua" },
  d30: { label: "30 ngày qua" },
  week: { label: "Tuần này" },
  last_week: { label: "Tuần trước" },
  month: { label: "Tháng này" },
  last_month: { label: "Tháng trước" },
};

function resolveDateRange(key, custom) {
  const today = todayParts();
  if (key === "custom" && custom?.since && custom?.until) {
    const display = `${isoToDisplay(custom.since)} – ${isoToDisplay(custom.until)}`;
    return {
      key: "custom",
      label: "Tùy chọn",
      since: custom.since,
      until: custom.until,
      display,
    };
  }
  let sinceP;
  let untilP = today;
  switch (key) {
    case "today":
      sinceP = today;
      break;
    case "yesterday":
      sinceP = yesterdayParts();
      untilP = sinceP;
      break;
    case "today_yday":
      sinceP = yesterdayParts();
      break;
    case "d7":
      sinceP = addDays(today, -6);
      break;
    case "d14":
      sinceP = addDays(today, -13);
      break;
    case "d28":
      sinceP = addDays(today, -27);
      break;
    case "d30":
      sinceP = addDays(today, -29);
      break;
    case "week":
      sinceP = startOfWeekMonday(today);
      break;
    case "last_week": {
      const thisMon = startOfWeekMonday(today);
      sinceP = addDays(thisMon, -7);
      untilP = addDays(thisMon, -1);
      break;
    }
    case "month":
      sinceP = startOfMonth(today);
      break;
    case "last_month": {
      untilP = lastDayOfPrevMonth(today);
      sinceP = startOfMonth(untilP);
      break;
    }
    default:
      sinceP = yesterdayParts();
      untilP = sinceP;
      key = "yesterday";
  }
  const since = toIsoDate(sinceP);
  const until = toIsoDate(untilP);
  const preset = DATE_RANGE_PRESETS[key];
  const same = since === until;
  return {
    key,
    label: preset?.label || `${isoToDisplay(since)} – ${isoToDisplay(until)}`,
    since,
    until,
    display: same ? isoToDisplay(since) : `${isoToDisplay(since)} – ${isoToDisplay(until)}`,
  };
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
  toIsoDate,
  isoToDisplay,
  nowTimeLabel,
  nowClock,
  DEFAULT_REPORT_TIMES,
  parseReportTimes,
  formatReportTimes,
  DATE_RANGE_PRESETS,
  resolveDateRange,
  parseDate,
  normalizeDate,
  isSameOrBeforeToday,
  isToday,
  formatMoney,
  parseMoney,
  escapeHtml,
};
