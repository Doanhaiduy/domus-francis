import { api } from "@/server/http";
import { ActivityQuerySchema, listLogins } from "@/server/activity";
import { badRequest } from "@/server/errors";

/** Nhật ký đăng nhập (chỉ Admin — activity.log.read). */
export const GET = api({}, async (ctx) => {
  const parsed = ActivityQuerySchema.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Bộ lọc không hợp lệ.");
  return ctx.db((tx) => listLogins(tx, parsed.data));
});
