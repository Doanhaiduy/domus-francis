# Việc chưa làm được — cần làm tay (Vercel / Supabase / GitHub / dịch vụ ngoài)

Đợt cải tiến ngày 12/10/2026 được làm và kiểm thử **hoàn toàn trên máy local** (PostgreSQL local, lưu tệp ra ổ đĩa, mọi dịch vụ ngoài là
máy chủ giả). Theo quy định: **không push code, không chạy migration lên staging/production, không đổi cấu hình trên Vercel/Supabase/GitHub**.
File này liệt kê những việc bạn cần tự làm để đưa thay đổi lên môi trường thật, theo thứ tự nên làm.

> Đánh dấu `[ ]` → `[x]` khi xong. Mục **⚠ Bắt buộc** phải làm trước/khi triển khai, nếu không tính năng sẽ lỗi hoặc có rủi ro bảo mật.

---

## 0. ⚠ Bảo mật khẩn (làm ngay, không phụ thuộc đợt này)

- [ ] **Đổi mật khẩu chủ DB của Supabase STAGING** (dự án `mxwlphjyxnrwrnfgiinr`): chuỗi kết nối kèm mật khẩu nằm trong lịch sử git của repo
      CÔNG KHAI (commit `60cbdaf`). Gỡ khỏi mã (`d9d5346`) không xóa được lịch sử — chỉ đổi mật khẩu mới chặn được.
      Supabase Dashboard → Project Settings → Database → *Reset database password* → cập nhật `MIGRATE_DATABASE_URL` trong `.env.staging`
      (và mọi nơi khác dùng chuỗi đó). Nếu staging từng chứa dữ liệu thật, coi như dữ liệu đó có thể đã lộ.
- [ ] **Tắt Data API (PostgREST) trên CẢ HAI dự án Supabase** (ứng dụng không dùng): Project Settings → Data API → tắt
      (hoặc bỏ schema `public` khỏi "Exposed schemas"). Migration `db/app/1042_supabase_api_hardening.sql` đã thu hồi quyền của
      `anon`/`authenticated` nhưng tắt hẳn là chắc nhất. Kiểm tra sau khi áp 1042:
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated');` ⇒ 0 dòng.

## 1. ⚠ Áp migration (staging trước, rồi production) — theo quy trình phát hành trong CLAUDE.md

Thứ tự: sao lưu production → `pnpm db:migrate:staging -- --dry-run` → áp thật → push nhánh `staging` → kiểm tra → `pnpm db:migrate:production -- --dry-run`
→ áp thật **trước khi** code mới lên production → push `master`.

Migration mới của đợt này (đều idempotent, mỗi file một transaction):

| File | Nội dung |
|---|---|
| `db/app/1041_ops_core.sql` | `job_runs`, `error_events`, `rate_limit_hits` + `app.fn_rate_limit_hit`, `app.fn_error_event_record`; loại thông báo `system.ops_alert`, `system.error_digest`, `security.account_locked`, `member.application_new`; cấu hình `auth.registration_open` |
| `db/app/1042_supabase_api_hardening.sql` | thu hồi quyền `anon`/`authenticated` (Data API), bật RLS phân vùng `audit_logs_*` |
| `db/app/1043_ops_monitoring.sql` | giám sát vận hành: tóm tắt lỗi, cảnh báo cron/sao lưu |
| `db/app/1044_manager_inbox.sql` | Hộp việc cần xử lý của người quản lý (15 loại việc) |
| `db/app/1045_finance_ops2.sql` | sổ cái nối chuỗi băm, kỳ kế toán, nhắc phiếu chi chưa duyệt, cảnh báo chia tiền |
| `db/app/1046_privacy_rights.sql` | yêu cầu dữ liệu cá nhân (xuất/xóa), ẩn danh quá hạn lưu, văn bản pháp lý mới |
| `db/app/1047_public_admission_donation.sql` | trang tuyển sinh `/vao-o`, báo ủng hộ VietQR |
| `db/app/1048_liturgy_duty_automation.sql` | check-in lễ tự xác nhận, duyệt hàng loạt, xếp trực tự động |
| `db/app/1049_event_series_calendar_feed.sql` | sự kiện lặp, lịch cá nhân `.ics` theo mã bí mật |
| `db/app/1050_members_lifecycle_delegation.sql` | thông báo ủy quyền + `app.fn_delegation_overview()` (ủy quyền dùng bảng thiết kế `role_delegations`) |
| `db/app/1051_settings_kitchen_discipline_leave.sql` | "Luôn ăn", nhắc đăng ký cơm, người vắng ở bữa ăn, `repeat_becomes_red`, "tối nay ai vắng" |
| `db/app/1052_member_ux.sql` | tắt thông báo theo loại, xác nhận đọc Luật nhà |
| `db/data/2026-10-12-40_meals_single_switch.sql` | Bếp & Cơm một công tắc: đồng bộ cờ `feature.meals.enabled` ↔ `ui.disabled_modules['/bep-com']` (cờ đang tắt ⇒ phân hệ hiện "Bảo trì") |
| `db/data/2026-10-12-50_policy_sample_off.sql`, `…-55_public_faq_drafts.sql` | gỡ nội quy mẫu sai giờ 22:30; câu hỏi thường gặp nháp |

