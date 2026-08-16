# Bot quản lý khách hàng Ads (Telegram + Google Sheet)

Bot Node.js: thêm/xem khách hàng, ngân sách, ngày thu phí dịch vụ. Dữ liệu lưu Google Sheet. Mỗi sáng bot tự nhắc khi đến ngày hết ngân sách hoặc ngày thu phí.

## 1. Tạo bot Telegram

1. Mở [@BotFather](https://t.me/BotFather) → `/newbot` → copy token vào `TELEGRAM_BOT_TOKEN`.
2. Nhắn `/start` cho bot, copy **Chat ID** in ra, gán `TELEGRAM_ADMIN_CHAT_ID` (chỉ tài khoản này dùng được bot).

## 2. Google Sheet + Service Account

1. Tạo [Google Cloud project](https://console.cloud.google.com/) → bật **Google Sheets API**.
2. **APIs & Services → Credentials → Create credentials → Service account**.
3. Mở service account → **Keys → Add key → JSON**. Có thể lưu thành `credentials.json` (không commit file này).
4. Tạo Google Sheet trống. Copy ID trên URL:
   `https://docs.google.com/spreadsheets/d/GOOGLE_SHEET_ID/edit`
5. **Share** sheet cho email service account (quyền Editor), dạng `xxx@xxx.iam.gserviceaccount.com`.

Bot tự tạo 3 tab khi chạy lần đầu: `KhachHang`, `NganSach`, `ThuPhiDV`.

## 3. Cấu hình

```bash
copy .env.example .env
```

Điền token, Sheet ID, và một trong hai cách auth:

- `GOOGLE_CREDENTIALS_PATH=./credentials.json`
- hoặc `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` (giữ `\n` trong private key)

`NOTIFY_HOUR=8` — giờ gửi nhắc (múi giờ VN).

## 4. Chạy

Cần Node.js 18+.

```bash
npm install
npm start
```

Dev (tự reload): `npm run dev`

Bot phải **chạy liên tục** (máy tính / VPS) thì cron mới nhắc đúng ngày.

## Lệnh

Telegram không cho dấu `-` trong lệnh. Dùng dấu `_`.

| Lệnh | Việc |
|---|---|
| `/add_khach_hang` | Thêm KH: tên, lĩnh vực, trạng thái. Ngày tạo lấy hôm nay |
| `/khach_hang` | Menu: đang triển khai / tạm ngưng / tất cả |
| `/dang_trien_khai` | Danh sách đang triển khai |
| `/tam_ngung` | Danh sách tạm ngưng |
| `/doi_trang_thai` | Đổi trạng thái KH |
| `/ngan_sach` | Danh sách ngân sách + ngày hết NS |
| `/them_ngan_sach` | Thêm lần chuyển khoản |
| `/thu_phi_dv` | Danh sách phí DV + ngày thu |
| `/them_thu_phi` | Thêm phí và ngày thu |
| `/sua_thu_phi` | Sửa phí hoặc ngày thu |
| `/huy` | Hủy thao tác đang nhập |

Đến **ngày hết ngân sách** hoặc **ngày thu phí**, bot nhắn cho admin (và các ngày đã quá hạn chưa nhắc, nếu bot từng tắt).

## 5. Deploy lên Railway

Được. Railway chạy bot 24/7 nên cron nhắc phí / hết ngân sách vẫn hoạt động. **Không commit** `.env` hay `credentials.json`.

1. Đẩy code lên GitHub (private repo cũng được).
2. Vào [railway.app](https://railway.app) → **New project** → **Deploy from GitHub repo**.
3. Chọn repo → Railway tự nhận `npm start`.
4. **Variables** → thêm các biến:

| Biến | Giá trị |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | Chat ID của bạn (số khi `/start`) |
| `GOOGLE_SHEET_ID` | ID trên URL Google Sheet |
| `GOOGLE_CREDENTIALS_JSON` | **cả nội dung** file `credentials.json` (một dòng JSON) |
| `TZ` | `Asia/Ho_Chi_Minh` |
| `NOTIFY_HOUR` | `8` |

`GOOGLE_CREDENTIALS_JSON`: mở `credentials.json`, copy toàn bộ từ `{` đến `}`, dán vào Railway. Không upload file.

5. Deploy xong, log phải có `Polling đã bật` và `Health server PORT ...`.
6. Tắt `npm start` trên máy — **chỉ một** process bot (máy + Railway cùng lúc sẽ tranh tin nhắn).

Gói Hobby của Railway tính tiền theo giờ chạy. Bot polling phải online liên tục.
