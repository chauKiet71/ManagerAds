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

Bot tự tạo tab khi chạy lần đầu: `KhachHang`, `NganSach`, `ThuPhiDV`, `ChienDich`, `TaiKhoanAds`, `CaiDat`.

## 3. Cấu hình

```bash
copy .env.example .env
```

Điền token, Sheet ID, và một trong hai cách auth:

- `GOOGLE_CREDENTIALS_PATH=./credentials.json`
- hoặc `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` (giữ `\n` trong private key)

`NOTIFY_HOUR=8` — giờ gửi nhắc hết ngân sách / thu phí (múi giờ VN).

`META_ACCESS_TOKEN` — token System User Facebook (quyền `ads_read`). Không bắt buộc lúc khởi động; thiếu thì `/dong_bo_ads` và cron 7:15 không kéo được số.

`META_API_VERSION` — mặc định `v21.0`.

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
| `/sua_ngan_sach` | Sửa số tiền, ngày CK, ngày hết NS |
| `/thu_phi_dv` | Danh sách phí DV + ngày thu |
| `/them_thu_phi` | Thêm phí và ngày thu |
| `/sua_thu_phi` | Sửa phí hoặc ngày thu |
| `/chien_dich` | Xem thông số: chọn hôm nay, hôm qua, 7/14/28/30 ngày, tuần, tháng, hoặc tùy chọn ngày |
| `/gio_bao_cao` | Xem các mốc giờ tự gửi chỉ số |
| `/dat_gio_bao_cao` | Đặt / tắt giờ gửi (ví dụ `8, 12, 16:30, 20, 23`) |
| `/gui_bao_cao` | Gửi chỉ số hôm nay ngay |
| `/gan_ad_account` | Gán Ad Account Facebook cho một khách |
| `/dong_bo_ads` | Kéo số **hôm qua** từ Marketing API vào tab ChienDich |
| `/them_chien_dich` | Nhập chi tiêu, tiếp cận, click, kết quả |
| `/sua_chien_dich` | Sửa thông số chiến dịch |
| `/huy` | Hủy thao tác đang nhập |

Đến **ngày hết ngân sách** hoặc **ngày thu phí**, bot nhắn cho admin (và các ngày đã quá hạn chưa nhắc, nếu bot từng tắt).

Mỗi sáng **7:15** (giờ VN) bot lưu số Facebook Ads hôm qua vào Sheet.

Bot tự gửi **chỉ số hôm nay** theo giờ bạn đặt (`/dat_gio_bao_cao`, mặc định 08:00 · 12:00 · 16:00 · 20:00 · 23:00, giờ VN). `/gui_bao_cao` để gửi thử ngay. Số Meta có thể chậm vài phút so với Ads Manager.

## Facebook Ads (kéo số tự động)

Bot **không đăng nhập Ads Manager**. Một token Business Manager dùng chung, mỗi khách map với Ad Account ID.

1. Trong [Meta Business Suite](https://business.facebook.com) → **Cài đặt doanh nghiệp** → **Người dùng hệ thống** (System User): tạo user, gán quyền **Quảng cáo** trên các Ad Account của khách, tạo token quyền `ads_read`.
2. Copy **Ad Account ID** từng khách (URL Ads Manager: `act=123456789` hoặc `act_123456789`).
3. Đưa token vào `META_ACCESS_TOKEN` (file `.env` local và Railway Variables). **Không** ghi token vào Google Sheet.
4. Trong Telegram: `/gan_ad_account` cho từng khách, rồi `/dong_bo_ads` lần đầu để kiểm tra token.

Token System User không hết hạn nếu không bị thu hồi. Số kéo về (level = campaign, mặc định hôm qua): tên, chi tiêu, tiếp cận, click, kết quả (tin nhắn / lead / purchase). Tab `ChienDich` upsert theo `Campaign ID + Ngày` nên không nhân dòng.

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
| `META_ACCESS_TOKEN` | token System User (`ads_read`) |
| `META_API_VERSION` | `v21.0` (không bắt buộc) |

`GOOGLE_CREDENTIALS_JSON`: mở `credentials.json`, copy toàn bộ từ `{` đến `}`, dán vào Railway. Không upload file.

5. Deploy xong, log phải có `Polling đã bật` và `Health server PORT ...`.
6. Tắt `npm start` trên máy — **chỉ một** process bot (máy + Railway cùng lúc sẽ tranh tin nhắn).

Gói Hobby của Railway tính tiền theo giờ chạy. Bot polling phải online liên tục.
