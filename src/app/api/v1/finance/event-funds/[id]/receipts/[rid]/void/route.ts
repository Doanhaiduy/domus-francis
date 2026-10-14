import { api, uuidParam } from "@/server/http";
import { VoidReceiptSchema, voidReceipt } from "@/server/modules/event-funds";

/** Hủy phiếu thu bằng bút toán đảo (cần đủ số dư quỹ). Lý do tối thiểu 5 ký tự. */
export const POST = api({}, async (ctx) => {
  const rid = uuidParam(ctx, "rid");
  const b = await ctx.body(VoidReceiptSchema);
  await ctx.db((tx) => voidReceipt(tx, rid, b));
  return { ok: true };
});
