import "server-only";
import type { Tx } from "../db";
import { notFound } from "../errors";
import type { NotificationDto, NotificationsDto } from "@/lib/types/community";
import { notificationLink } from "@/lib/notification-link";
import { listAnnouncements, markAllRead as markAllAnnouncementsRead, unreadCounts } from "./announcements";
import { currentMemberId, iso } from "./community-shared";

// Đường dẫn mở khi bấm một thông báo: payload.link do hàm gửi đặt; thiếu thì suy theo LOẠI thông báo, rồi bảng thực thể, rồi nhóm
// (quy tắc chung với thông báo đẩy — src/lib/notification-link.ts).

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
    link: notificationLink({ typeCode: r.type_code, entityTable: r.entity_table, category: r.category, payload: r.payload }),
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
