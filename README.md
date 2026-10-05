# 🕊️ Lưu Xá Phanxicô — Hệ thống quản lý cộng đoàn sinh viên

Ứng dụng web nội bộ cho lưu xá sinh viên Công giáo: thành viên & sơ đồ nhà, trực nhật & hậu cần, thu chi minh bạch,
học tập, lịch sự kiện & điểm danh QR, thông báo, diễn đàn, phụng vụ, bếp cơm, khoảnh khắc.

**Chạy hoàn toàn trên máy (local-first):** PostgreSQL 16 portable, tệp lưu trên ổ đĩa, font tự lưu trữ — không gửi dữ liệu
nào của nhà ra ngoài; chỉ đọc (GET) dữ liệu công khai: Lời Chúa (GitHub) và danh mục tỉnh/thành (provinces.open-api.vn) — xem mục Lịch phụng vụ.

## Kiến trúc

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Giao diện | Next.js 14 (App Router), React 18, Tailwind | dữ liệu qua SWR từ `/api/v1/*` |
| API | Next.js Route Handlers (`src/app/api/v1`) | lỗi RFC 9457 `application/problem+json`, CSRF double-submit + kiểm Origin |
| Xác thực | Argon2id · JWT EdDSA 15 phút (cookie HttpOnly) · refresh token 30 ngày xoay vòng + phát hiện dùng lại | khóa tạm sau 5 lần sai, đổi mật khẩu thu hồi phiên khác |
| Phân quyền | **Row-Level Security trong PostgreSQL** | mỗi request: `SET LOCAL ROLE luuxa_app` + `app.current_user_id`; quyền giao diện đọc từ `role_permissions` |
| CSDL | PostgreSQL 16.14 — DDL thiết kế 141 bảng (`db/migrations/01…52`) + 6 bản vá kiểm định (`kiem-dinh/sql/70…75`) + phần bổ sung ứng dụng (`db/app/9x`) | |
| Tệp | `.local/storage` | kiểm định dạng thật (magic bytes), xóa EXIF/GPS, ảnh thu nhỏ WebP, SHA-256, pHash |
| Dữ liệu nhạy cảm | CCCD, SĐT phụ huynh mã hóa AES-256-GCM ở tầng ứng dụng | xem CCCD đầy đủ phải nêu lý do, có ghi nhật ký kiểm toán |

Tài liệu nguồn: `TAI_LIEU_THIET_KE_BACKEND_PGSQL_LUU_XA_PHANXICO.md` (thiết kế) và `KIEM_DINH_DOC_LAP_THIET_KE_BACKEND.md` (kiểm định).

## Bắt đầu nhanh

Yêu cầu: Node.js ≥ 18.18 (đã thử 22), pnpm. Không cần cài PostgreSQL hay Docker.

```bash
pnpm install          # cài thư viện (gồm PostgreSQL 16.14 portable)
pnpm setup:local      # khởi động PostgreSQL local, sinh .env.local, dựng DB "luuxa", nạp dữ liệu demo
pnpm dev              # http://localhost:3000
```

Tài khoản demo (mật khẩu chung **`LuuXa@2026`**), danh sách đầy đủ in ra sau `setup:local` và lưu ở `.local/demo-accounts.txt`:

