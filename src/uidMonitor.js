const config = require("./config");
const sheets = require("./sheets");
const { parseReportTimes, nextReportAt } = require("./utils");

const STATUS = {
  LIVE: "live",
  DIE: "die",
};

let scheduleCache = null;
let cachedChatId = "";
let uidTimer = null;
let uidBusy = false;
let uidBot = null;

function normalizeUid(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

function parseUidList(raw) {
  return String(raw || "")
    .split(/[\s,;\r\n]+/)
    .map(normalizeUid)
    .filter(Boolean);
}

function parseUidSchedule(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { times: [], realtime: false, raw: "", disabled: true, error: null };
  }
  const lowered = text.toLowerCase();
  if (/^(tat|tắt|off|0)$/.test(lowered)) {
    return { times: [], realtime: false, raw: "off", disabled: true, error: null };
  }

  const parts = text.split(/[,;]+|\s+/).map((item) => item.trim()).filter(Boolean);
  if (!parts.length) {
    return { times: [], realtime: false, raw: "", disabled: true, error: null };
  }

  const times = [];
  let realtime = false;
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (lower === "realtime") {
      realtime = true;
      continue;
    }
    const parsed = parseReportTimes(part);
    if (parsed.error) return { error: parsed.error };
    if (parsed.disabled) continue;
    times.push(...parsed.times);
  }

  const uniq = [...new Set(times)].sort();
  const save = [];
  if (realtime) save.push("realtime");
  save.push(...uniq);

  return {
    times: uniq,
    realtime,
    raw: save.join(","),
    disabled: uniq.length === 0 && !realtime,
    error: null,
  };
}

function transitionLine(uid, previous, next) {
  return `UID ${uid}: ${previous} => ${next}`;
}

async function resolveChatId() {
  if (cachedChatId) return cachedChatId;
  const saved = await sheets.getReportChatId();
  cachedChatId = saved || config.adminChatId || "";
  return cachedChatId;
}

async function loadSchedule(force = false) {
  if (!force && scheduleCache) return scheduleCache;
  const saved = await sheets.getUidCheckTimes();
  const fallback = saved == null || String(saved).trim() === "" ? config.uidCheckTimes : saved;
  const parsed = parseUidSchedule(fallback);
  if (parsed.error) {
    console.warn("UID schedule không hợp lệ, tắt lịch tự động:", parsed.error);
    scheduleCache = { times: [], realtime: false, raw: "", disabled: true, error: parsed.error };
    return scheduleCache;
  }
  scheduleCache = parsed;
  return parsed;
}

async function checkUid(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) {
    return { uid: "", status: STATUS.DIE, error: "UID không hợp lệ" };
  }
  const url = `https://graph.facebook.com/${normalized}/picture?redirect=false`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }

    if (response.status === 429 || response.status >= 500) {
      return {
        uid: normalized,
        status: "",
        error: `HTTP ${response.status}`,
      };
    }
    if (!response.ok) {
      return { uid: normalized, status: STATUS.DIE };
    }
    if (!data || data.error) {
      return {
        uid: normalized,
        status: STATUS.DIE,
        error: data?.error?.message || "Không đọc được dữ liệu Facebook",
      };
    }
    if (data.data && typeof data.data.url === "string" && data.data.url) {
      return { uid: normalized, status: STATUS.LIVE };
    }
    return { uid: normalized, status: STATUS.DIE, error: "Không có dữ liệu ảnh đại diện" };
  } catch (error) {
    return {
      uid: normalized,
      status: "",
      error: error.message || String(error),
    };
  }
}

async function checkAndPersist(uids) {
  const normalized = [...new Set(parseUidList(uids.join(",")))]
    .filter(Boolean);
  if (!normalized.length) return [];

  const checked = [];
  for (const uid of normalized) {
    const result = await checkUid(uid);
    checked.push(result);
  }

  const saved = await sheets.setViaStatuses(checked.filter((item) => item.status));
  const savedByUid = new Map(saved.map((item) => [item.uid, item]));
  return checked.map((result) => {
    const persisted = savedByUid.get(result.uid) || {};
    const previous = persisted.previous || "";
    return {
      uid: result.uid,
      status: result.status,
      previous,
      error: result.error || "",
      changed: Boolean(!result.error && result.status && previous && previous !== result.status),
      isNew: Boolean(!result.error && result.status && !previous),
    };
  });
}

