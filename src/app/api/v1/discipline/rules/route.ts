import { api } from "@/server/http";
import { RuleSchema, createRule, listRules } from "@/server/modules/discipline";

/** Danh mục điều luật + mức phạt gợi ý. Thành viên chỉ thấy điều đang áp dụng; người quản lý (discipline.manage) thấy cả điều đã ẩn + số lần đã dùng. */
export const GET = api({}, (ctx) => ctx.db((tx) => listRules(tx)));

/** Thêm điều luật (discipline.manage — RLS). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RuleSchema);
  const id = await ctx.db((tx) => createRule(tx, b));
  return Response.json({ id }, { status: 201 });
});