| Email | Vai trò |
|---|---|
| duc.tran@luuxa.local | Trưởng nhà |
| long.le@luuxa.local | Phó nhà |
| bao.pham@luuxa.local | Thủ quỹ |
| viet.vu@luuxa.local | Admin kỹ thuật |
| phong.dang@luuxa.local · khoi.hoang@luuxa.local · khoa.ngo@luuxa.local | Trưởng ban Phụng vụ · Ẩm thực · Truyền thông |
| tuan.nguyen@luuxa.local (và hieu.bui, kiet.do, nam.phan, phuoc.ly) | Thành viên |
| an.tran@luuxa.local | Đơn đăng ký đang chờ duyệt |

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `pnpm setup:reset` | **xóa** DB `luuxa` và dựng lại từ đầu + dữ liệu demo |
| `pnpm db:start` / `db:stop` / `db:status` | điều khiển PostgreSQL local (127.0.0.1:54329, dữ liệu ở `.local/pgdata`) |
| `pnpm db:audit` | chạy lại **toàn bộ bộ kiểm định độc lập** trên DB thử nghiệm riêng (báo cáo `.local/audit/report.md`) |
| `pnpm db:audit:quick` | như trên, bỏ bước đối chứng DB gốc và dry-run |
| `pnpm test:api` | kiểm thử API tích hợp trên DB + máy chủ thử nghiệm riêng (cổng 3100) |
| `pnpm test:e2e -- --user <email>` | mở từng trang bằng Edge/Chrome có sẵn, báo lỗi console/HTTP/request ra ngoài, chụp ảnh `.local/e2e/` |
| `pnpm db:sql -d luuxa <file.sql>` | chạy một file SQL (tương đương `psql -f`, bản portable không kèm psql) |
| `pnpm typecheck` · `pnpm build` | kiểm tra kiểu · build production |

## Bộ kiểm định (`pnpm db:audit`)

Chạy lại đúng quy trình của `kiem-dinh/README.md` trên PostgreSQL local, với tiêu chí đạt cho từng mục:

1. DDL gốc 01…52 + `60_smoke_tests.sql` nguyên văn của tài liệu (S2→S14).
2. DDL + bản vá 70…75 (chạy 2 lần — idempotent) + `60_smoke_tests_reviewed.sql` + các check `sec/biz/api/cov_check.sql`, `ai_gate.sql`, `idx.sql`, `catalog_checks.sql`.
3. `80_concurrency_tests.js`: DB gốc phải **thất bại 13/13** (đối chứng), DB đã vá phải **đạt 13/13**.
4. `dryrun.js` 8 kịch bản nghiệp vụ — so từng bước với kết quả đúng. Script gốc viết cứng ngày/giờ chạy kiểm định
   (03/10/2026, buổi sáng); bản chạy được dời ngày tương ứng và dùng ca "ngày kia" cho KB7 (BR-DUTY-11: xin đổi ca trước ≥ 12 giờ).
5. Lặp lại smoke + check trên DB của ứng dụng (có thêm `db/app/*.sql`) để chứng minh phần bổ sung không phá vỡ thiết kế.

## Cấu trúc thư mục chính

```
db/migrations/         DDL trích nguyên văn từ tài liệu thiết kế (pnpm db:extract)
db/app/                SQL bổ sung cho ứng dụng (vai trò đăng nhập luuxa_api, bảng còn thiếu…)
kiem-dinh/             sản phẩm kiểm định độc lập: bản vá, bộ test, bằng chứng
scripts/db/            pg.mjs (PostgreSQL portable), build/sql/audit, seed/ (dữ liệu demo)
scripts/e2e/           kiểm thử giao diện bằng trình duyệt có sẵn
src/server/            lõi backend: db (transaction + RLS), http (bọc route), auth, storage, modules/<phân hệ>
src/app/api/v1/        REST API
src/lib/data/          hook SWR theo phân hệ · src/lib/types/ DTO dùng chung
```

## Bảo mật & quyền riêng tư (tóm tắt)

- Mọi truy vấn của người dùng chạy dưới vai trò DB `luuxa_app` (không BYPASSRLS); kết nối đăng nhập `luuxa_api` là NOINHERIT
  nên không có quyền gì nếu quên `SET ROLE`. Bước hệ thống tin cậy (xác lập thuộc tính tệp, dọn dẹp hằng giờ) dùng `luuxa_worker`.
- Thông tin tầng 2 (ngày sinh, quê quán, phụ huynh) chỉ chính chủ/Ban điều hành; tầng 3 (tôn giáo) cần đồng ý chia sẻ.
- Tệp chỉ xem được khi người xem có quyền với thực thể chứa tệp (RLS `storage_files`).
- `DATABASE_URL` bắt buộc trỏ tới localhost; trình kiểm thử e2e báo lỗi nếu trang gửi request ra ngoài.

## Trợ lý AI (tùy chọn)

