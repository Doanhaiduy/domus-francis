import { api, uuidParam } from "@/server/http";
import { deleteIssueCost, listIssues } from "@/server/modules/facilities";

/** Xóa một dòng dự toán (chỉ estimate). Quyền: issue.cost.propose. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const costId = uuidParam(ctx, "costId");
  return ctx.db(async (tx) => {
    await deleteIssueCost(tx, id, costId);
    return (await listIssues(tx, { id })).issues[0];
  });
});
