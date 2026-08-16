const config = require("./config");
const sheets = require("./sheets");
const meta = require("./meta");
const { formatMoney, nowTimeLabel, todayStr, resolveDateRange } = require("./utils");

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("vi-VN");
}

function pct(num, den) {
  const a = Number(num);
  const b = Number(den);
  if (!b || !Number.isFinite(a)) return "—";
  return `${((a / b) * 100).toFixed(2)}%`;
}

function emptyResult(range, customer, error) {
  return {
    ok: !error,
    error: error || "",
    range,
    customer: customer || "",
    items: [],
    totals: { spend: 0, reach: 0, clicks: 0, results: 0, impressions: 0 },
    errors: error ? [error] : [],
  };
}

function sumTotals(items) {
  return items.reduce(
    (acc, row) => {
      acc.spend += Number(row.spend) || 0;
      acc.reach += Number(row.reach) || 0;
      acc.clicks += Number(row.clicks) || 0;
      acc.results += Number(row.results) || 0;
      acc.impressions += Number(row.impressions) || 0;
      return acc;
    },
    { spend: 0, reach: 0, clicks: 0, results: 0, impressions: 0 }
  );
}

async function loadCampaignInsights({ customer, since, until }) {
  const range = { since, until };
  if (!config.metaAccessToken) {
    return emptyResult(range, customer, "Chưa có META_ACCESS_TOKEN.");
  }

  let accounts = await sheets.listAdAccounts();
  if (customer) {
    const want = customer.trim().toLowerCase();
    accounts = accounts.filter((a) => a.customer.trim().toLowerCase() === want);
  }
  if (!accounts.length) {
    return emptyResult(
      range,
      customer,
      customer
        ? `Chưa gán Ad Account cho "${customer}". Dùng /gan_ad_account.`
        : "Chưa gán Ad Account. Dùng /gan_ad_account trước."
    );
  }

  const items = [];
  const errors = [];
  for (const acc of accounts) {
    try {
      const rows = await meta.getCampaignInsights(
        acc.adAccountId,
        { since, until },
        { daily: false }
      );
      for (const row of rows) {
        items.push({
          ...row,
          customer: acc.customer,
        });
      }
    } catch (err) {
      console.error("Load insights lỗi", acc.customer, err);
      errors.push(`${acc.customer}: ${err.message || err}`);
    }
  }

  items.sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
  return {
    ok: errors.length < accounts.length,
    error: "",
    range,
    customer: customer || "",
    items,
    totals: sumTotals(items),
    errors,
  };
}

