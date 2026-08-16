const config = require("./config");
const sheets = require("./sheets");
const meta = require("./meta");
const { yesterdayIso, yesterdayStr } = require("./utils");

async function syncYesterday() {
  if (!config.metaAccessToken) {
    return {
      ok: false,
      error: "Chưa có META_ACCESS_TOKEN. Thêm token System User vào .env / Railway.",
      accounts: 0,
      campaigns: 0,
      created: 0,
      updated: 0,
      errors: [],
      date: yesterdayStr(),
    };
  }

  const accounts = await sheets.listAdAccounts();
  if (!accounts.length) {
    return {
      ok: false,
      error: "Chưa gán Ad Account. Dùng /gan_ad_account trước.",
      accounts: 0,
      campaigns: 0,
      created: 0,
      updated: 0,
      errors: [],
      date: yesterdayStr(),
    };
  }

  const iso = yesterdayIso();
  const displayDate = yesterdayStr();
  const errors = [];
  let campaigns = 0;
  let created = 0;
  let updated = 0;

  for (const acc of accounts) {
    try {
      const rows = await meta.getCampaignInsights(acc.adAccountId, iso);
      for (const row of rows) {
        if (!row.campaignId) continue;
        const saved = await sheets.upsertCampaignByMeta({
          customer: acc.customer,
          campaignId: row.campaignId,
          name: row.name,
          platform: "Facebook",
          spend: row.spend,
          reach: row.reach,
          clicks: row.clicks,
          results: row.results,
          date: row.date || displayDate,
        });
        campaigns += 1;
        if (saved.updated) updated += 1;
        else created += 1;
      }
    } catch (err) {
      console.error("Sync ads lỗi", acc.customer, err);
      errors.push(`${acc.customer} (${acc.adAccountId}): ${err.message || err}`);
    }
  }

  return {
    ok: errors.length < accounts.length,
    accounts: accounts.length,
    campaigns,
    created,
    updated,
    errors,
    date: displayDate,
  };
}

function formatSyncResult(result) {
  if (result.error && !result.accounts) {
    return `Không đồng bộ được Facebook Ads.\n${result.error}`;
  }
  const lines = [
    `Đã kéo số Facebook Ads — ngày ${result.date}`,
    "",
    `Tài khoản: ${result.accounts}`,
    `Chiến dịch: ${result.campaigns} (mới ${result.created}, cập nhật ${result.updated})`,
  ];
  if (result.errors.length) {
    lines.push("", "Lỗi:");
    result.errors.slice(0, 8).forEach((e) => lines.push(`- ${e}`));
  }
  return lines.join("\n");
}

module.exports = { syncYesterday, formatSyncResult };
