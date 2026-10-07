# Sao lưu Lưu Xá Phanxicô (repo RIÊNG TƯ)

Repo này **chỉ để chứa sao lưu cơ sở dữ liệu production** của ứng dụng Lưu Xá Phanxicô. **Phải để chế độ Private** — workflow tự dừng nếu repo công khai.
Không để mã nguồn, không để khóa/mật khẩu trong repo; mọi bí mật nằm ở *Settings → Secrets and variables → Actions*.

## Cơ chế

- Workflow `.github/workflows/backup.yml` chạy **mỗi ngày 02:17 (giờ Việt Nam)** và bấm tay được (*Actions → Sao lưu production hằng ngày → Run workflow*).
- Dùng tài khoản DB **chỉ đọc** `luuxa_backup` (không ghi/xóa được dữ liệu). `pg_dump` ra định dạng custom, **mã hóa AES-256 (gpg)** rồi:
  - lưu vào **Artifacts 90 ngày** (Actions → chọn lần chạy → mục Artifacts);
  - **Chủ nhật** lưu thêm một bản vào thư mục `weekly/` của repo (giữ lâu dài, mỗi bản ~vài MB).
- Mỗi lần chạy còn **diễn tập khôi phục**: nạp bản vừa sao lưu vào một PostgreSQL tạm và đối chiếu số dòng (`manifest.txt` ghi kết quả). Chạy hỏng ⇒ GitHub gửi email báo lỗi.
- Chi phí: 0 đồng (repo riêng tư có 2.000 phút Actions/tháng; mỗi lần chạy ~3 phút; Artifacts dùng vài trăm MB trong hạn mức 500 MB của gói Free).

## Secrets cần có

| Secret | Nội dung |
|---|---|
| `BACKUP_DATABASE_URL` | Chuỗi kết nối chỉ-đọc `luuxa_backup.<mã dự án>@…pooler.supabase.com:5432/postgres` (tạo bằng `node scripts/ops/create-backup-role.mjs --env production` ở repo ứng dụng) |
| `BACKUP_PASSPHRASE` | Mật khẩu mã hóa bản sao lưu (≥ 24 ký tự). **Mất mật khẩu này = bản sao lưu vô dụng** — cất ở trình quản lý mật khẩu của bạn, ngoài GitHub |

> Sao lưu cũng chỉ dùng được khi còn giữ **khóa mã hóa dữ liệu** của ứng dụng (`PII_KEY_V1`, `PII_BIDX_KEY` trong `.env.production`): thiếu khóa thì CCCD và SĐT phụ huynh trong bản sao lưu không giải mã được.

## Khôi phục

1. Tải bản sao lưu: *Actions → lần chạy → Artifacts* (`luuxa-prod-<ngày>`) hoặc tệp trong `weekly/`.
2. Giải mã (cần `gpg`, có sẵn trong Git Bash; nhập `BACKUP_PASSPHRASE`):
   ```bash
   gpg --output luuxa.dump --decrypt luuxa-prod-YYYYMMDD-HHMM.dump.gpg
   ```
3. Tạo CSDL đích **trống** (Supabase mới hoặc PostgreSQL 17) và tạo trước các vai trò của ứng dụng:
   ```sql
   CREATE ROLE luuxa_owner NOLOGIN NOINHERIT;  CREATE ROLE luuxa_app NOLOGIN NOBYPASSRLS;
   CREATE ROLE luuxa_worker NOLOGIN BYPASSRLS; CREATE ROLE luuxa_readonly NOLOGIN NOBYPASSRLS;
   CREATE ROLE luuxa_definer NOLOGIN BYPASSRLS; CREATE ROLE luuxa_auth NOLOGIN BYPASSRLS;
   -- đăng nhập của ứng dụng: CREATE ROLE luuxa_api LOGIN NOINHERIT PASSWORD '…'; GRANT luuxa_app, luuxa_worker, luuxa_auth TO luuxa_api;
   -- vai trò khác bản sao lưu nhắc tới: luuxa_webhook, anon, authenticated, service_role, supabase_admin (dự án Supabase mới đã có sẵn các vai trò Supabase)
   -- extensions: pgcrypto + uuid-ossp (schema extensions), citext, pg_trgm, btree_gist, unaccent
   -- schema app tạo sẵn + cấp USAGE cho các vai trò luuxa_* (chỉ mục biểu thức gọi hàm app.* được dựng dưới quyền chủ bảng):
   CREATE SCHEMA app; GRANT USAGE ON SCHEMA app TO luuxa_owner, luuxa_app, luuxa_worker, luuxa_readonly, luuxa_definer, luuxa_auth;
   ```
4. Nạp dữ liệu:
   ```bash
   pg_restore --dbname "<chuỗi kết nối DB đích>" luuxa.dump
   ```
   Lỗi "schema public/app already exists" là bình thường. Lỗi `row-level security policy for table "ledger_entries"` ở lệnh `REFRESH MATERIALIZED VIEW` cũng bình thường (xem bước 5).
5. Dựng lại view tổng hợp bằng quyền cao (chủ DB/superuser): `REFRESH MATERIALIZED VIEW public.mv_cashflow_monthly;`
6. Trỏ ứng dụng (biến `DATABASE_URL` trên Vercel) sang DB mới, **giữ nguyên** `PII_*` và `AUTH_JWT_*`.

> Mỗi lần chạy, workflow đã tự làm đúng các bước 3–5 trên một PostgreSQL tạm và so sánh số dòng + số bảng/chỉ mục/chính sách RLS/trigger/hàm với production — nên các bước trên luôn được kiểm chứng (xem `manifest.txt`).

Chi tiết quy trình vận hành: `VAN_HANH.md` ở repo ứng dụng, mục *Sao lưu & khôi phục*.
