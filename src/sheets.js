const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const config = require("./config");
const { todayStr, parseReportTimes, DEFAULT_REPORT_TIMES } = require("./utils");

const SHEETS = {
  customers: {
    title: "KhachHang",
    headers: ["ID", "Tên khách hàng", "Lĩnh vực", "Trạng thái", "Thời gian"],
  },
  budgets: {
    title: "NganSach",
    headers: [
      "ID",
      "Khách hàng",
      "Ngân sách",
      "Ngày chuyển khoản",
      "Ngày hết ngân sách",
      "Đã thông báo",
    ],
  },
  fees: {
    title: "ThuPhiDV",
    headers: ["ID", "Khách hàng", "Phí dịch vụ", "Ngày thu phí dịch vụ", "Đã thông báo"],
  },
  campaigns: {
    title: "ChienDich",
    headers: [
      "ID",
      "Khách hàng",
      "Tên chiến dịch",
      "Nền tảng",
      "Chi tiêu",
      "Tiếp cận",
      "Click",
      "Kết quả",
      "Ngày",
      "Campaign ID",
    ],
  },
  adAccounts: {
    title: "TaiKhoanAds",
    headers: ["ID", "Khách hàng", "Ad Account ID"],
  },
  settings: {
    title: "CaiDat",
    headers: ["Key", "Value"],
  },
};

const STATUS = {
  ACTIVE: "Đang triển khai",
  PAUSED: "Tạm ngưng",
};

let doc;

