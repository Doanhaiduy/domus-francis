import "server-only";
import type { Ctx } from "../http";
import { forbidden } from "../errors";
import { providerList } from "./ai";

// Danh sách việc "Bắt đầu thiết lập" cho Admin/Trưởng nhà trên một hệ thống mới: mỗi việc tự tính xong/chưa từ dữ liệu thật.
// Quyền xem kiểm dưới RLS (luuxa_app + người dùng); số liệu đếm bằng vai trò worker (bỏ qua RLS) vì chỉ trả SỐ ĐẾM / CÓ-KHÔNG trên toàn hệ thống
// (người quản lý có thể không có quyền đọc từng bảng, vd. sổ quỹ). Nhóm "Vận hành hệ thống" chỉ Admin (system.monitor) thấy và chỉ báo
// biến môi trường CÓ/KHÔNG — không bao giờ trả giá trị.

export type SetupGroup = "basic" | "people" | "operation" | "security" | "public" | "system";

export interface SetupItem {
  key: string;
  group: SetupGroup;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Việc không bắt buộc (không tính vào tiến độ "cần làm"). */
  optional?: boolean;
  detail?: string;
}

export interface SetupStatusDto {
  items: SetupItem[];
  doneCount: number;
  requiredCount: number;
  requiredDone: number;
}

