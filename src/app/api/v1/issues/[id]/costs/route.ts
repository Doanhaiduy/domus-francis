import { api, uuidParam } from "@/server/http";
import { addIssueCost, listIssues } from "@/server/modules/facilities";
import { IssueCostSchema } from "@/server/modules/duty-schema";

/** Thêm dự toán chi phí sửa chữa (repair_costs, cost_kind = estimate). Chi phí thực do phiếu chi gắn sự cố tự sinh khi đã chi. Quyền: issue.cost.propose. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(IssueCostSchema);
  return ctx.db(async (tx) => {
    await addIssueCost(tx, id, b.amount, b.description);
    return (await listIssues(tx, { id })).issues[0];
  });
});
