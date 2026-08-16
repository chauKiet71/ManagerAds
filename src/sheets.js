const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const config = require("./config");
const { todayStr } = require("./utils");

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
};

module.exports = sheets;
