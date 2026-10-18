const config = require("./config");
const { isoToDisplay } = require("./utils");
const { nativeResult, derivedResult } = require("./metaResults");

function normalizeAdAccountId(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  return digits || null;
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
    const error = new Error(data.error.message || "Meta API error");
    error.code = data.error.code;
    throw error;
  }
  return data;
}

async function graphList(path, params) {
  const rows = [];
  for (let page = 0; page < 100; page += 1) {
    const data = await graphGet(path, params);
    rows.push(...(data.data || []));
    if (!data.paging?.next) return rows;
    const nextUrl = new URL(data.paging.next);
    path = nextUrl.pathname.replace(`/${config.metaApiVersion}`, "");
    params = Object.fromEntries(nextUrl.searchParams.entries());
    delete params.access_token;
  }
  throw new Error("Meta trả về quá nhiều trang; chưa thể tạo báo cáo đầy đủ.");
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
  const path = `/act_${actId}/insights`;
  const params = {
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,reach,impressions,clicks,actions,date_start,date_stop",
    time_range: JSON.stringify({ since, until }),
    use_unified_attribution_setting: true,
    limit: 100,
  };
  if (daily) params.time_increment = 1;

  let campaigns;
  try {
    campaigns = await graphList(path, { ...params, fields: `${params.fields},results` });
  } catch (error) {
    // Older API versions (including v21) may not expose native results.
    if (error.code !== 100 || !/results/i.test(error.message) || !/field|valid/i.test(error.message)) throw error;
    campaigns = await graphList(path, params);
  }
  let delivery = [];
  let adsets = new Map();
  if (campaigns.some((item) => nativeResult(item.results) === null)) {
    const [deliveryRows, settings] = await Promise.all([
      graphList(path, { ...params, level: "adset", fields: "campaign_id,adset_id,spend,impressions,date_start,date_stop" }),
      graphList(`/act_${actId}/adsets`, { fields: "id,optimization_goal,destination_type,promoted_object", limit: 100 }),
    ]);
    delivery = deliveryRows;
    adsets = new Map(settings.map((item) => [item.id, item]));
  }
  for (const item of campaigns) {
    rows.push({
      campaignId: item.campaign_id || "",
      name: item.campaign_name || "",
      spend: Math.round(Number(item.spend) || 0),
      reach: Math.round(Number(item.reach || item.impressions) || 0),
      clicks: Math.round(Number(item.clicks) || 0),
      ...(nativeResult(item.results) || derivedResult(item, delivery, adsets)),
      impressions: Math.round(Number(item.impressions) || 0),
      date: isoToDisplay(item.date_start || since),
      dateStop: isoToDisplay(item.date_stop || until),
      platform: "Facebook",
    });
  }

  return rows;
}

module.exports = {
  normalizeAdAccountId,
  getCampaignInsights,
};
