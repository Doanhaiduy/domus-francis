import { api, uuidParam } from "@/server/http";
import { DataRequestPatchSchema, notifyDataRequestUpdated, updateDataRequest } from "@/server/modules/data-requests";

/** Người quản lý (privacy.manage): đổi trạng thái và/hoặc trả lời. Có thay đổi ⇒ báo người gửi. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(DataRequestPatchSchema);
  const r = await ctx.db((tx) => updateDataRequest(tx, id, b));
  if (r.notify) await notifyDataRequestUpdated(ctx, { id, memberId: r.memberId, type: r.type, status: r.status });
  return { ok: true, status: r.status };
});
