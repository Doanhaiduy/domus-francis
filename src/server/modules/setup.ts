import "server-only";
import type { Tx } from "../db";
import { forbidden } from "../errors";
import { providerList } from "./ai";

// Danh sách việc "Bắt đầu thiết lập" cho Admin/Trưởng nhà trên một hệ thống mới: mỗi việc tự tính xong/chưa từ dữ liệu thật.

export interface SetupItem {
  key: string;
  group: "basic" | "people" | "operation" | "security" | "public";
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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function getSetupStatus(tx: Tx): Promise<SetupStatusDto> {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_any_permission(ARRAY['setting.write', 'member.create']) AS ok")).rows[0].ok;
  if (!ok) throw forbidden("Chỉ Admin/Trưởng nhà xem được danh sách thiết lập.");

  const s = (
    await tx.query<Record<string, string | number | boolean | null>>(
      `SELECT
         (SELECT value FROM settings WHERE key = 'org.address')                       AS address,
         (SELECT value FROM settings WHERE key = 'org.contact_phone')                 AS phone,
         (SELECT value FROM settings WHERE key = 'org.chaplain_name')                 AS chaplain,
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
         (SELECT count(*) FROM user_mfa_factors WHERE confirmed_at IS NOT NULL)::int  AS mfa,
         (SELECT count(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'admin' WHERE ur.revoked_at IS NULL)::int AS admins`
    )
  ).rows[0];

  const aiConfigured = providerList().some((p) => p.configured);
  const receivingOk = !!s.receiving && typeof s.receiving === "object" && !!(s.receiving as Record<string, unknown>).accountNo;
  const zaloToken = !!process.env.ZALO_BOT_TOKEN;

  const items: SetupItem[] = [
    { key: "org", group: "basic", title: "Thông tin lưu xá", description: "Tên, địa chỉ, hotline, khẩu hiệu, bổn mạng — hiện trên trang công khai và chân trang.", href: "/cai-dat?tab=general", done: !!str(s.address) && !!str(s.phone), detail: !str(s.address) ? "Chưa có địa chỉ" : !str(s.phone) ? "Chưa có hotline" : undefined },
    { key: "structure", group: "basic", title: "Tầng và phòng ở", description: "Khai báo sơ đồ nhà để xếp chỗ ở cho thành viên.", href: "/so-do-nha", done: Number(s.rooms) > 0, detail: `${s.rooms} phòng` },
    { key: "academic", group: "basic", title: "Năm học và nhiệm kỳ người quản lý", description: "Năm học, học kỳ hiện hành và nhiệm kỳ người quản lý để phân quyền, thống kê.", href: "/cai-dat?tab=academic", done: Number(s.years) > 0 && Number(s.terms) > 0, detail: `${s.years} năm học · ${s.terms} nhiệm kỳ` },
    { key: "rules", group: "basic", title: "Luật nhà", description: "Soạn nội quy, giờ giấc để thành viên đọc và tải PDF.", href: "/thong-bao?tab=luat", done: Number(s.rules) > 0, detail: `${s.rules} mục` },
    { key: "members", group: "people", title: "Thành viên", description: "Thêm thành viên (hoặc nhập từ Excel) và cấp tài khoản đăng nhập.", href: "/thanh-vien", done: Number(s.members) > 2, detail: `${s.members} thành viên` },
    { key: "roles", group: "people", title: "Trưởng nhà, Thủ quỹ và các ban", description: "Gán vai trò Trưởng nhà, Thủ quỹ, Trưởng ban… cho đúng người.", href: "/cai-dat?tab=roles", done: Number(s.admins) > 0 && Number(s.members) > 2, optional: true },
    { key: "finance", group: "operation", title: "Tài khoản nhận quỹ", description: "Số tài khoản + mã VietQR để anh em chuyển khoản đóng quỹ.", href: "/thu-chi", done: receivingOk },
    { key: "zalo", group: "operation", title: "Nhóm Zalo của nhà", description: "Bot tự gửi lịch trực, nhắc quỹ, thông báo vào nhóm.", href: "/cai-dat?tab=zalo", done: zaloToken && s.zalo_on === true && !!str(s.zalo_chat), optional: true, detail: !zaloToken ? "Chưa có ZALO_BOT_TOKEN trên máy chủ" : s.zalo_on !== true ? "Chưa bật" : undefined },
    { key: "mfa", group: "security", title: "Xác thực 2 bước cho Admin", description: "Bật mã 6 số (Google Authenticator…) cho tài khoản Admin/Trưởng nhà.", href: "/cai-dat?tab=security", done: Number(s.mfa) > 0 },
    { key: "ai", group: "security", title: "Trợ lý AI", description: "Bật AI và đặt ngân sách tháng (cần khóa Groq/Gemini trên máy chủ).", href: "/cai-dat?tab=ai", done: s.ai_on === true && aiConfigured, optional: true, detail: !aiConfigured ? "Chưa có khóa API" : undefined },
    { key: "public", group: "public", title: "Bài viết công khai đầu tiên", description: "Đăng bài giới thiệu / tuyển sinh để người ngoài biết đến lưu xá.", href: "/bai-viet/moi", done: Number(s.articles) > 0, optional: true },
  ];
  const required = items.filter((i) => !i.optional);
  return { items, doneCount: items.filter((i) => i.done).length, requiredCount: required.length, requiredDone: required.filter((i) => i.done).length };
}
