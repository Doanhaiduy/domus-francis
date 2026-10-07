# VẬN HÀNH — Lưu Xá Phanxicô

Sổ tay cho người trực hệ thống (Admin / người kỹ thuật). Quy trình phát hành và quy ước mã nguồn: xem `CLAUDE.md`.

## 1. Địa chỉ & thành phần

| Môi trường | Địa chỉ | Supabase | Nhánh |
|---|---|---|---|
| staging | https://domus-francis.vercel.app | `mxwlphjyxnrwrnfgiinr` | `staging` |
| production | https://domus-francis-production.vercel.app | `hpevzmhdfmzczhgqjmnj` | `master` |

Thành phần: Vercel (Next.js, cron), Supabase (PostgreSQL + Storage), Groq/Gemini (AI, tùy chọn), Resend (email), Web Push (VAPID), SePay/Casso (báo biến động số dư, tùy chọn), Cloudflare Turnstile (CAPTCHA, tùy chọn).

## 2. Giám sát

- **Sống/sẵn sàng**: `GET /api/health` → 200 `{status:"ok"}` khi DB trả lời, 503 khi DB lỗi. Cho vào UptimeRobot / Better Stack (chu kỳ 5 phút, báo email).
- **Lỗi trong ứng dụng**: lỗi máy chủ ghi vào log Vercel (`vercel logs <url>` hoặc Dashboard → Logs, lọc `error`). Lỗi giao diện của người dùng gửi về `POST /api/v1/public/client-error` (cũng thấy trong log).
- **Tốc độ & lượt truy cập**: bật *Web Analytics* và *Speed Insights* trong Vercel Dashboard → dự án (mã đã nhúng sẵn).
- **Tác vụ hằng ngày** (`/api/cron/daily`, 2 lần/ngày): nhắc sự kiện/đóng quỹ, dọn dữ liệu hết hạn, gửi thông báo đẩy còn tồn. Thiếu `CRON_SECRET` thì bị từ chối — xem log nếu thông báo không đến.
- **CI**: `.github/workflows/ci.yml` chạy typecheck + build + dựng DB từ đầu cho mỗi lần push.

## 3. Sao lưu & khôi phục

### 3a. Tự động hằng ngày (đã bật từ 2026-10-07)
- Repo GitHub **riêng tư** `Doanhaiduy/luu-xa-backups` (mẫu workflow ở `ops/backup-repo/` trong repo này) chạy **02:17 mỗi ngày**: `pg_dump` production bằng tài khoản DB **chỉ đọc** `luuxa_backup` → mã hóa AES-256 (gpg) → Artifacts **90 ngày** + mỗi **Chủ nhật** lưu thêm vào thư mục `weekly/` (giữ lâu dài) → **diễn tập khôi phục** vào PostgreSQL tạm và đối chiếu số dòng/cấu trúc. Hỏng ở bước nào ⇒ lần chạy đỏ + GitHub gửi email.
- Repo ứng dụng (`domus-francis`) là **công khai** nên TUYỆT ĐỐI không đặt bản sao lưu ở đó — chỉ ở repo riêng tư. Workflow tự dừng nếu repo sao lưu bị chuyển sang công khai.
- Secrets của repo sao lưu: `BACKUP_DATABASE_URL` (chuỗi kết nối `luuxa_backup`, cổng 5432), `BACKUP_PASSPHRASE` (mật khẩu mã hóa — **cất ở trình quản lý mật khẩu, mất là mất cả sao lưu**).
- Tạo/đổi mật khẩu tài khoản chỉ đọc: `node scripts/ops/create-backup-role.mjs --env production [--rotate]` (ghi chuỗi kết nối vào `backup/backup-db-url-production.txt`, git-ignore) rồi `gh secret set BACKUP_DATABASE_URL --repo Doanhaiduy/luu-xa-backups`.
- Khôi phục: README của repo sao lưu. Chưa bao gồm Supabase Storage (ảnh/hóa đơn) — chạy tay `pnpm db:backup -- --env production --with-storage` khi cần.

### 3b. Sao lưu thủ công

```bash
pnpm db:backup -- --env production --with-storage   # ra thư mục backup/ (đã git-ignore)
```
- Có `pg_dump` → `backup/<env>-<giờ>.dump` (khôi phục: `pg_restore --clean --if-exists -d <chuỗi kết nối> <tệp>`). Không có → NDJSON từng bảng (cứu dữ liệu, khôi phục phải viết tay) — nên cài PostgreSQL client tools.
- `--with-storage` tải thêm ảnh/hóa đơn trong Supabase Storage.
- **Tần suất khuyến nghị**: trước MỖI lần áp migration lên production + mỗi tuần. Supabase gói Pro có sao lưu hằng ngày/PITR — bật ở Dashboard → Database → Backups.
- Tệp sao lưu chứa dữ liệu cá nhân: cất ở nơi mã hóa, không đưa lên git/Vercel/GitHub artifact.
- **Diễn tập khôi phục** (mỗi quý): khôi phục bản sao lưu production vào một DB tạm (staging mới) rồi đăng nhập thử.
- Sao lưu chỉ có ý nghĩa khi giữ cả **khóa mã hóa** (`PII_KEY_V1`, `PII_BIDX_KEY`): thiếu khóa = CCCD và SĐT phụ huynh trong bản sao lưu không giải mã được.

