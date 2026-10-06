import "server-only";
import type { Tx } from "../db";
import { notFound } from "../errors";
import type { NotificationDto, NotificationsDto } from "@/lib/types/community";
import { listAnnouncements, markAllRead as markAllAnnouncementsRead, unreadCounts } from "./announcements";
import { currentMemberId, iso } from "./community-shared";

// Đường dẫn mở khi bấm một thông báo (payload.link do hàm gửi đặt; còn lại suy theo bảng thực thể)
const LINK_BY_TABLE: Record<string, string> = {
  announcements: "/thong-bao",
  forum_posts: "/dien-dan",
  prayer_intentions: "/phung-vu",
  liturgy_assignments: "/phung-vu",
  events: "/lich-su-kien",
  expense_vouchers: "/thu-chi",
  contributions: "/thu-chi",
  duty_assignments: "/hau-can",
  duty_swap_requests: "/hau-can",
  duty_checkins: "/hau-can",
  maintenance_issues: "/hau-can",
  academic_records: "/hoc-tap",
  albums: "/khoanh-khac",
  leave_requests: "/xin-phep",
  admission_inquiries: "/bai-viet",
};
const LINK_BY_CATEGORY: Record<string, string> = {
  announcement: "/thong-bao",
  finance: "/thu-chi",
  duty: "/hau-can",
  event: "/lich-su-kien",
  academic: "/hoc-tap",
  facility: "/hau-can",
  laundry: "/hau-can",
  meal: "/bep-com",
  social: "/dien-dan",
  security: "/cai-dat",
  system: "/cai-dat",
};

export async function listNotifications(tx: Tx): Promise<NotificationsDto> {
  await currentMemberId(tx);
  const rows = (
    await tx.query(
      `SELECT n.id, n.type_code, t.name_vi, t.category, n.title, n.body, n.payload, n.entity_table, n.entity_id, n.priority::text,
              n.created_at, n.read_at
         FROM notifications n JOIN notification_types t ON t.code = n.type_code
        WHERE n.member_id = app.current_member_id() AND n.archived_at IS NULL AND (n.expires_at IS NULL OR n.expires_at > now())
        ORDER BY n.created_at DESC
        LIMIT 50`
    )
  ).rows;
  const items: NotificationDto[] = rows.map((r) => ({
    id: r.id,
    type: r.type_code,
    typeName: r.name_vi,
    category: r.category,
    title: r.title,
    body: r.body ?? null,
    priority: r.priority,
    createdAt: iso(r.created_at),
    isRead: !!r.read_at,
    link:
      (typeof r.payload?.link === "string" && r.payload.link.startsWith("/") && !r.payload.link.startsWith("//") ? r.payload.link : null) ??
      LINK_BY_TABLE[r.entity_table] ??
      LINK_BY_CATEGORY[r.category] ??
      null,
  }));
  const [announcements, unread] = [await listAnnouncements(tx, { limit: 30 }), await unreadCounts(tx)];
  return { items, announcements, unread };
}

export async function markNotificationRead(tx: Tx, id: string) {
  const r = await tx.query(
    "UPDATE notifications SET read_at = now() WHERE id = $1 AND member_id = app.current_member_id() AND read_at IS NULL",
    [id]
  );
  if (!r.rowCount) {
    const exists = (await tx.query("SELECT 1 FROM notifications WHERE id = $1", [id])).rowCount;
    if (!exists) throw notFound("Không tìm thấy thông báo.");
  }
}

/** Đánh dấu đã đọc toàn bộ hộp thư (và tùy chọn mọi thông báo bảng tin gửi tới mình). */
export async function markAllNotificationsRead(tx: Tx, includeAnnouncements: boolean) {
  await currentMemberId(tx);
  const r = await tx.query(
    "UPDATE notifications SET read_at = now() WHERE member_id = app.current_member_id() AND read_at IS NULL AND archived_at IS NULL"
  );
  const ann = includeAnnouncements ? await markAllAnnouncementsRead(tx) : 0;
  return { notifications: r.rowCount ?? 0, announcements: ann };
}
