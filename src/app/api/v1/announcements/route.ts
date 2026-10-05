import { api } from "@/server/http";
import { createAnnouncement, listAnnouncements } from "@/server/modules/announcements";
import { CreateAnnouncementSchema } from "@/server/modules/community-schema";
import { postToZaloGroup } from "@/server/integrations/zalo";

/** GET ?limit=N&category=<mã|id>&unread=1 — thông báo mới nhất (ghim trước), isUnread theo từng người. */
export const GET = api({}, (ctx) =>
  ctx.db((tx) =>
    listAnnouncements(tx, {
      limit: Number(ctx.query.get("limit")) || undefined,
      category: ctx.query.get("category"),
      unreadOnly: ctx.query.get("unread") === "1",
    })
  )
);

/** POST — đăng thông báo (announcement.create; ghim/cần xác nhận cần announcement.pin; gửi hộp thư cần notification.send). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CreateAnnouncementSchema);
  const out = await ctx.db((tx) => createAnnouncement(tx, b));
  const body = b.content.trim();
  const zalo = b.notifyZalo
    ? await postToZaloGroup(ctx, "announcement", `📣 THÔNG BÁO: ${b.title.trim()}\n${body.length > 400 ? `${body.slice(0, 400)}…` : body}\n👉 Xem chi tiết trên web Lưu Xá.`)
    : null;
  return Response.json({ ...out, zalo }, { status: 201 });
});