## 4. Khóa & bí mật

| Biến | Dùng cho | Đổi khóa thì… |
|---|---|---|
| `AUTH_JWT_*` | ký phiên đăng nhập | mọi người phải đăng nhập lại |
| `PII_KEY_V1`, `PII_BIDX_KEY` | mã hóa CCCD, SĐT phụ huynh | **dữ liệu mã hóa cũ không đọc được** — không đổi nếu không có kế hoạch giải mã/mã hóa lại |
| `CRON_SECRET` | Vercel Cron gọi `/api/cron/daily` | đổi cả trên Vercel (cron tự lấy giá trị mới sau lần deploy kế tiếp) |
| `VAPID_*` | thông báo đẩy | thiết bị đã đăng ký phải bật lại thông báo |
| `BANK_WEBHOOK_SECRET` | xác thực webhook SePay/Casso | đổi đồng thời ở SePay/Casso |
| `RESEND_API_KEY`, `EMAIL_FROM` | gửi email (quên mật khẩu) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage từ máy chủ | tạo lại ở Supabase rồi cập nhật Vercel |

- Sinh bộ khóa mới: `pnpm env:keys` (chỉ in màn hình). Mỗi môi trường một bộ riêng. File `.env.staging` / `.env.production` KHÔNG commit.
- **Xoay vòng định kỳ** (6–12 tháng/lần, hoặc ngay khi nghi lộ): `CRON_SECRET`, `BANK_WEBHOOK_SECRET`, `AUTH_JWT_*` (chọn giờ ít người dùng), khóa API Groq/Gemini/Resend. Sau khi đổi trên Vercel phải **deploy lại** để có hiệu lực.
- Biến kiểu *Sensitive* trên Vercel không đọc lại được — luôn giữ bản gốc trong `.env.<môi trường>` (cất ở trình quản lý mật khẩu).

## 5. Webhook ngân hàng (SePay / Casso)

1. Đặt `BANK_WEBHOOK_SECRET` (≥ 16 ký tự) trên Vercel, deploy lại.
2. SePay: Webhooks → thêm `https://<tên miền>/api/v1/public/bank-webhook`, kiểu xác thực **API Key** (SePay gửi `Authorization: Apikey <khóa>`). Casso: Webhook → cùng URL, “secure token” = chuỗi bí mật (header `secure-token`).
3. Có tiền vào → Thủ quỹ nhận thông báo → Thu chi → Tổng quan → thẻ “Giao dịch ngân hàng” → xem gợi ý → **Ghi thu** (hoặc Bỏ qua + lý do).
4. Webhook chỉ LƯU giao dịch (idempotent theo mã tham chiếu); không bao giờ tự ghi sổ. Cần túi quỹ loại “ngân hàng” đang hoạt động.
5. Kiểm thử nhanh: gửi một giao dịch mẫu từ trang cấu hình của SePay/Casso; xem dòng mới ở thẻ trên.

## 6. Sự cố thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| Không đăng nhập được, “phiên hết hạn” liên tục | Đổi `AUTH_JWT_*` giữa hai lần deploy? Cookie Secure khi chạy http? (`COOKIE_SECURE`) |
| Quên mật khẩu không có email | `RESEND_API_KEY`, `EMAIL_FROM` đã đặt và tên miền đã xác minh ở Resend? Xem log Vercel |
| Không nhận thông báo đẩy | `VAPID_*` đủ cả ba biến? Thiết bị đã bật ở Cài đặt → Thông báo? iOS cần “Thêm vào Màn hình chính” (iOS 16.4+) |
| 503 ở `/api/health` | Supabase tạm ngưng/hết kết nối: xem Supabase Dashboard; `DATABASE_URL` phải dùng pooler cổng 6543 |
| AI báo “chưa bật” | Cài đặt → Trợ lý AI (công tắc tổng + hạn mức), `GROQ_API_KEY`/`GEMINI_API_KEY` |
| Giao dịch ngân hàng không hiện | `BANK_WEBHOOK_SECRET` khớp phía SePay/Casso? Xem lịch sử gửi webhook ở dịch vụ đó (401 = sai khóa, 404 = chưa đặt biến, 422 = chưa có túi quỹ ngân hàng) |
| Trang công khai trống | Chưa có bài đã đăng / album bật “công khai”; bài hẹn giờ chỉ hiện khi đến giờ |

## 7. Danh sách kiểm tra phát hành

1. `pnpm typecheck` + `pnpm build` (bản build với DB local nếu cần).
2. `pnpm test:api` (đầy đủ) hoặc `node scripts/test-api.mjs --only <bộ>` cho phần vừa sửa; `node scripts/e2e/a11y.mjs` nếu đổi giao diện.
3. Sao lưu production (mục 3) nếu có migration.
4. staging: `pnpm db:migrate:staging -- --dry-run` → áp thật → push nhánh `staging` → kiểm tra.
5. production: dry-run → áp thật (trước khi code mới lên) → push `master` → kiểm tra `/api/health` và đăng nhập.
6. Biến môi trường mới: thêm vào `.env.<môi trường>` + Vercel (Dashboard → Settings → Environment Variables) **trước** khi deploy.
