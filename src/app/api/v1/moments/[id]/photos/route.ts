import { api, uuidParam } from "@/server/http";
import { addPhotos, getAlbum } from "@/server/modules/moments";
import { AddPhotosSchema } from "@/server/modules/moments-schema";

/** POST thêm ảnh (tệp bucket moments do chính mình tải lên) vào album của mình hoặc khi có album.moderate. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(AddPhotosSchema);
  const album = await ctx.db(async (tx) => {
    await addPhotos(tx, id, b.photos);
    return getAlbum(tx, id);
  });
  return Response.json(album, { status: 201 });
});
