import { api, uuidParam } from "@/server/http";
import { borrowAsset } from "@/server/modules/facilities";
import { BorrowSchema } from "@/server/modules/duty-schema";

/** Mượn thiết bị cho chính mình (asset_loans). BR-FAC-06 + EXCLUDE ex_asset_loans__one_borrower (một người mượn tại một thời điểm). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BorrowSchema);
  const id = await ctx.db((tx) => borrowAsset(tx, uuidParam(ctx, "id"), b.dueAt));
  return Response.json({ id }, { status: 201 });
});
