import { api, uuidParam } from "@/server/http";
import { notifyDelegationRevoked, revokeDelegation } from "@/server/modules/delegations";

/** Thu hồi sớm một ủy quyền (người ủy quyền, hoặc người có quyền gán vai trò). Quyền của người nhận mất ngay. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const r = await ctx.db((tx) => revokeDelegation(tx, id));
  await notifyDelegationRevoked(ctx, id, r.byDelegator);
  return { ok: true };
});