function campaignActionsKeyboard(hasCustomer) {
  const rows = [
    [
      { text: "📅 Đổi thời gian", callback_data: "go:ads-range" },
      { text: "« Khách khác", callback_data: "go:campaign-menu" },
    ],
    [
      { text: "➕ Nhập tay", callback_data: "go:add-campaign" },
      { text: "✏️ Sửa", callback_data: "go:edit-campaign" },
    ],
  ];
  if (!hasCustomer) {
    rows[0][1] = { text: "« Chọn khách", callback_data: "go:campaign-menu" };
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function formatPeriodReport(result, rangeInfo) {
  const titleRange = rangeInfo.display || rangeInfo.label;
  const who = result.customer ? ` — ${result.customer.toUpperCase()}` : "";
  if (result.error && !result.items.length) {
    return `📊 CHIẾN DỊCH${who}\n${titleRange}\n\n${result.error}`;
  }
  if (!result.items.length) {
    const lines = [
      `📊 CHIẾN DỊCH${who}`,
      titleRange,
      "",
      "Không có số liệu trong khoảng này (chiến dịch có thể chưa chạy).",
    ];
    if (result.errors.length) {
      lines.push("", "Lỗi:", ...result.errors.slice(0, 5).map((e) => `- ${e}`));
    }
    return lines.join("\n");
  }

  const t = result.totals;
  const lines = [
    `📊 CHIẾN DỊCH${who} (${result.items.length})`,
    `${rangeInfo.label} · ${titleRange}`,
    "",
    `Tổng chi tiêu: ${formatMoney(t.spend)}`,
    `Tiếp cận: ${formatCount(t.reach)}  |  Click: ${formatCount(t.clicks)}`,
    `Kết quả: ${formatCount(t.results)}  |  CTR: ${pct(t.clicks, t.impressions || t.reach)}`,
    "",
  ];
  result.items.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name || "—"}`);
    if (!result.customer) lines.push(`   Khách: ${c.customer || "—"}`);
    lines.push(`   Chi tiêu: ${c.spend ? formatMoney(c.spend) : "—"}`);
    lines.push(`   Tiếp cận: ${formatCount(c.reach)}  |  Click: ${formatCount(c.clicks)}`);
    lines.push(`   Kết quả: ${formatCount(c.results)}  |  CTR: ${pct(c.clicks, c.impressions || c.reach)}`);
    lines.push("");
  });
  if (result.errors.length) {
    lines.push("Lỗi:");
    result.errors.slice(0, 5).forEach((e) => lines.push(`- ${e}`));
  }
  return lines.join("\n").trim();
}

function formatDigestReport(result, rangeInfo) {
  const time = nowTimeLabel();
  const header = [
    `📊 QUẢNG CÁO — ${rangeInfo.label}`,
    `${rangeInfo.display} · ${todayStr()} ${time}`,
    "Số Meta có thể chậm vài phút so với Ads Manager.",
    "",
  ];
  if (result.error && !result.items.length) {
    return header.join("\n") + result.error;
  }
  if (!result.items.length) {
    return header.join("\n") + "Chưa có chi tiêu trong khoảng này.";
  }

  const byCustomer = new Map();
  for (const row of result.items) {
    const key = row.customer || "—";
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key).push(row);
  }

  const lines = [...header];
  for (const [name, rows] of byCustomer) {
    const tot = sumTotals(rows);
    lines.push(`▸ ${name}`);
    lines.push(
      `  Chi tiêu: ${formatMoney(tot.spend)}  |  KQ: ${formatCount(tot.results)}`
    );
    lines.push(
      `  Tiếp cận: ${formatCount(tot.reach)}  |  Click: ${formatCount(tot.clicks)}`
    );
    rows.slice(0, 8).forEach((c) => {
      lines.push(
        `  • ${c.name || "—"} — ${c.spend ? formatMoney(c.spend) : "0 đ"} — KQ ${formatCount(c.results)}`
      );
    });
    if (rows.length > 8) lines.push(`  … +${rows.length - 8} chiến dịch`);
    lines.push("");
  }
  const t = result.totals;
  lines.push(
    `Tổng: ${formatMoney(t.spend)}  |  KQ ${formatCount(t.results)}  |  Click ${formatCount(t.clicks)}`
  );
  if (result.errors.length) {
    lines.push("", "Lỗi:");
    result.errors.slice(0, 5).forEach((e) => lines.push(`- ${e}`));
  }
  return lines.join("\n").trim();
}

async function replyInsights(ctx, { customer, rangeKey, custom }) {
  const range = resolveDateRange(rangeKey, custom);
  await ctx.reply(`Đang kéo số Facebook Ads — ${range.label} (${range.display || range.label})...`);
  const result = await loadCampaignInsights({
    customer,
    since: range.since,
    until: range.until,
  });
  const text = formatPeriodReport(result, range);
  const chunks = splitTelegram(text);
  const keyboard = campaignActionsKeyboard(!!customer);
  for (let i = 0; i < chunks.length; i += 1) {
    await ctx.reply(chunks[i], i === chunks.length - 1 ? keyboard : {});
  }
}

function splitTelegram(text) {
  const max = 3900;
  if (text.length <= max) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < 800) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

module.exports = {
  loadCampaignInsights,
  formatPeriodReport,
  formatDigestReport,
  campaignActionsKeyboard,
  splitTelegram,
  replyInsights,
};
