import { api, uuidParam } from "@/server/http";
import { deleteSurvey, kdb, listSurveys, setSurveyStatus } from "@/server/modules/kitchen";
import { SurveyPatchSchema } from "@/server/modules/kitchen-schema";

/** Đóng / mở lại khảo sát (meal.manage). */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(SurveyPatchSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await setSurveyStatus(tx, id, b.status);
    return listSurveys(tx);
  });
});

export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await deleteSurvey(tx, id);
    return listSurveys(tx);
  });
});
