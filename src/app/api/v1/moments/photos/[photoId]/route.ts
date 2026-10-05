import { api, uuidParam } from "@/server/http";
import { deletePhoto, getAlbum, updatePhoto } from "@/server/modules/moments";
import { UpdatePhotoSchema } from "@/server/modules/moments-schema";

/** PATCH sửa chú thích (người tải ảnh lên hoặc album.moderate); hidden chỉ album.moderate. Trả về album sau khi sửa. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "photoId");
  const b = await ctx.body(UpdatePhotoSchema);
  return ctx.db(async (tx) => getAlbum(tx, await updatePhoto(tx, id, b)));
});

/** DELETE xóa mềm ảnh (người tải lên hoặc album.moderate). Trả về album sau khi xóa. */
export const DELETE = api({}, (ctx) => ctx.db(async (tx) => getAlbum(tx, await deletePhoto(tx, uuidParam(ctx, "photoId")))));
