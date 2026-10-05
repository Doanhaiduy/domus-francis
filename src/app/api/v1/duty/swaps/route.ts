import { api } from "@/server/http";
import { listSwaps, notifyMembers, requestSwap } from "@/server/modules/duty";
import { SwapCreateSchema } from "@/server/modules/duty-schema";

/** Ca sắp tới của tôi + các đơn đổi ca liên quan (người xin / người nhận / người duyệt — RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listSwaps(tx)));

/** Bước 1: xin đổi ca (app.fn_request_duty_swap — BR-DUTY-11 trước giờ ca ≥ 12 giờ). Quyền: duty.swap.request. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SwapCreateSchema);
  const id = await ctx.db((tx) => requestSwap(tx, b));
  await notifyMembers(ctx, [b.toMemberId], "duty.swap_request", "Có người nhờ bạn đổi ca trực", b.reason, { table: "duty_swap_requests", id });
  return Response.json({ id }, { status: 201 });
});