Mặc định **tắt**. Mặc định dùng **Groq**, nếu lỗi/hết hạn mức thì tự chuyển **Gemini**.

1. Thêm `GROQ_API_KEY` (và tùy chọn `GEMINI_API_KEY`) vào `.env.local`, khởi động lại `pnpm dev`. Khóa chỉ nằm ở file này.
2. Đăng nhập Trưởng nhà/Admin → Cài đặt → **Trợ lý AI** → bật công tắc tổng và từng tác vụ.
3. Mỗi thành viên đồng ý một lần (`ai_processing`) trước khi dùng.

Tác vụ có sẵn: hỏi đáp nội quy (nút "Trợ lý AI"), soạn tin nhắc quỹ (Thu Chi), phân loại sự cố (Báo hỏng), soạn bản tin (Đăng thông báo), soát nội dung (Tạo chủ đề). AI chỉ gợi ý; dữ liệu được ẩn danh hóa trước khi gửi; có ngân sách tháng, giới hạn 20 lượt/giờ/người, cache 24 giờ.
`pnpm test:api` dùng máy chủ giả loopback — không bao giờ gọi Groq/Gemini thật. `AI_OFFLINE=1` chặn mọi lệnh gọi ra ngoài.

## Lịch phụng vụ, Lời Chúa & check-in đi lễ

- **Lịch phụng vụ tự tính** (`src/lib/liturgy/engine.ts`, không cần mạng): mùa/tuần, năm A/B/C – I/II, tên lễ tiếng Việt, bậc lễ, màu áo lễ,
  lễ trọng bị ngăn trở được dời (Truyền Tin, Thánh Giuse, Vô Nhiễm…), lịch riêng Việt Nam (Hiển Linh/Thăng Thiên/Mình Máu Thánh dời
  về Chúa Nhật, 24/11 Các Thánh Tử Đạo Việt Nam là lễ trọng, Mồng Một/Hai/Ba Tết, Lễ Tro trùng Tết dời sang mồng 4 — đặc ân
  2407/98/L), âm lịch Việt Nam (`lunar.ts`). Đối chiếu với lịch Hà Nội / lịch chung 2026: khớp bậc lễ và màu áo lễ.
- **Lời Chúa**: nạp một lần từ dữ liệu mở trên GitHub (`anrevietson/myCalLiturgy`, ghim commit) vào bảng `liturgy_lectionary`;
  bản văn được ghép theo **trích dẫn** (không theo mã tệp nguồn) nên luôn đúng ngày; thiếu bản văn thì hiện trích dẫn + liên kết
  bản chính thức kpv.vn. Máy chủ tự nạp khi bảng còn trống; nạp lại ở Lịch & Sự kiện → Cấu hình lịch phụng vụ → Lời Chúa.
  `LITURGY_DATA_BASE_URL` đổi nguồn (bản sao nội bộ), `LITURGY_OFFLINE=1` chặn tải, `LITURGY_AUTO_IMPORT=0` tắt tự nạp.
- **Check-in đi lễ** (`mass_checkins`): Chúa Nhật không cần ảnh; lễ trọng, lễ Bổn mạng (`org.patron_feast`, `org.patron_name`) và
  ngày đặc biệt của nhà (`liturgy_special_days`) cần ảnh minh chứng; Ban Phụng vụ duyệt (cảnh báo ảnh trùng pHash / chụp sai ngày).
- **Nhắc lễ** (job nền 30 phút/lần, `app.fn_liturgy_notice` chống gửi trùng): trước N ngày (`liturgy.notify_days_before`), hôm trước,
  và tối ngày lễ nhắc người chưa check-in (`liturgy.checkin_reminder_time`).

Nguồn bên ngoài duy nhất ứng dụng gọi (chỉ **GET dữ liệu công khai**, không gửi dữ liệu của nhà): GitHub raw (Lời Chúa) và
provinces.open-api.vn (danh mục tỉnh/thành, xã/phường — qua máy chủ, có đệm; `PROVINCES_API_BASE_URL` đổi nguồn).
`pnpm test:api` dùng máy chủ giả loopback cho cả hai.