type Val = string | number | boolean | Date | Record<string, unknown> | null;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const has = (...names: string[]) => names.every((n) => (process.env[n] ?? "").trim().length > 0);
const asDate = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(String(v)) : null);
/** "18:04 ngày 12/10" (giờ Việt Nam) */
const dm = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ngày ${p.day}/${p.month}`;
};

export async function getSetupStatus(ctx: Pick<Ctx, "db" | "dbAs">): Promise<SetupStatusDto> {
  const access = await ctx.db(
    async (tx) =>
      (await tx.query<{ ok: boolean; sys: boolean }>("SELECT app.has_any_permission(ARRAY['setting.write', 'member.create']) AS ok, app.has_permission('system.monitor') AS sys")).rows[0],
  );
  if (!access?.ok) throw forbidden("Chỉ Admin/Trưởng nhà xem được danh sách thiết lập.");

  const s = await ctx.dbAs("luuxa_worker", async (tx) =>
    (
      await tx.query<Record<string, Val>>(
        `SELECT
           (SELECT value FROM settings WHERE key = 'org.address')                       AS address,
           (SELECT value FROM settings WHERE key = 'org.contact_phone')                 AS phone,
           (SELECT value FROM settings WHERE key = 'org.about')                         AS about,
           (SELECT value FROM settings WHERE key = 'feature.ai.enabled')                AS ai_on,
           (SELECT value FROM settings WHERE key = 'integration.zalo.group_enabled')    AS zalo_on,
           (SELECT value FROM settings WHERE key = 'integration.zalo.group_chat_id')    AS zalo_chat,
           (SELECT value FROM settings WHERE key = 'finance.receiving_account')         AS receiving,
           (SELECT count(*) FROM rooms WHERE deleted_at IS NULL)::int                   AS rooms,
           (SELECT count(*) FROM members WHERE deleted_at IS NULL AND status = 'active')::int AS members,
           (SELECT count(*) FROM academic_years)::int                                   AS years,
           (SELECT count(*) FROM board_terms)::int                                      AS terms,
           (SELECT count(*) FROM house_rule_sections WHERE is_active)::int              AS rules,
           (SELECT count(*) FROM public_articles WHERE status = 'published' AND deleted_at IS NULL)::int AS articles,
           (SELECT count(*) FROM public_faqs WHERE is_active)::int                      AS faqs,
           (SELECT count(*) FROM public_faqs WHERE NOT is_active)::int                  AS faq_drafts,
           (SELECT count(*) FROM albums WHERE is_public AND status = 'published' AND deleted_at IS NULL)::int AS public_albums,
           (SELECT count(DISTINCT ur.user_id) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code IN ('admin', 'house_head')
             WHERE ur.revoked_at IS NULL)::int                                          AS managers,
           (SELECT count(DISTINCT ur.user_id) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code IN ('admin', 'house_head')
              JOIN user_mfa_factors f ON f.user_id = ur.user_id AND f.confirmed_at IS NOT NULL
             WHERE ur.revoked_at IS NULL)::int                                          AS managers_mfa,
           (SELECT count(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'admin' WHERE ur.revoked_at IS NULL)::int AS admins,
           -- Túi quỹ đang dùng chưa có bút toán nào (last_seq = 0) ⇒ chưa nhập số dư đầu kỳ
           (SELECT count(*) FROM funds WHERE is_active AND deleted_at IS NULL)::int     AS funds,
           (SELECT string_agg(name, ', ' ORDER BY code) FROM funds WHERE is_active AND deleted_at IS NULL AND last_seq = 0) AS funds_unopened,
           (SELECT max(finished_at) FROM job_runs WHERE kind = 'backup' AND ok)         AS backup_at,
           (SELECT max(finished_at) FROM job_runs WHERE kind LIKE 'cron:%' AND ok)      AS cron_at`,
      )
    ).rows[0],
  );

  const aiConfigured = providerList().some((p) => p.configured);
  const receiving = s.receiving && typeof s.receiving === "object" ? (s.receiving as Record<string, unknown>) : null;
  const receivingOk = !!receiving && !!str(receiving.accountNo);
  const zaloToken = !!process.env.ZALO_BOT_TOKEN;
  const n = (k: string) => Number(s[k]) || 0;
  const unopened = str(s.funds_unopened);
  const backupAt = asDate(s.backup_at);
  const backupFresh = !!backupAt && Date.now() - backupAt.getTime() < 36 * 3600_000;
  const cronAt = asDate(s.cron_at);

  const items: SetupItem[] = [
    { key: "org", group: "basic", title: "Thông tin lưu xá", description: "Tên, địa chỉ, hotline, khẩu hiệu, bổn mạng — hiện trên trang công khai và chân trang.", href: "/cai-dat?tab=general", done: !!str(s.address) && !!str(s.phone), detail: !str(s.address) ? "Chưa có địa chỉ" : !str(s.phone) ? "Chưa có hotline" : undefined },
    { key: "structure", group: "basic", title: "Tầng và phòng ở", description: "Khai báo sơ đồ nhà để xếp chỗ ở cho thành viên.", href: "/so-do-nha", done: n("rooms") > 0, detail: `${n("rooms")} phòng` },
    { key: "academic", group: "basic", title: "Năm học và nhiệm kỳ người quản lý", description: "Năm học, học kỳ hiện hành và nhiệm kỳ người quản lý để phân quyền, thống kê.", href: "/cai-dat?tab=academic", done: n("years") > 0 && n("terms") > 0, detail: `${n("years")} năm học · ${n("terms")} nhiệm kỳ` },
    { key: "rules", group: "basic", title: "Luật nhà", description: "Soạn nội quy, giờ giấc để thành viên đọc và tải PDF.", href: "/thong-bao?tab=luat", done: n("rules") > 0, detail: `${n("rules")} mục` },
    { key: "members", group: "people", title: "Thành viên", description: "Thêm thành viên (hoặc nhập từ Excel) và cấp tài khoản đăng nhập.", href: "/thanh-vien", done: n("members") > 2, detail: `${n("members")} thành viên` },
    { key: "roles", group: "people", title: "Trưởng nhà, Thủ quỹ và các ban", description: "Gán vai trò Trưởng nhà, Thủ quỹ, Trưởng ban… cho đúng người.", href: "/cai-dat?tab=roles", done: n("admins") > 0 && n("members") > 2, optional: true },
    { key: "finance", group: "operation", title: "Tài khoản nhận quỹ", description: "Số tài khoản + mã VietQR để anh em chuyển khoản đóng quỹ.", href: "/thu-chi", done: receivingOk },
    {
      key: "opening",
      group: "operation",
      title: "Số dư quỹ đầu kỳ",
      description: "Nhập số tiền quỹ đang có khi bắt đầu dùng hệ thống (mỗi túi quỹ một lần, ở Thu chi → Tổng quan) để sổ quỹ khớp với tiền thật.",
      href: "/thu-chi",
      done: n("funds") > 0 && !unopened,
      detail: n("funds") === 0 ? "Chưa có túi quỹ đang dùng" : unopened ? `Chưa nhập: ${unopened}` : `${n("funds")} túi quỹ đã khởi tạo sổ`,
    },
    { key: "zalo", group: "operation", title: "Nhóm Zalo của nhà", description: "Bot tự gửi lịch trực, nhắc quỹ, thông báo vào nhóm.", href: "/cai-dat?tab=zalo", done: zaloToken && s.zalo_on === true && !!str(s.zalo_chat), optional: true, detail: !zaloToken ? "Chưa có ZALO_BOT_TOKEN trên máy chủ" : s.zalo_on !== true ? "Chưa bật" : undefined },
    {
      key: "mfa",
      group: "security",
      title: "Xác thực 2 bước cho Admin",
      description: "Bật mã 6 số (Google Authenticator…) cho tài khoản Admin/Trưởng nhà.",
      href: "/cai-dat?tab=security",
      done: n("managers_mfa") > 0,
      detail: n("managers") ? `${n("managers_mfa")}/${n("managers")} tài khoản quản lý đã bật` : undefined,
    },
    { key: "ai", group: "security", title: "Trợ lý AI", description: "Bật AI và đặt ngân sách tháng (cần khóa Groq/Gemini trên máy chủ).", href: "/cai-dat?tab=ai", done: s.ai_on === true && aiConfigured, optional: true, detail: !aiConfigured ? "Chưa có khóa API" : undefined },
    {
      key: "about",
      group: "public",
      title: "Trang Giới thiệu",
      description: "Viết vài đoạn về lịch sử, tinh thần và đời sống chung của nhà — khách mở trang web sẽ thấy trang này đầu tiên.",
      href: "/cai-dat?tab=general",
      done: str(s.about).length >= 20,
      detail: str(s.about) ? undefined : "Đang dùng đoạn giới thiệu mặc định",
    },
    {
      key: "faqs",
      group: "public",
      title: "Hỏi đáp công khai",
      description: "Đăng ít nhất 3 câu hỏi thường gặp (chi phí, giờ giấc, giấy tờ…) ở Trang công khai → tab Hỏi đáp; đã có sẵn câu nháp để sửa.",
      href: "/bai-viet?tab=faq",
      done: n("faqs") >= 3,
      optional: true,
      detail: `${n("faqs")} câu đã đăng${n("faq_drafts") ? ` · ${n("faq_drafts")} câu nháp` : ""}`,
    },
    { key: "public", group: "public", title: "Bài viết công khai đầu tiên", description: "Đăng bài giới thiệu / tuyển sinh để người ngoài biết đến lưu xá.", href: "/bai-viet/moi", done: n("articles") > 0, optional: true },
    {
      key: "albums",
      group: "public",
      title: "Album ảnh công khai",
      description: "Chọn vài album đẹp ở Khoảnh khắc để hiện ở Thư viện ảnh công khai (người trong ảnh cần đồng ý).",
      href: "/khoanh-khac",
      done: n("public_albums") > 0,
      optional: true,
      detail: `${n("public_albums")} album công khai`,
    },
  ];

  if (access.sys) {
    items.push(
      {
        key: "sys-cron",
        group: "system",
        title: "Tác vụ tự động hằng ngày",
        description: "Nhắc quỹ, lịch trực, dọn dữ liệu… chạy theo lịch của Vercel Cron — cần khóa CRON_SECRET trên máy chủ.",
        href: "/cai-dat?tab=system",
        done: has("CRON_SECRET"),
        optional: true,
        detail: !has("CRON_SECRET") ? "Chưa đặt CRON_SECRET" : cronAt ? `Lần chạy gần nhất: ${dm(cronAt)}` : "Chưa ghi nhận lần chạy nào",
      },
      {
        key: "sys-push",
        group: "system",
        title: "Thông báo đẩy",
        description: "Gửi thông báo tới điện thoại/máy tính của anh em kể cả khi không mở ứng dụng — cần cặp khóa VAPID.",
        href: "/cai-dat?tab=system",
        done: has("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"),
        optional: true,
        detail: has("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY") ? undefined : "Chưa đặt VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY",
      },
      {
        key: "sys-email",
        group: "system",
        title: "Gửi email",
        description: "Quên mật khẩu, đổi email đăng nhập, thông báo qua email — cần tài khoản Resend và tên miền riêng.",
        href: "/cai-dat?tab=system",
        done: has("RESEND_API_KEY", "EMAIL_FROM"),
        optional: true,
        detail: has("RESEND_API_KEY", "EMAIL_FROM") ? undefined : "Chưa đặt RESEND_API_KEY / EMAIL_FROM",
      },
      {
        key: "sys-backup",
        group: "system",
        title: "Sao lưu tự động",
        description: "Kho sao lưu riêng gửi nhịp tim về sau mỗi lần sao lưu CSDL hằng ngày.",
        href: "/cai-dat?tab=system",
        done: backupFresh,
        optional: true,
        detail: backupAt ? `Lần gần nhất: ${dm(backupAt)}${backupFresh ? "" : " — quá 36 giờ"}` : "Chưa nhận được nhịp tim sao lưu",
      },
    );
  }

  const required = items.filter((i) => !i.optional);
  return { items, doneCount: items.filter((i) => i.done).length, requiredCount: required.length, requiredDone: required.filter((i) => i.done).length };
}
