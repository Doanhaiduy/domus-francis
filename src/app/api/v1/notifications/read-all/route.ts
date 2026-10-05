import { api } from "@/server/http";
import { markAllNotificationsRead } from "@/server/modules/notifications";
import { ReadAllSchema } from "@/server/modules/community-schema";

/** Đánh dấu đã đọc toàn bộ hộp thư; mặc định kèm mọi thông báo bảng tin gửi tới mình. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ReadAllSchema);
  return ctx.db((tx) => markAllNotificationsRead(tx, b.includeAnnouncements !== false));
});
