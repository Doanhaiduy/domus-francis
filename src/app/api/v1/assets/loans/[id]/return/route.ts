import { api, uuidParam } from "@/server/http";
import { returnAsset } from "@/server/modules/facilities";
import { ReturnSchema } from "@/server/modules/duty-schema";

/** Ghi nhận trả thiết bị: người mượn hoặc asset.manage (RLS asset_loans__update). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ReturnSchema);
  await ctx.db((tx) => returnAsset(tx, uuidParam(ctx, "id"), b.note ?? null));
  return { ok: true };
});
