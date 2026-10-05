import { api, uuidParam } from "@/server/http";
import { decideSwap, notifyMembers } from "@/server/modules/duty";
import { SwapDecideSchema } from "@/server/modules/duty-schema";
import { dm } from "@/lib/duty-format";

/** Bước 3: Ban điều hành duyệt (hoán đổi người trực) hoặc từ chối. BR-DUTY-28: người trong cuộc không tự duyệt. Quyền: duty.swap.approve. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SwapDecideSchema);
  const p = await ctx.db((tx) => decideSwap(tx, id, b.approve, b.note ?? null));
  if (p) {
    await notifyMembers(
      ctx,
      [p.from_member_id, p.to_member_id],
      "duty.swap_decided",
      b.approve ? "Đơn đổi ca đã được duyệt" : "Đơn đổi ca bị từ chối",
      `${p.area} ${dm(p.duty_date)}${b.note ? ` — ${b.note}` : ""}`,
      { table: "duty_swap_requests", id }
    );
  }
  return { ok: true };
});
