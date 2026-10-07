import { api, uuidParam } from "@/server/http";
import { notifyMembers, respondSwap } from "@/server/modules/duty";
import { SwapRespondSchema } from "@/server/modules/duty-schema";
import { dm } from "@/lib/duty-format";

/** Bước 2: người được nhờ đồng ý (→ chờ người quản lý duyệt) hoặc từ chối (app.fn_peer_respond_duty_swap). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SwapRespondSchema);
  const p = await ctx.db((tx) => respondSwap(tx, id, b.accept, b.note ?? null));
  if (p) {
    await notifyMembers(
      ctx,
      [p.from_member_id],
      "duty.swap_decided",
      b.accept ? "Người nhận đã đồng ý đổi ca" : "Người nhận từ chối đổi ca",
      `${p.area} ${dm(p.duty_date)}${b.accept ? " — chờ người quản lý duyệt." : b.note ? ` — ${b.note}` : ""}`,
      { table: "duty_swap_requests", id }
    );
  }
  return { ok: true };
});