function auth() {
  return new JWT({
    email: config.googleEmail,
    key: config.googleKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheet(key) {
  const meta = SHEETS[key];
  let sheet = doc.sheetsByTitle[meta.title];
  if (!sheet) {
    sheet = await doc.addSheet({
      title: meta.title,
      headerValues: meta.headers,
    });
  } else {
    await sheet.loadHeaderRow();
    const current = (sheet.headerValues || []).filter(Boolean);
    if (current.length === 0) {
      await sheet.setHeaderRow(meta.headers);
    } else {
      const missing = meta.headers.filter((h) => !current.includes(h));
      if (missing.length) {
        await sheet.setHeaderRow([...current, ...missing]);
      }
    }
  }
  return sheet;
}

async function nextId(sheet, prefix) {
  const rows = await sheet.getRows();
  let max = 0;
  for (const row of rows) {
    const id = String(row.get("ID") || "");
    const num = Number(id.replace(/[^\d]/g, ""));
    if (num > max) max = num;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function mapCustomer(row) {
  return {
    id: row.get("ID") || "",
    name: row.get("Tên khách hàng") || "",
    field: row.get("Lĩnh vực") || "",
    status: (row.get("Trạng thái") || "").trim(),
    createdAt: row.get("Thời gian") || "",
    _row: row,
  };
}

function mapBudget(row) {
  return {
    id: row.get("ID") || "",
    customer: row.get("Khách hàng") || "",
    amount: row.get("Ngân sách") || "",
    transferDate: row.get("Ngày chuyển khoản") || "",
    expireDate: row.get("Ngày hết ngân sách") || "",
    notified: String(row.get("Đã thông báo") || "").toLowerCase() === "true",
    _row: row,
  };
}

function mapCampaign(row) {
  return {
    id: row.get("ID") || "",
    customer: row.get("Khách hàng") || "",
    name: row.get("Tên chiến dịch") || "",
    platform: row.get("Nền tảng") || "",
    spend: row.get("Chi tiêu") || "",
    reach: row.get("Tiếp cận") || "",
    clicks: row.get("Click") || "",
    results: row.get("Kết quả") || "",
    date: row.get("Ngày") || "",
    campaignId: row.get("Campaign ID") || "",
    _row: row,
  };
}

function mapAdAccount(row) {
  return {
    id: row.get("ID") || "",
    customer: row.get("Khách hàng") || "",
    adAccountId: String(row.get("Ad Account ID") || "").replace(/[^\d]/g, ""),
    _row: row,
  };
}

function mapFee(row) {
  return {
    id: row.get("ID") || "",
    customer: row.get("Khách hàng") || "",
    amount: row.get("Phí dịch vụ") || "",
    feeDate: row.get("Ngày thu phí dịch vụ") || "",
    notified: String(row.get("Đã thông báo") || "").toLowerCase() === "true",
    _row: row,
  };
}

const sheets = {
  async init() {
    doc = new GoogleSpreadsheet(config.sheetId, auth());
    await doc.loadInfo();
    await getSheet("customers");
    await getSheet("budgets");
    await getSheet("fees");
    await getSheet("campaigns");
    await getSheet("adAccounts");
    await getSheet("settings");
  },

  STATUS,

  async listCustomers(status) {
    const sheet = await getSheet("customers");
    const rows = await sheet.getRows();
    let items = rows.map(mapCustomer).filter((c) => c.name);
    if (status) {
      const want = status.toLowerCase();
      items = items.filter((c) => c.status.toLowerCase() === want);
    }
    return items;
  },

  async findCustomerByName(name) {
    const all = await this.listCustomers();
    const target = name.trim().toLowerCase();
    return all.find((c) => c.name.trim().toLowerCase() === target) || null;
  },

  async addCustomer({ name, field, status }) {
    const sheet = await getSheet("customers");
    const id = await nextId(sheet, "KH");
    await sheet.addRow({
      ID: id,
      "Tên khách hàng": name.trim(),
      "Lĩnh vực": field.trim(),
      "Trạng thái": status,
      "Thời gian": todayStr(),
    });
    return { id, name: name.trim(), field: field.trim(), status, createdAt: todayStr() };
  },

  async updateCustomerStatus(id, status) {
    const all = await this.listCustomers();
    const item = all.find((c) => c.id === id);
    if (!item) return null;
    item._row.set("Trạng thái", status);
    await item._row.save();
    return { ...item, status };
  },

  async listBudgets() {
    const sheet = await getSheet("budgets");
    const rows = await sheet.getRows();
    return rows.map(mapBudget).filter((b) => b.customer);
  },

  async addBudget({ customer, amount, transferDate, expireDate }) {
    const sheet = await getSheet("budgets");
    const id = await nextId(sheet, "NS");
    await sheet.addRow({
      ID: id,
      "Khách hàng": customer,
      "Ngân sách": amount,
      "Ngày chuyển khoản": transferDate,
      "Ngày hết ngân sách": expireDate,
      "Đã thông báo": "false",
    });
    return { id, customer, amount, transferDate, expireDate };
  },

  async markBudgetNotified(id) {
    const all = await this.listBudgets();
    const item = all.find((b) => b.id === id);
    if (!item) return;
    item._row.set("Đã thông báo", "true");
    await item._row.save();
  },

  async listFees() {
    const sheet = await getSheet("fees");
    const rows = await sheet.getRows();
    return rows.map(mapFee).filter((f) => f.customer);
  },

  async upsertFee({ customer, amount, feeDate }) {
    const sheet = await getSheet("fees");
    const all = await this.listFees();
    const existing = all.find(
      (f) => f.customer.trim().toLowerCase() === customer.trim().toLowerCase()
    );
    if (existing) {
      existing._row.set("Phí dịch vụ", amount);
      existing._row.set("Ngày thu phí dịch vụ", feeDate);
      existing._row.set("Đã thông báo", "false");
      await existing._row.save();
      return { ...existing, amount, feeDate, notified: false };
    }
    const id = await nextId(sheet, "TP");
    await sheet.addRow({
      ID: id,
      "Khách hàng": customer,
      "Phí dịch vụ": amount,
      "Ngày thu phí dịch vụ": feeDate,
      "Đã thông báo": "false",
    });
    return { id, customer, amount, feeDate };
  },

  async markFeeNotified(id) {
    const all = await this.listFees();
    const item = all.find((f) => f.id === id);
    if (!item) return;
    item._row.set("Đã thông báo", "true");
    await item._row.save();
  },

  async listCampaigns(customer) {
    const sheet = await getSheet("campaigns");
    const rows = await sheet.getRows();
    let items = rows.map(mapCampaign).filter((c) => c.customer || c.name);
    if (customer) {
      const want = customer.trim().toLowerCase();
      items = items.filter((c) => c.customer.trim().toLowerCase() === want);
    }
    return items;
  },

  async addCampaign(data) {
    const sheet = await getSheet("campaigns");
    const id = await nextId(sheet, "CD");
    await sheet.addRow({
      ID: id,
      "Khách hàng": data.customer,
      "Tên chiến dịch": data.name,
      "Nền tảng": data.platform,
      "Chi tiêu": data.spend,
      "Tiếp cận": data.reach,
      "Click": data.clicks,
      "Kết quả": data.results,
      Ngày: data.date,
      "Campaign ID": data.campaignId || "",
    });
    return { id, ...data };
  },

  async upsertCampaignByMeta(data) {
    const all = await this.listCampaigns();
    const existing = all.find(
      (c) =>
        c.campaignId &&
        c.campaignId === data.campaignId &&
        c.date === data.date
    );
    if (existing) {
      existing._row.set("Khách hàng", data.customer);
      existing._row.set("Tên chiến dịch", data.name);
      existing._row.set("Nền tảng", data.platform || "Facebook");
      existing._row.set("Chi tiêu", data.spend);
      existing._row.set("Tiếp cận", data.reach);
      existing._row.set("Click", data.clicks);
      existing._row.set("Kết quả", data.results);
      existing._row.set("Ngày", data.date);
      existing._row.set("Campaign ID", data.campaignId);
      await existing._row.save();
      return { ...existing, ...data, updated: true };
    }
    const created = await this.addCampaign({
      ...data,
      platform: data.platform || "Facebook",
    });
    return { ...created, updated: false };
  },

  async updateCampaign(id, data) {
    const all = await this.listCampaigns();
    const item = all.find((c) => c.id === id);
    if (!item) return null;
    item._row.set("Tên chiến dịch", data.name);
    item._row.set("Nền tảng", data.platform);
    item._row.set("Chi tiêu", data.spend);
    item._row.set("Tiếp cận", data.reach);
    item._row.set("Click", data.clicks);
    item._row.set("Kết quả", data.results);
    item._row.set("Ngày", data.date);
    if (data.campaignId) item._row.set("Campaign ID", data.campaignId);
    await item._row.save();
    return { ...item, ...data };
  },

  async listAdAccounts() {
    const sheet = await getSheet("adAccounts");
    const rows = await sheet.getRows();
    return rows.map(mapAdAccount).filter((a) => a.customer && a.adAccountId);
  },

  async upsertAdAccount({ customer, adAccountId }) {
    const sheet = await getSheet("adAccounts");
    const all = await this.listAdAccounts();
    const existing = all.find(
      (a) => a.customer.trim().toLowerCase() === customer.trim().toLowerCase()
    );
    const idValue = String(adAccountId).replace(/[^\d]/g, "");
    if (existing) {
      existing._row.set("Ad Account ID", idValue);
      await existing._row.save();
      return { ...existing, adAccountId: idValue };
    }
    const id = await nextId(sheet, "AD");
    await sheet.addRow({
      ID: id,
      "Khách hàng": customer,
      "Ad Account ID": idValue,
    });
    return { id, customer, adAccountId: idValue };
  },

  async getSetting(key) {
    const sheet = await getSheet("settings");
    const rows = await sheet.getRows();
    const row = rows.find((r) => String(r.get("Key") || "") === key);
    if (!row) return null;
    return String(row.get("Value") ?? "");
  },

  async setSetting(key, value) {
    const sheet = await getSheet("settings");
    const rows = await sheet.getRows();
    const existing = rows.find((r) => String(r.get("Key") || "") === key);
    if (existing) {
      existing.set("Value", value);
      await existing.save();
      return;
    }
    await sheet.addRow({ Key: key, Value: value });
  },

  async getReportTimes() {
    const raw = await this.getSetting("ads_report_times");
    if (raw === null) {
      const fallback = parseReportTimes(config.adsReportHours);
      return fallback.times?.length ? fallback.times : DEFAULT_REPORT_TIMES;
    }
    if (!String(raw).trim()) return [];
    const parsed = parseReportTimes(raw);
    return parsed.error ? [] : parsed.times;
  },

  async setReportTimes(times) {
    await this.setSetting("ads_report_times", (times || []).join(","));
    return times || [];
  },
};

module.exports = sheets;