async function checkUidListNow(uids, { chatId = "", bot = null, mode = "file" } = {}) {
  const normalized = [...new Set(parseUidList(Array.isArray(uids) ? uids.join(",") : uids))].filter(Boolean);

  if (!normalized.length) {
    return {
      checked: 0,
      changed: [],
      added: [],
      errors: [],
      details: [],
      message: "",
    };
  }

  const details = await checkAndPersist(normalized);
  const changed = details.filter((item) => item.changed);
  const added = details.filter((item) => item.isNew);
  const errors = details.filter((item) => item.error);

  const lines = [];
  if (mode === "single") {
    const item = details[0];
    if (!item) {
      lines.push("Không kiểm tra được UID nào.");
    } else if (item.error) {
      lines.push(`UID ${item.uid}: lỗi kiểm tra (${item.error})`);
    } else if (item.isNew) {
      lines.push(`UID ${item.uid}: ${item.status.toUpperCase()} (lần đầu cập nhật)`);
    } else if (item.changed) {
      lines.push(`UID ${item.uid}: ${item.previous.toUpperCase()} => ${item.status.toUpperCase()}`);
    } else {
      lines.push(`UID ${item.uid}: ${item.status.toUpperCase()} (không đổi)`);
    }
  } else if (mode === "scheduled") {
    for (const item of changed) {
      lines.push(`🔔 ${transitionLine(item.uid, item.previous, item.status)}`);
    }
  } else {
    for (const item of added) {
      lines.push(`✅ ${item.uid}: ${item.status.toUpperCase()} (đã lưu)`);
    }
    for (const item of changed) {
      lines.push(`🔔 ${transitionLine(item.uid, item.previous, item.status)}`);
    }
    for (const item of errors) {
      lines.push(`⚠️ ${item.uid}: ${item.error}`);
    }
    if (!added.length && !changed.length && !errors.length) {
      lines.push("Không có UID nào thay đổi trạng thái.");
    }
  }

  const message = lines.join("\n");
  if (bot && chatId && message) {
    await bot.sendMessage(chatId, message);
  }

  return {
    checked: normalized.length,
    changed,
    added,
    errors,
    details,
    message,
  };
}

async function runScheduledUidChecks() {
  const list = await sheets.listVia();
  const uids = [...new Set(list.map((item) => item.uid).filter(Boolean))];
  if (!uids.length) return { checked: 0, changed: [], added: [], errors: [], details: [], message: "" };
  const chatId = await resolveChatId();
  if (!chatId || !uidBot) return { checked: 0, changed: [], added: [], errors: [], details: [], message: "" };
  return checkUidListNow(uids, { chatId, bot: uidBot, mode: "scheduled" });
}

async function rescheduleUidChecks(bot = uidBot) {
  if (uidTimer) {
    clearTimeout(uidTimer);
    uidTimer = null;
  }
  if (!bot) return null;

  const schedule = await loadSchedule();
  if (!schedule || schedule.disabled || !schedule.times.length) {
    console.log("UID monitor: tắt tự kiểm tra (chưa có khung giờ).");
    return null;
  }

  const next = nextReportAt(schedule.times);
  if (!next) return null;

  const delay = Math.max(300, Math.min(next.delayMs, 2147483647));
  uidTimer = setTimeout(async () => {
    uidTimer = null;
    if (uidBusy) {
      await rescheduleUidChecks(bot);
      return;
    }
    uidBusy = true;
    try {
      await runScheduledUidChecks();
    } catch (err) {
      console.error("Lỗi kiểm tra UID tự động:", err);
      const chatId = await resolveChatId();
      if (chatId) {
        await bot.sendMessage(chatId, `Lỗi lịch check UID: ${err.message || err}`).catch(() => {});
      }
    } finally {
      uidBusy = false;
      await rescheduleUidChecks(bot);
    }
  }, delay);
  return next;
}

async function setUidCheckTimes(rawSchedule) {
  const parsed = parseUidSchedule(rawSchedule);
  if (parsed.error) throw new Error(parsed.error);
  await sheets.setUidCheckTimes(parsed.raw);
  scheduleCache = parsed;
  await rescheduleUidChecks(uidBot);
  return parsed;
}

function describeUidSchedule(cfg) {
  const schedule = cfg || scheduleCache || null;
  if (!schedule) return "Tắt";
  const items = [];
  if (schedule.realtime) items.push("realtime");
  if (Array.isArray(schedule.times)) items.push(...schedule.times);
  if (!items.length) return "Tắt";
  return items.join(", ");
}

async function describeCurrentUidSchedule() {
  const schedule = await loadSchedule();
  return describeUidSchedule(schedule);
}

function getScheduleCache() {
  return scheduleCache;
}

function startUidMonitor(bot) {
  uidBot = bot || null;
  scheduleCache = null;
  cachedChatId = "";
  return rescheduleUidChecks(bot);
}

module.exports = {
  STATUS,
  parseUidList,
  parseUidSchedule,
  checkUidListNow,
  setUidCheckTimes,
  runScheduledUidChecks,
  startUidMonitor,
  describeCurrentUidSchedule,
  loadSchedule,
  getScheduleCache,
};
