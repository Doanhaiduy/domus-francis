import { api } from "@/server/http";
import { DelegationCreateSchema, createDelegation, listDelegations, notifyDelegationCreated } from "@/server/modules/delegations";

/** Ủy quyền vai trò tạm thời: của tôi (đã giao / được giao) — người có auth.role.assign thấy tất cả; kèm vai trò tôi ủy quyền được. */
export const GET = api({}, (ctx) => ctx.db((tx) => listDelegations(tx)));

/** Tạo ủy quyền (người giữ vai trò, quyền auth.role.delegate): vai trò + người nhận + khoảng ngày (≤ 60 ngày) + lý do. Báo người nhận. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(DelegationCreateSchema);
  const r = await ctx.db((tx) => createDelegation(tx, b));
  await notifyDelegationCreated(ctx, r.id);
  return { id: r.id };
});
