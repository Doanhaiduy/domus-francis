import { api } from "@/server/http";
import { createAsset, listAssets } from "@/server/modules/facilities";
import { AssetCreateSchema } from "@/server/modules/duty-schema";

/** Thiết bị & đồ dùng chung + lượt mượn đang mở. Quyền: asset.read (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listAssets(tx)));

/** Thêm thiết bị vào sổ tài sản (mã tự sinh). Quyền: asset.manage (RLS). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(AssetCreateSchema);
  const id = await ctx.db((tx) => createAsset(tx, b));
  return Response.json({ id }, { status: 201 });
});
