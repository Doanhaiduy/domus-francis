import { api, uuidParam } from "@/server/http";
import { voidPayment } from "@/server/modules/finance-contributions";
import { ReasonSchema } from "@/server/modules/finance-schema";

/** Hủy phiếu thu bằng bút toán đảo (không xóa) — khoản phải thu tự về chưa đóng/đóng một phần. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReasonSchema);
  await ctx.db((tx) => voidPayment(tx, id, b.reason));
  return { ok: true };
});