## 2. ⚠ Biến môi trường trên Vercel (Production + Preview) — đặt TRƯỚC khi deploy

| Biến | Bắt buộc? | Ghi chú |
|---|---|---|
| `OPS_HEARTBEAT_SECRET` | nên có | chuỗi ngẫu nhiên ≥ 32 ký tự (`openssl rand -hex 24`); đặt CÙNG giá trị làm secret của repo sao lưu (mục 4). Thiếu ⇒ `/api/v1/public/ops-heartbeat` trả 404, Cài đặt → Hệ thống không biết sao lưu còn chạy. |
| `NEXT_PUBLIC_APP_URL` | nên có | URL gốc của môi trường (vd. `https://domus-francis-production.vercel.app`) — dùng cho liên kết trong email/tin Zalo/lịch .ics. |
| `DB_SSL_CA` | tùy chọn | nội dung PEM CA của Supabase (Project Settings → Database → SSL Configuration → Download certificate) ⇒ kiểm chứng chỉ máy chủ DB. Dán cả khối `-----BEGIN CERTIFICATE-----…` (xuống dòng có thể thay bằng `\n`). |
| `RATE_LIMIT_PEPPER` | tùy chọn | muối băm khóa giới hạn tần suất; mặc định dùng `PII_BIDX_KEY`. |
| `OPS_REQUIRE_BACKUP_HEARTBEAT` | tùy chọn | `1` ⇒ `/api/health?deep=1` báo lỗi khi chưa từng có nhịp tim sao lưu. |

Biến đã có từ trước nhưng **chưa đặt** (theo CLAUDE.md): `RESEND_API_KEY` + `EMAIL_FROM` (Resend không nhận tên miền `*.vercel.app` ⇒ cần
tên miền riêng đã xác minh). Thiếu email thì: "Quên mật khẩu" ẩn, email thông báo bị bỏ qua (đánh dấu `skipped`, không còn tồn đọng).

## 3. ⚠ Vùng chạy hàm Vercel

- [ ] `vercel.json` đã đổi `regions` từ `sin1` (Singapore) sang **`icn1` (Seoul)** cho cùng vùng với Supabase `ap-northeast-2` — mỗi vòng truy vấn
      DB từ ~70 ms xuống vài ms. **Xác minh trước khi deploy**: vùng Supabase của CẢ HAI dự án đúng là `ap-northeast-2` (Project Settings → General).
      Nếu Supabase ở vùng khác ⇒ sửa `regions` cho khớp. Sau deploy: mở DevTools → Network → một API bất kỳ → Timing → `Server-Timing` (`db;dur=…`)
      để so trước/sau.

## 4. Sao lưu (repo riêng tư `Doanhaiduy/luu-xa-backups`)

