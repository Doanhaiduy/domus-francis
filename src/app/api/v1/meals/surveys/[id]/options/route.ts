import { api, uuidParam } from "@/server/http";
import { kdb, listSurveys, suggestOption } from "@/server/modules/kitchen";
import { SurveyOptionSchema } from "@/server/modules/kitchen-schema";

/** Đề xuất thêm món vào khảo sát đang mở (thành viên: tối đa 3 món; Ban Ẩm thực: không giới hạn). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SurveyOptionSchema);
  const id = uuidParam(ctx, "id");
  return kdb(ctx, async (tx) => {
    await suggestOption(tx, id, b.label);
    return listSurveys(tx);
  });
});
