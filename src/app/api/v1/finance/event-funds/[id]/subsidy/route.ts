import { api, uuidParam } from "@/server/http";
import { SubsidySchema, houseSubsidy } from "@/server/modules/event-funds";

/** Quỹ nhà bù tiền sang quỹ riêng (Trưởng nhà, lý do ≥ 10 ký tự). Ghi bút toán điều chỉnh ở cả hai quỹ + nhật ký kiểm toán. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SubsidySchema);
  await ctx.db((tx) => houseSubsidy(tx, id, b));
  return Response.json({ ok: true }, { status: 201 });
});
