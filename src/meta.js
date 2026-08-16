const config = require("./config");
const { isoToDisplay } = require("./utils");

const RESULT_TYPES = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "omni_purchase",
]);

function normalizeAdAccountId(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  return digits || null;
}

function sumResults(actions) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const item of actions) {
    if (RESULT_TYPES.has(item.action_type)) {
      total += Number(item.value) || 0;
    }
  }
  return Math.round(total);
}

async function graphGet(path, params) {
  if (!config.metaAccessToken) {
    throw new Error("Chưa có META_ACCESS_TOKEN trong biến môi trường");
  }
  const url = new URL(`https://graph.facebook.com/${config.metaApiVersion}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", config.metaAccessToken);

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data;
}

async function getCampaignInsights(adAccountId, dateOrRange, options = {}) {
  const actId = normalizeAdAccountId(adAccountId);
  if (!actId) throw new Error("Ad Account ID không hợp lệ");

  let since;
  let until;
  let daily = options.daily;
  if (typeof dateOrRange === "string") {
    since = until = dateOrRange;
    if (daily === undefined) daily = true;
  } else {
    since = dateOrRange.since;
    until = dateOrRange.until || dateOrRange.since;
    if (daily === undefined) daily = since === until;
  }

  const rows = [];
  let path = `/act_${actId}/insights`;
  let params = {
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,reach,impressions,clicks,actions,date_start,date_stop",
    time_range: JSON.stringify({ since, until }),
    limit: 100,
  };
  if (daily) params.time_increment = 1;

  for (let page = 0; page < 20; page += 1) {
    const data = await graphGet(path, params);
    for (const item of data.data || []) {
      rows.push({
        campaignId: item.campaign_id || "",
        name: item.campaign_name || "",
        spend: Math.round(Number(item.spend) || 0),
        reach: Math.round(Number(item.reach || item.impressions) || 0),
        clicks: Math.round(Number(item.clicks) || 0),
        results: sumResults(item.actions),
        impressions: Math.round(Number(item.impressions) || 0),
        date: isoToDisplay(item.date_start || since),
        dateStop: isoToDisplay(item.date_stop || until),
        platform: "Facebook",
      });
    }
    const next = data.paging?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    path = nextUrl.pathname.replace(`/${config.metaApiVersion}`, "") || path;
    params = Object.fromEntries(nextUrl.searchParams.entries());
    delete params.access_token;
  }

  return rows;
}

module.exports = {
  normalizeAdAccountId,
  getCampaignInsights,
};