## Hiệu năng (đặc biệt khi DB ở xa, ví dụ Supabase)

Mỗi câu SQL gửi tới DB ở xa tốn một vòng mạng (vài chục tới vài trăm ms), nên ứng dụng được tối ưu theo số vòng mạng:

- **Chạy bản production**: `pnpm build` rồi `pnpm start`. `pnpm dev` biên dịch lại từng trang ở lần mở đầu nên bấm tab nào cũng dừng vài giây. `pnpm dev`/`pnpm start` tự bỏ qua PostgreSQL local khi `DATABASE_URL` trỏ ra ngoài.
- **Mỗi request một vòng mạng mở đầu**: `BEGIN; SET LOCAL ROLE; set_config(...); kiểm tra phiên` được ghép vào câu SQL đầu tiên; request GET chạy transaction `READ ONLY` và không chờ `COMMIT`.
- **Gộp truy vấn độc lập**: `batch(tx, [[sql, params], ...])` (src/server/db.ts) gửi nhiều câu trong một vòng mạng; các API nặng đã dùng.
- **Pool kết nối**: giữ kết nối nhàn rỗi 5 phút và mở sẵn 3 kết nối khi khởi động (tránh bắt tay TLS lại). Chỉnh bằng `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_POOL_WARM`.
- **Trình duyệt**: thông tin phiên được nạp sẵn khi render HTML (không chờ `/api/v1/auth/me` rồi mới gọi API của trang); form đóng ngay sau khi lưu, danh sách tự làm mới ở nền; rê chuột/chạm vào tab là tải trước dữ liệu của tab đó.

Đo đạc:

- Mỗi API trả header `Server-Timing` (DevTools → Network → chọn request → Timing): số vòng mạng DB, thời gian DB, thời gian chờ kết nối. Tắt bằng `SERVER_TIMING=0`. `DB_TRACE=1` in từng câu SQL ra console máy chủ.
- `node scripts/perf/pages.mjs --base http://localhost:3000` — mở app bằng Edge/Chrome, bấm qua từng tab, in thời gian và số vòng DB của từng trang.
- `node scripts/perf/latency-proxy.mjs --delay 20` — giả lập độ trễ DB ở xa trên PostgreSQL local (không cần mạng) để thử tối ưu.
- `node scripts/e2e/responsive.mjs` — kiểm tra giao diện ở khổ điện thoại 390/360 px (tràn ngang, ảnh chụp từng trang).

## Cập nhật CSDL đang chạy (migration tăng dần)

Từ bản này, thay đổi CSDL được chia hai loại và áp bằng **một lệnh**, không dựng lại, không mất dữ liệu:

- `db/app/99x_*.sql` — cấu trúc mới (bảng, cột, hàm, quyền, khóa cấu hình). Cũng chạy khi dựng mới bằng `pnpm db:build`.
- `db/data/*.sql` — thay đổi dữ liệu nghiệp vụ (ví dụ bỏ vai trò Phó nhà, cấp quyền cho Admin).

```
pnpm db:migrate                                              # PostgreSQL local (DB luuxa)
pnpm db:migrate -- --url "postgresql://…" --allow-remote      # DB ở xa (Supabase) — chạy trên máy được phép
pnpm db:migrate -- --dry-run                                 # chỉ liệt kê file sẽ chạy
```

File đã chạy được ghi vào bảng `app_migrations`; chạy lại chỉ áp file mới. Mỗi file là một transaction (lỗi thì tự rollback).
`pnpm setup:local` tự chạy bước này. `pnpm db:audit` (bộ kiểm định độc lập) không chạy `db/data` vì smoke test của nó giả định dữ liệu gốc của thiết kế.

## Hướng dẫn sử dụng

Trong ứng dụng: thanh bên → **Hướng dẫn sử dụng** (tự lọc theo vai trò). Bản in: `docs/HUONG_DAN_SU_DUNG.md` (sinh từ `src/content/guide.ts` bằng `node --experimental-strip-types scripts/docs/export-guide.mjs`).
