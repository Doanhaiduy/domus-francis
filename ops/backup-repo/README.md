# Sao lưu Lưu Xá Phanxicô (repo RIÊNG TƯ)

Repo này **chỉ để chứa sao lưu production** của ứng dụng Lưu Xá Phanxicô: cơ sở dữ liệu (hằng ngày) và tệp trên Supabase Storage (hằng tuần). **Phải để chế độ Private** — các workflow tự dừng nếu repo công khai.
Không để mã nguồn ứng dụng, không để khóa/mật khẩu trong repo; mọi bí mật nằm ở *Settings → Secrets and variables → Actions*.

## Cơ chế

| Workflow | Lịch (giờ VN) | Làm gì | Giữ ở đâu |
|---|---|---|---|
| `.github/workflows/backup.yml` — *Sao lưu production hằng ngày* | 02:17 mỗi ngày | `pg_dump` CSDL bằng tài khoản **chỉ đọc** `luuxa_backup`, mã hóa AES-256 (gpg), **diễn tập khôi phục** vào PostgreSQL tạm và đối chiếu số dòng | Artifacts **30 ngày**; Chủ nhật thêm một bản vào thư mục `weekly/` của repo (giữ lâu dài) |
| `.github/workflows/storage-backup.yml` — *Sao lưu tệp Storage hằng tuần* | 02:47 Chủ nhật | Liệt kê + tải **mọi tệp** của 9 bucket Supabase Storage (`avatars, receipts, cleaning-evidence, academic-evidence, maintenance, moments, attachments, documents, videos`) bằng REST Storage (`scripts/storage-backup.mjs`), nén `tar.gz`, mã hóa AES-256 (cùng mật khẩu), giải mã thử + đếm số tệp khớp `MANIFEST.tsv` | Artifacts **30 ngày** |

Cả hai đều bấm tay được (*Actions → chọn workflow → Run workflow*). Bước cuối của mỗi workflow (**chạy cả khi các bước trước lỗi**) gửi **nhịp tim** về ứng dụng — xem mục *Nhịp tim* bên dưới. Chạy hỏng ⇒ GitHub cũng gửi email báo lỗi cho chủ repo.

## Secrets & biến cần có

*Settings → Secrets and variables → Actions*:

| Loại | Tên | Nội dung |
|---|---|---|
| Secret | `BACKUP_DATABASE_URL` | Chuỗi kết nối chỉ-đọc `luuxa_backup.<mã dự án>@…pooler.supabase.com:5432/postgres` (tạo bằng `node scripts/ops/create-backup-role.mjs --env production` ở repo ứng dụng) |
| Secret | `BACKUP_PASSPHRASE` | Mật khẩu mã hóa bản sao lưu (≥ 24 ký tự), dùng chung cho bản CSDL và bản tệp. **Mất mật khẩu này = bản sao lưu vô dụng** — cất ở trình quản lý mật khẩu của bạn, ngoài GitHub |
| Secret | `SUPABASE_URL` | `https://<mã dự án production>.supabase.co` (chỉ workflow tệp dùng) |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | Khóa *service_role* của dự án production (Supabase → Project Settings → API). Khóa này **đọc/ghi được mọi tệp** — chỉ để ở secret của repo riêng tư này; script chỉ dùng để LIỆT KÊ và TẢI |
| Secret | `OPS_HEARTBEAT_SECRET` | Chuỗi ngẫu nhiên ≥ 32 ký tự, **TRÙNG** với biến môi trường `OPS_HEARTBEAT_SECRET` của ứng dụng trên Vercel (Production) |
| Variable | `APP_URL` | Địa chỉ ứng dụng production, vd. `https://domus-francis-production.vercel.app` (không có `/` ở cuối) |
| Variable (tùy chọn) | `BACKUP_RETENTION_DAYS` | Số ngày giữ Artifacts bản CSDL (mặc định 30, tối đa 90) |
| Variable (tùy chọn) | `STORAGE_RETENTION_DAYS` | Số ngày giữ Artifacts bản tệp (mặc định 30) |

> Sao lưu CSDL chỉ dùng được khi còn giữ **khóa mã hóa dữ liệu** của ứng dụng (`PII_KEY_V1`, `PII_BIDX_KEY` trong `.env.production`): thiếu khóa thì CCCD và SĐT phụ huynh trong bản sao lưu không giải mã được.

## Hạn mức Artifacts (quan trọng)

Repo riêng tư ở gói **GitHub Free** chỉ có **500 MB** lưu trữ Artifacts (tính chung mọi Artifact còn hạn). Vì vậy hạn giữ đã giảm từ 90 xuống **30 ngày**:

- bản CSDL: vài MB/bản × 30 bản ≈ 50–150 MB;
- bản tệp: bằng tổng dung lượng Supabase Storage (gói miễn phí tối đa 1 GB) × số bản còn hạn (30 ngày ≈ 4–5 bản).

