import { api, uuidParam } from "@/server/http";
import { RulePatchSchema, deleteRule, updateRule } from "@/server/modules/discipline";

export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(RulePatchSchema);
  await ctx.db((tx) => updateRule(tx, id, b));
  return { ok: true };
});

/** Xóa điều luật: các vi phạm đã ghi vẫn giữ nguyên (đã lưu bản sao tên điều luật). */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteRule(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
