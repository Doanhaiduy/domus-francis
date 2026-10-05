import { api } from "@/server/http";
import { ActivityQuerySchema, listActivityUsers } from "@/server/activity";
import { badRequest } from "@/server/errors";

/** Tổng hợp theo người dùng (chỉ Admin — activity.log.read). */
export const GET = api({}, async (ctx) => {
  const parsed = ActivityQuerySchema.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Bộ lọc không hợp lệ.");
  return ctx.db((tx) => listActivityUsers(tx, parsed.data).then((users) => ({ users })));
});