- [ ] Chép mẫu workflow mới từ `ops/backup-repo/` sang repo sao lưu (nhịp tim về ứng dụng + sao lưu tệp Supabase Storage hằng tuần).
- [ ] Thêm secrets ở repo sao lưu: `OPS_HEARTBEAT_SECRET` (trùng Vercel), `APP_URL` (URL production), `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
      (của production — để tải tệp Storage). Xem `ops/backup-repo/README.md`.
- [ ] Kiểm tra dung lượng Artifacts của GitHub Free (500 MB cho repo riêng tư): bản DB giờ giữ 30 ngày.
- [ ] Video trên Cloudinary CHƯA được sao lưu tự động (cần tài khoản lưu trữ khác) — tải tay định kỳ nếu cần giữ lâu.

## 5. Giám sát từ bên ngoài (miễn phí)

- [ ] Tạo 2 monitor UptimeRobot / Better Stack (chu kỳ 5–15 phút, báo email): `https://<production>/api/health` và
      `https://<production>/api/health?deep=1` (báo khi cron sáng/tối hoặc sao lưu ngừng chạy).
- [ ] Bật *Web Analytics* và *Speed Insights* trong Vercel Dashboard → dự án (mã đã nhúng sẵn).

## 5b. Kiểm tra trước khi áp lên production (Gói E/G)

- [ ] Sau khi áp `2026-10-12-40_meals_single_switch.sql`: Cài đặt → Phân hệ → **Bếp & Cơm** sẽ hiện "Bảo trì" nếu cờ `feature.meals.enabled` đang tắt (trạng thái mặc định) — bật lại ở tab này khi nhà bắt đầu dùng (máy chủ tự bật cờ theo).
- [ ] Danh sách tạm trú (Thành viên → "Danh sách tạm trú") giải mã CCCD hàng loạt: chỉ Trưởng nhà / Admin có `member.national_id.read`; mỗi lần xuất ghi `READ_SENSITIVE` — nhắc người dùng xóa tệp sau khi khai báo.
- [ ] Khuyến nghị cập nhật Chính sách bảo mật (`LEGAL_VERSION`): lịch cá nhân `.ics` theo mã bí mật (Gói D), xuất danh sách tạm trú (Gói E), tự đăng ký cơm (Gói G).

## 6. Sau khi deploy lên production

- [ ] **Admin / Trưởng nhà / Thủ quỹ phải bật xác thực 2 bước ngay lần đăng nhập kế tiếp** — từ đợt này API CHẶN (403) mọi thao tác của vai trò
      bắt buộc 2FA chưa bật (trước đây chỉ là dải nhắc). Muốn hoãn: Cài đặt → Cấu hình chung → `auth.mfa_required_roles` bỏ bớt vai trò TRƯỚC khi deploy.
- [ ] Tài khoản đang dùng mật khẩu tạm cũng bị chặn tới khi đổi mật khẩu.
- [ ] Mọi người sẽ được hỏi xác nhận Điều khoản sử dụng + Chính sách bảo mật phiên bản mới ở lần mở ứng dụng kế tiếp.

## 7. Để sau (cần quyết định / công sức lớn)

- [ ] **Nâng Next.js 14 → 15** (kế hoạch ở mục cuối file này). Khi lên 15, hook `onRequestError` (đã viết sẵn) tự có tác dụng.
- [ ] **Bật chặn thật Content-Security-Policy**: hiện chỉ *Report-Only* (ghi vi phạm vào nhật ký lỗi, nguồn `csp`). Theo dõi 1–2 tuần ở Cài đặt → Hệ thống;
      không còn vi phạm hợp lệ ⇒ đổi header sang `Content-Security-Policy`.
- [ ] **Cloudinary**: video tải lên kiểu công khai theo URL. Bật *Strict transformations* (Cloudinary Console → Settings → Security) để người có URL
      không tự tạo biến thể tốn credit; muốn kín hẳn cần URL ký (gói trả phí cho HLS có token).

---

## Phụ lục: kế hoạch nâng Next.js 15 (chưa làm)

_(sẽ bổ sung khi hoàn tất đợt)_
