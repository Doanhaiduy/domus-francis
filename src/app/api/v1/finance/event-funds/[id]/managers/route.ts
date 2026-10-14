import { api, uuidParam } from "@/server/http";
import { ManagersSchema, setManagers } from "@/server/modules/event-funds";

/** Đổi người phụ trách quỹ (1–5 người) — chỉ người quản lý quỹ nhà (finance.fund.manage). */
export const PUT = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ManagersSchema);
  await ctx.db((tx) => setManagers(tx, id, b));
  return { ok: true };
});
