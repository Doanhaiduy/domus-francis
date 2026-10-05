import { api } from "@/server/http";
import { ActivityQuerySchema, listActions } from "@/server/activity";
import { badRequest } from "@/server/errors";

/** Thao tác ghi của người dùng (chỉ Admin — activity.log.read). */
export const GET = api({}, async (ctx) => {
  const parsed = ActivityQuerySchema.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Bộ lọc không hợp lệ.");
  return ctx.db((tx) => listActions(tx, parsed.data));
});
