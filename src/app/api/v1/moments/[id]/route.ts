import { api, uuidParam } from "@/server/http";
import { deleteAlbum, getAlbum, updateAlbum } from "@/server/modules/moments";
import { UpdateAlbumSchema } from "@/server/modules/moments-schema";

/** GET chi tiết album + ảnh. */
export const GET = api({}, (ctx) => ctx.db((tx) => getAlbum(tx, uuidParam(ctx, "id"))));

/** PATCH sửa album (tác giả hoặc album.moderate; isFeatured/hidden chỉ album.moderate). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(UpdateAlbumSchema);
  return ctx.db(async (tx) => {
    await updateAlbum(tx, id, b);
    return getAlbum(tx, id);
  });
});

/** DELETE xóa mềm album (tác giả hoặc album.moderate). */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteAlbum(tx, id));
  return { ok: true };
});
