# CLAUDE.md — Lưu Xá Phanxicô

Hướng dẫn cho các phiên làm việc sau. Đọc kỹ mục **Môi trường** và **Quy trình phát hành** trước khi động tới DB, biến môi trường hay deploy.

## Dự án
Ứng dụng quản lý cộng đoàn sinh viên Công giáo. Next.js 14 (App Router) + React 18 + Tailwind 3, PostgreSQL (Supabase) với **Row-Level Security**, deploy Vercel. Giao diện/ghi chú/thông báo lỗi viết **tiếng Việt**. Tổng quan kiến trúc: `README.md`.

Lệnh hay dùng: `pnpm typecheck` · `pnpm build` · `pnpm dev` (cần PostgreSQL local) · `pnpm db:migrate[:staging|:production]` · `pnpm dev:staging` · `pnpm env:keys`.

## Môi trường (QUAN TRỌNG)

| Môi trường | Git / Vercel | Địa chỉ | Supabase (project ref) | File cấu hình (KHÔNG commit) |
|---|---|---|---|---|
| local | máy dev | http://localhost:3000 | PostgreSQL portable `127.0.0.1:54329` | `.env.local` |
| **staging** | nhánh `staging` → Vercel **Preview** | https://domus-francis.vercel.app | `mxwlphjyxnrwrnfgiinr` | `.env.staging` |
| **production** | nhánh `master` → Vercel **Production** | https://domus-francis-production.vercel.app | `hpevzmhdfmzczhgqjmnj` | `.env.production` |

- Vercel project: `domus-francis` (team `doanhaiduys-projects`, `prj_kJk3Lj0YkYva3KrUZYZ5pcYiqrAC`). Vùng Supabase/pooler: `aws-0-ap-northeast-2.pooler.supabase.com` (host `db.<ref>.supabase.co` chỉ có IPv6 — máy dev không phân giải được, luôn dùng pooler).
- Mỗi môi trường có **bộ khóa riêng** (`AUTH_JWT_*`, `PII_*`, `CRON_SECRET`) và DB/storage riêng. Đổi `PII_*` = dữ liệu mã hóa (CCCD, SĐT phụ huynh) cũ không đọc được.
- **`.env.local` trỏ vào Supabase STAGING thật** (không phải DB local như README nói). `next dev` chạy thẳng sẽ đọc/ghi staging. Muốn dev/test trên DB local phải ghi đè biến môi trường:
  `DATABASE_URL=postgresql://luuxa_api:<LUUXA_API_PASSWORD trong .env.local>@127.0.0.1:54329/luuxa ALLOW_REMOTE_DB= NEXT_PUBLIC_SUPABASE_URL= SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= STORAGE_DRIVER=local npx next dev` (và kiểm tra id user ở `/api/v1/auth/me` khớp DB local trước khi ghi dữ liệu).
- `.env.staging` / `.env.production` có biến `MIGRATE_DATABASE_URL` = chuỗi chủ DB (`postgres.<ref>`, pooler cổng 5432) chỉ dành cho script migrate/bootstrap trên máy dev — **không đưa lên Vercel**. `DATABASE_URL` của app dùng role `luuxa_api` qua pooler cổng 6543.
- Khóa/mật khẩu **không bao giờ** ghi vào mã, commit, CLAUDE.md hay memory. Các file `.env.*` đã nằm trong `.gitignore` và `.vercelignore` (chỉ `.env.example` được commit). Chuỗi kết nối cũ từng lọt vào lịch sử git (commit `60cbdaf`) — đã gỡ khỏi mã.

## Quy trình phát hành (làm theo thứ tự)
1. Code xong → `pnpm typecheck` và `pnpm build` (build với biến ghi đè DB local nếu cần) phải qua.
2. Có migration mới → áp lên **staging trước**: `pnpm db:migrate:staging -- --dry-run`, rồi bỏ `--dry-run`.
3. Push nhánh `staging` → Vercel build Preview → kiểm tra trên https://domus-francis.vercel.app (theo dõi build: `gh api repos/Doanhaiduy/domus-francis/commits/<sha>/status --jq .state`).
4. OK → áp migration lên **production**: `pnpm db:migrate:production -- --dry-run` rồi áp thật **trước** khi code mới lên (code dùng cột/bảng/hàm mới mà DB chưa có sẽ hỏng).
5. Merge/push `master` → Vercel Production build → kiểm tra https://domus-francis-production.vercel.app.
6. Commit theo kiểu `feat|fix|chore(phạm vi): mô tả tiếng Việt`, kèm dòng `Co-Authored-By` theo hệ thống.

**Đã được người dùng cho phép sẵn** (2026-10-06): commit + push + chạy migration (staging và production, luôn dry-run trước) + theo dõi deploy mà không cần hỏi lại, sau khi đã kiểm tra tsc/build. **Không** tự làm: xóa dữ liệu, `--reset`, force push, đổi biến môi trường Vercel/Supabase, đổi domain — những việc này cần người dùng đồng ý riêng (việc gọi REST API Vercel đã từng bị hệ thống chặn cho tới khi người dùng cấp quyền).

