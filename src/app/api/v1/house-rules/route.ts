import { api } from "@/server/http";
import { createRuleSection, listHouseRules, RuleSectionSchema } from "@/server/modules/house-rules";

/** Luật nhà: các mục + điều khoản (mọi thành viên xem; người quản lý thấy cả mục đang ẩn). */
export const GET = api({}, (ctx) => ctx.db((tx) => listHouseRules(tx)));

/** Thêm một mục luật nhà (house.rules.manage). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RuleSectionSchema);
  const r = await ctx.db((tx) => createRuleSection(tx, b));
  return Response.json(r, { status: 201 });
});
