import { api, uuidParam } from "@/server/http";
import { cancelSession } from "@/server/modules/liturgy";
import { CancelSessionSchema } from "@/server/modules/community-schema";

/** Hủy buổi phụng vụ (status cancelled + lý do) — liturgy.manage. */
export const DELETE = api({}, async (ctx) => {
  const b = await ctx.body(CancelSessionSchema);
  await ctx.db((tx) => cancelSession(tx, uuidParam(ctx, "id"), b.reason));
  return { ok: true };
});