## Migration & DB
- `db/migrations/01…52` = DDL thiết kế gốc (không sửa). `db/app/<số ≥ 991>_*.sql` = cấu trúc bổ sung của ứng dụng (idempotent, một file = một transaction). `db/data/*.sql` = dữ liệu nghiệp vụ (idempotent, chạy một lần). Số tiếp theo: xem file lớn nhất trong `db/app/`.
- `scripts/db/migrate.mjs` ghi `public.app_migrations` (tên + sha256); file đổi nội dung thì chạy lại. Dùng `--env staging|production` (đọc `MIGRATE_DATABASE_URL`).
- Bảng mới phải: bật + FORCE RLS, `OWNER TO luuxa_owner`, `REVOKE ALL FROM luuxa_app` rồi GRANT từng quyền/cột, trigger audit `app.tg_audit`. Hàm đặc quyền: `SECURITY DEFINER`, `SET search_path`, `OWNER TO luuxa_definer`. Mẫu: `db/app/1011_house_rules.sql`, `1018_public_articles.sql`.
- Dựng **DB mới hoàn toàn** (môi trường mới): `node scripts/db/bundle.mjs --apply <chuỗi chủ DB pooler> --allow-remote --api-password <mật khẩu luuxa_api>` → `pnpm db:migrate:<env>` (ghi nhận migration) → tạo 8 bucket Storage riêng tư (`avatars, receipts, cleaning-evidence, academic-evidence, maintenance, moments, attachments, documents`) qua REST `/storage/v1/bucket` bằng service_role → `node scripts/env/bootstrap-admin.mjs --env <env> --email … --name …` tạo Admin đầu tiên (mật khẩu tạm, bắt buộc đổi lần đầu). Dữ liệu mầm của thiết kế (vai trò, quyền, cấu hình, danh mục, phòng, trường ĐH) giữ nguyên; bỏ luật nhà mẫu.
- Biến Vercel kiểu *Sensitive* **không đọc lại được** (`vercel env pull` trả rỗng) — khi chuyển phạm vi dùng PATCH `target`, khi thêm mới phải có giá trị gốc từ `.env.<môi trường>`.

## Quy ước mã nguồn
- API: bọc bằng `api({auth?}, handler)` (`src/server/http.ts`); mọi truy vấn qua `ctx.db(tx => …)` (đã `SET LOCAL ROLE luuxa_app` + người dùng ⇒ RLS). Trang công khai chưa đăng nhập dùng `publicDb` (`src/server/public.ts`) hoặc `api({auth:"public"})`.
- Quyền giao diện: `useSession().can("<permission>")`; quyền mới thêm vào `permissions` + `role_permissions` bằng migration.
- **Giao diện sáng/tối**: màu qua bảng Tailwind đảo bằng biến CSS (`tailwind.palette.ts`, lớp `dark` trên `<html>`, `src/lib/theme.tsx`). Cứ dùng lớp Tailwind thường (`bg-white`, `text-gray-500`, `border-purple-100`…) — chúng tự đảo. `bg-white` = màu thẻ ở chế độ tối; nền đặc từ sắc 400 trở lên giữ nguyên (nút/banner chữ trắng). Chữ sáng đặt trên nền tối cố định (ảnh, banner) thì dùng giá trị cố định (`text-[#e9d5ff]`), nút trắng trên banner dùng `bg-[#ffffff]`. Kiểm tra cả hai giao diện bằng ảnh chụp.
- Form dùng component chung `src/components/ui/FormControls.tsx` (`CustomSelect/CustomInput/CustomTextarea/CustomToggle/CustomDatePicker`…), **không** dùng `<select>`/`<input>` mặc định trừ ô ẩn (`type=file`).
- Lỗi DB hiển thị cho người dùng đi qua `src/lib/humanize-error.ts`.
- Tránh `*/` trong chú thích CSS/`/* … */` (vd. `bg-*/text-*`) — làm vỡ build CSS.

## Tính năng chính đã có (để khỏi làm lại)
- **Bài viết công khai** (`/bai-viet` quản lý, quyền `article.manage`; `/tin-tuc` + `/tin-tuc/<slug>` công khai, SSR, Open Graph, bảng `public_articles`, ảnh qua `/api/v1/public/files/<id>`). Trợ lý AI viết bài: tác vụ `content.article_assist` (gợi ý đề tài, viết nháp, chỉnh văn, tiêu đề + tóm tắt) trong `src/server/ai/tasks.ts`.
- **Cổng AI** (`src/server/ai/*`, Groq → Gemini dự phòng): tác vụ phải có dòng trong `ai_task_types` (migration), công tắc tổng `feature.ai.enabled` (Cài đặt → Trợ lý AI) và khóa `GROQ_API_KEY`/`GEMINI_API_KEY`. Test không ra ngoài: `AI_TEST_BASE_URL=http://127.0.0.1:<cổng>` trỏ máy chủ giả loopback.
- **Chân trang** (`SiteFooter`/`AppFooter`), **đồng ý (consent) của chính mình** ở Cài đặt → Hồ sơ → Hồ sơ Công giáo (`/api/v1/consents`): hồ sơ Công giáo chỉ lưu khi thành viên đã đồng ý; không ghi sẵn đồng ý thay người khác.
- Production hiện: DB trống + 2 tài khoản Admin; công tắc AI tổng đang tắt (bật ở Cài đặt khi cần).

## Mẹo làm việc
- Windows + Git Bash: chuỗi bắt đầu bằng `/` bị đổi thành đường dẫn Windows → đặt `MSYS_NO_PATHCONV=1` khi truyền `/api/...` cho script/CLI. Heredoc dài có dấu nháy lẻ đôi khi lỗi — ghi file bằng công cụ Write.
- Chụp ảnh/kiểm thử giao diện: Playwright dùng Edge/Chrome có sẵn (`scripts/e2e/smoke.mjs` làm mẫu), đăng nhập tài khoản demo `duc.tran@luuxa.local` / `LuuXa@2026` **chỉ trên DB local/staging**.
- Vercel CLI 48 đã đăng nhập (`vercel whoami`); không có lệnh `vercel api`. Thao tác biến/domain dùng REST với token CLI (`%APPDATA%/com.vercel.cli/Data/auth.json`) — chỉ khi người dùng đã cho phép.