Khi bản tệp lớn dần (xem *Cài đặt → Dung lượng* trong ứng dụng), **giảm `STORAGE_RETENTION_DAYS`** (vd. 14 ⇒ ~2 bản) để tổng không vượt 500 MB — vượt hạn mức thì lần tải Artifact mới bị từ chối và workflow báo lỗi (ứng dụng cũng báo qua nhịp tim). Muốn giữ lâu hơn: nâng gói GitHub, hoặc định kỳ tải bản về máy / ổ lưu trữ riêng. Bản CSDL Chủ nhật vẫn được giữ lâu dài trong thư mục `weekly/` (nằm trong dung lượng repo, không tính vào hạn mức Artifacts).

## Nhịp tim (báo về ứng dụng)

Sau mỗi lần chạy, `scripts/heartbeat.mjs` gửi `POST <APP_URL>/api/v1/public/ops-heartbeat` (header `Authorization: Bearer <OPS_HEARTBEAT_SECRET>`) với loại `backup` (CSDL) hoặc `backup:storage` (tệp), kết quả đạt/lỗi, từng bước và tóm tắt (tên + dung lượng tệp `.gpg`, đường dẫn tới lần chạy). Ứng dụng:

- hiện lịch sử ở **Cài đặt → Hệ thống** (chỉ Admin) và trên dải cảnh báo đầu trang khi có sự cố;
- báo Admin ngay khi một lần sao lưu **thất bại** (mỗi ngày một lần), và mỗi sáng nếu **quá hạn**: CSDL > 36 giờ, tệp > 8 ngày không có lần đạt — chỉ bắt đầu xét sau khi đã nhận nhịp tim đầu tiên;
- `/api/health?deep=1` trả 503 khi sao lưu CSDL quá hạn — gắn vào UptimeRobot / Better Stack để biết cả khi không ai mở ứng dụng.

Thiếu `APP_URL` hoặc `OPS_HEARTBEAT_SECRET` thì bước này chỉ in nhắc, **không** làm hỏng sao lưu. Ứng dụng trả 404 khi chưa đặt biến `OPS_HEARTBEAT_SECRET` trên Vercel, 401 khi khóa không khớp.

## Khôi phục CSDL

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

## Khôi phục tệp (Supabase Storage)

1. Tải Artifact `luuxa-storage-<ngày>` (gồm `luuxa-storage-….tar.gz.gpg` và `luuxa-storage-….manifest.tsv`).
2. Giải mã rồi giải nén:
   ```bash
   gpg --output storage.tar.gz --decrypt luuxa-storage-YYYYMMDD-HHMM.tar.gz.gpg
   tar -xzf storage.tar.gz          # ⇒ storage/<bucket>/<năm>/<tháng>/<tệp> + storage/MANIFEST.tsv (bucket, đường dẫn, byte, sha256)
   ```
3. Tạo các bucket **riêng tư** cùng tên trên dự án đích (Supabase → Storage; bucket `videos` ứng dụng tự tạo khi cần).
4. Tải lên lại **giữ nguyên đường dẫn** (CSDL lưu đúng `<bucket>/<năm>/<tháng>/<mã>.<đuôi>` trong `storage_files`), vd. trong Git Bash:
   ```bash
   cd storage
   export SUPABASE_URL=https://<mã dự án đích>.supabase.co KEY=<service_role key của dự án đích>
   find . -type f ! -name MANIFEST.tsv ! -name SUMMARY.json | while read -r f; do
     b=$(echo "$f" | cut -d/ -f2); p=$(echo "$f" | cut -d/ -f3-)
     curl -sf -X POST "$SUPABASE_URL/storage/v1/object/$b/$p" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
          -H "x-upsert: true" -H "Content-Type: $(file --mime-type -b "$f")" --data-binary @"$f" >/dev/null || echo "LỖI: $f"
   done
   ```
5. Đối chiếu số tệp / dung lượng với `MANIFEST.tsv` và *Cài đặt → Dung lượng* của ứng dụng.

> **Không có trong bản sao lưu tệp:** video lưu ở **Cloudinary** (khi môi trường dùng Cloudinary) — Cloudinary giữ bản gốc; muốn sao lưu riêng thì dùng tính năng backup của Cloudinary (gói trả phí) hoặc tải về định kỳ. Bản thu nhỏ (thumb/medium) của ảnh nằm cùng bucket nên có trong bản sao lưu.

## Chi phí

0 đồng ở mức dùng hiện tại: repo riêng tư có 2.000 phút Actions/tháng (bản CSDL ~3 phút/ngày ≈ 90 phút/tháng; bản tệp ~5–15 phút/tuần tùy dung lượng), Artifacts nằm trong hạn mức 500 MB nếu chỉnh hạn giữ như mục *Hạn mức Artifacts*.

Chi tiết quy trình vận hành: `VAN_HANH.md` ở repo ứng dụng, mục *Sao lưu & khôi phục*.
