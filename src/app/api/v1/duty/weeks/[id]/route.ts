import { api, uuidParam } from "@/server/http";
import { deleteDutyWeek } from "@/server/modules/duty-weeks";

/** Hủy lịch trực của một tuần chưa đánh giá. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteDutyWeek(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
