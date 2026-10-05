import { api, uuidParam } from "@/server/http";
import { dutyWeekEntryById, reviewDutyWeek } from "@/server/modules/duty-weeks";
import { ReviewWeekSchema } from "@/server/modules/duty-weeks-schema";

/** Trưởng nhà/Admin đánh giá tuần trực: điểm 0–10, nhận xét, yêu cầu trực lại hay không. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReviewWeekSchema);
  return ctx.db(async (tx) => {
    await reviewDutyWeek(tx, id, { score: b.score, comment: b.comment ?? null, redo: b.redo, redoNote: b.redoNote ?? null });
    return dutyWeekEntryById(tx, id);
  });
});
