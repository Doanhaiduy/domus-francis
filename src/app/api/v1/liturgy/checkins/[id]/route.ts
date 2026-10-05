import { api, uuidParam } from "@/server/http";
import { deleteCheckin } from "@/server/modules/liturgy-calendar";

/** Hủy check-in của chính mình khi chưa được duyệt. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteCheckin(tx, id));
  return { ok: true };
});
