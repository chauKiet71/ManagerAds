const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { nativeResult, derivedResult } = require("../src/metaResults");

const date = { date_start: "2026-10-18", date_stop: "2026-10-18" };
const actions = [
  ["onsite_conversion.messaging_conversation_started_7d", "24"],
  ["onsite_conversion.total_messaging_connection", "30"],
  ["offsite_conversion.fb_pixel_purchase", "3"],
  ["purchase", "5"], ["omni_purchase", "5"],
  ["landing_page_view", "57"], ["lead", "9"],
].map(([action_type, value]) => ({ action_type, value }));
const campaign = { ...date, campaign_id: "c1", campaign_name: "Example", impressions: "1000", spend: "100", reach: "812", actions };
const delivered = { ...date, campaign_id: "c1", adset_id: "a1", impressions: "1000", spend: "100" };

function loadModule(file, mocks, globals = {}) {
  const context = {
    module: { exports: {} }, URL, AbortSignal, console,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    }, ...globals,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), context);
  return context.module.exports;
}

for (const [name, settings, expected] of [
  ["messages", { optimization_goal: "CONVERSATIONS" }, 24],
  ["website purchases", { optimization_goal: "OFFSITE_CONVERSIONS", destination_type: "WEBSITE", promoted_object: { custom_event_type: "PURCHASE" } }, 3],
  ["landing page views", { optimization_goal: "LANDING_PAGE_VIEWS" }, 57],
]) {
  test(`Select ${name} without adding unrelated or overlapping actions`, () => {
    const result = derivedResult(campaign, [delivered], new Map([["a1", settings]]));
    assert.equal(result.results, expected);
    assert.ok(result.resultLabel);
  });
}

test("Missing selected action is zero; unknown or mixed goals remain unknown", () => {
  const settings = new Map([["a1", { optimization_goal: "CONVERSATIONS" }]]);
  assert.equal(derivedResult({ ...campaign, actions: [] }, [delivered], settings).results, 0);
  assert.equal(derivedResult(campaign, [delivered], new Map()).results, null);
  settings.set("a2", { optimization_goal: "LANDING_PAGE_VIEWS" });
  assert.equal(derivedResult(campaign, [delivered, { ...delivered, adset_id: "a2" }], settings).results, null);
  assert.equal(derivedResult(campaign, [delivered, { ...delivered, adset_id: "a2", spend: "0", impressions: "0" }], settings).results, 24);
});

test("Reach is read at campaign grain, not added across ad sets", () => {
  const settings = new Map(["a1", "a2"].map((id) => [id, { optimization_goal: "REACH" }]));
  assert.equal(derivedResult(campaign, [delivered, { ...delivered, adset_id: "a2" }], settings).results, 812);
});

test("Native result preserves one value, and never sums indicators or windows", () => {
  const entry = { indicator: "actions:landing_page_view", values: [{ value: "57", attribution_windows: ["7d_click", "1d_view"] }] };
  assert.equal(nativeResult([entry]).results, 57);
  assert.equal(nativeResult([{ ...entry, values: [{ value: "0" }] }]).results, 0);
  assert.equal(nativeResult([{ ...entry, values: [] }]).results, null);
  assert.equal(nativeResult([entry, entry]).results, null);
  assert.equal(nativeResult([{ ...entry, values: [{ value: "57" }, { value: "20" }] }]).results, null);
  assert.equal(nativeResult([]), null);
});

function metaWithFetch(handler) {
  return loadModule("meta.js", {
    "./config": { metaAccessToken: "test-token", metaApiVersion: "v21.0" },
    "./utils": { isoToDisplay: (value) => value },
    "./metaResults": { nativeResult, derivedResult },
  }, { fetch: async (url) => ({ json: async () => handler(url) }) });
}

test("Native API result overrides actions and uses configured attribution", async () => {
  const meta = metaWithFetch((url) => {
    assert.equal(url.searchParams.get("use_unified_attribution_setting"), "true");
    assert.equal(url.searchParams.get("time_increment"), "1");
    assert.ok(url.searchParams.get("fields").split(",").includes("results"));
    return { data: [{ ...campaign, results: [{ indicator: "actions:landing_page_view", values: [{ value: "57" }] }] }] };
  });
  const rows = await meta.getCampaignInsights("act_123", date.date_start);
  assert.equal(rows[0].results, 57);
});

test("Older API fallback paginates ad set settings and selects conversation count", async () => {
  let requests = 0;
  const meta = metaWithFetch((url) => {
    requests++;
    if (url.pathname.endsWith("/adsets")) {
      if (url.searchParams.get("after")) return { data: [{ id: "a1", optimization_goal: "CONVERSATIONS" }] };
      return { data: [], paging: { next: "https://graph.facebook.com/v21.0/act_123/adsets?after=next" } };
    }
    if (url.searchParams.get("level") === "adset") return { data: [delivered] };
    if (url.searchParams.get("fields").split(",").includes("results")) return { error: { code: 100, message: "results is not valid for fields param" } };
    return { data: [campaign] };
  });
  const rows = await meta.getCampaignInsights("123", date.date_start);
  assert.equal(rows[0].results, 24);
  assert.equal(requests, 5);
});

test("Authentication errors propagate without retrying as unsupported fields", async () => {
  let calls = 0;
  const meta = metaWithFetch(() => { calls++; return { error: { code: 190, message: "Invalid token" } }; });
  await assert.rejects(meta.getCampaignInsights("123", date.date_start), /Invalid token/);
  assert.equal(calls, 1);
});

test("Digest shows selected labels, and mixed/unknown result totals as dash", async () => {
  const api = loadModule("adsReport.js", {
    "./config": { metaAccessToken: "test" },
    "./sheets": { listAdAccounts: async () => [{ adAccountId: "123", customer: "NDK" }] },
    "./meta": { getCampaignInsights: async () => [
      { name: "Messages", results: 24, resultType: "messages", resultLabel: "Lượt bắt đầu cuộc trò chuyện" },
      { name: "Purchases", results: 3, resultType: "purchase", resultLabel: "Lượt mua trên web" },
      { name: "Unknown", results: null, resultType: "", resultLabel: "Chưa xác định" },
    ] },
    "./utils": { formatMoney: String, nowTimeLabel: () => "12:00", todayStr: () => date.date_start },
  });
  const report = await api.loadCampaignInsights({ since: date.date_start, until: date.date_stop });
  assert.equal(report.totals.results, null);
  const text = api.formatDigestReport(report, { label: "Today", display: "18/10" });
  assert.match(text, /KQ 24 \(Lượt bắt đầu cuộc trò chuyện\)/);
  assert.match(text, /KQ 3 \(Lượt mua trên web\)/);
  assert.match(text, /KQ — \(Chưa xác định\)/);
  assert.match(text, /Tổng: .*KQ —/);
});
