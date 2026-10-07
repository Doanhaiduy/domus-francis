import { api } from "@/server/http";
import { AdjustmentSchema, listManualEntries, postAdjustment } from "@/server/modules/finance-adjust";

/** Bút toán ghi tay gần đây (số dư đầu kỳ + điều chỉnh) — cần finance.ledger.read. */
export const GET = api({}, (ctx) => ctx.db((tx) => listManualEntries(tx)));

/**
 * Ghi bút toán điều chỉnh sổ quỹ (cộng vào / trừ khỏi quỹ, kèm lý do ≥ 10 ký tự) — Trưởng nhà / Admin (finance.ledger.adjust).
 * Bút toán bất biến: sai thì ghi thêm bút toán ngược lại, không sửa/xóa.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(AdjustmentSchema);
  const id = await ctx.db((tx) => postAdjustment(tx, b));
  return Response.json({ id }, { status: 201 });
});
