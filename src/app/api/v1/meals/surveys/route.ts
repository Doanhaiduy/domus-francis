import { api } from "@/server/http";
import { createSurvey, kdb, listSurveys } from "@/server/modules/kitchen";
import { SurveyCreateSchema } from "@/server/modules/kitchen-schema";

export const GET = api({}, (ctx) => kdb(ctx, listSurveys));

/** Tạo phiếu khảo sát món (meal.manage). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SurveyCreateSchema);
  return kdb(ctx, async (tx) => {
    const r = await createSurvey(tx, b);
    return { ...r, surveys: await listSurveys(tx) };
  });
});
