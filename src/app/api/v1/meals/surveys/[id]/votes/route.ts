import { api, uuidParam } from "@/server/http";
import { kdb, listSurveys, voteSurvey } from "@/server/modules/kitchen";
import { SurveyVoteSchema } from "@/server/modules/kitchen-schema";

/** Thay toàn bộ phiếu của tôi trong khảo sát (tối đa max_choices món; khảo sát phải còn mở — trigger DB kiểm). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(SurveyVoteSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await voteSurvey(tx, id, b.optionIds);
    return listSurveys(tx);
  });
});
