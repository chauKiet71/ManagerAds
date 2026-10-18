// A campaign's Results column represents one metric, never a sum of action types.
const LABELS = {
  "onsite_conversion.messaging_conversation_started_7d": "Lượt bắt đầu cuộc trò chuyện",
  "offsite_conversion.fb_pixel_purchase": "Lượt mua trên web",
  landing_page_view: "Lượt xem trang đích",
  link_click: "Lượt nhấp vào liên kết",
  lead: "Khách hàng tiềm năng",
  "offsite_conversion.fb_pixel_lead": "Khách hàng tiềm năng trên web",
  post_engagement: "Lượt tương tác với bài viết",
  like: "Lượt thích Trang",
  reach: "Tiếp cận",
  impressions: "Lượt hiển thị",
};

function result(value, type, source) {
  return { results: value, resultType: type, resultLabel: LABELS[type] || type, resultSource: source };
}

function unknownResult(label = "Chưa xác định") {
  return { results: null, resultType: "", resultLabel: label, resultSource: "unknown" };
}

function nativeResult(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  // Different indicators or attribution windows cannot safely be added together.
  if (entries.length !== 1) return unknownResult("Nhiều loại kết quả");
  const entry = entries[0];
  if (!entry?.indicator || !Array.isArray(entry.values)) return unknownResult();
  const type = entry.indicator.replace(/^actions:/, "");
  if (entry.values.length === 0) return result(null, type, "meta");
  if (entry.values.length !== 1) return unknownResult("Nhiều cửa sổ ghi nhận");
  const raw = entry.values[0]?.value;
  const value = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? result(value, type, "meta") : unknownResult();
}

function metricForAdset(adset) {
  if (!adset) return null;
  const goal = adset.optimization_goal;
  const direct = {
    CONVERSATIONS: "onsite_conversion.messaging_conversation_started_7d",
    LANDING_PAGE_VIEWS: "landing_page_view",
    LINK_CLICKS: "link_click",
    POST_ENGAGEMENT: "post_engagement",
    PAGE_LIKES: "like",
    REACH: "reach",
    IMPRESSIONS: "impressions",
  };
  if (direct[goal]) return direct[goal];
  if (goal === "LEAD_GENERATION" && adset.destination_type === "ON_AD") return "lead";
  if (["OFFSITE_CONVERSIONS", "VALUE"].includes(goal) && adset.destination_type === "WEBSITE") {
    const promoted = adset.promoted_object || {};
    if (promoted.custom_conversion_id) return `offsite_conversion.custom.${promoted.custom_conversion_id}`;
    const events = { PURCHASE: "purchase", LEAD: "lead", COMPLETE_REGISTRATION: "complete_registration", ADD_TO_CART: "add_to_cart", INITIATED_CHECKOUT: "initiate_checkout" };
    if (events[promoted.custom_event_type]) return `offsite_conversion.fb_pixel_${events[promoted.custom_event_type]}`;
  }
  return null;
}

function derivedResult(campaign, delivery, adsets) {
  const relevant = delivery.filter((row) => row.campaign_id === campaign.campaign_id &&
    row.date_start === campaign.date_start && row.date_stop === campaign.date_stop &&
    (Number(row.impressions) > 0 || Number(row.spend) > 0));
  if (!relevant.length) return unknownResult();
  const metrics = relevant.map((row) => metricForAdset(adsets.get(row.adset_id)));
  if (metrics.some((metric) => !metric)) return unknownResult();
  if (new Set(metrics).size !== 1) return unknownResult("Nhiều loại kết quả");
  const type = metrics[0];
  // Use campaign-grain values: reach, for example, cannot be summed across ad sets.
  const raw = ["reach", "impressions"].includes(type)
    ? campaign[type]
    : (campaign.actions || []).find((action) => action.action_type === type)?.value;
  const value = raw == null ? 0 : Number(raw);
  return Number.isFinite(value) && value >= 0 ? result(value, type, "optimization_goal") : unknownResult();
}

module.exports = { nativeResult, derivedResult };
