import { api, uuidParam } from "@/server/http";
import { getAlbum, removeVideo, updateVideo } from "@/server/modules/moments";
import { UpdateVideoSchema } from "@/server/modules/moments-schema";
import { deleteVideoObject } from "@/server/video";

export const runtime = "nodejs";

/** PATCH sửa chú thích (người tải lên hoặc album.moderate); hidden chỉ album.moderate. Trả về album sau khi sửa. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "videoId");
  const b = await ctx.body(UpdateVideoSchema);
  return ctx.db(async (tx) => getAlbum(tx, await updateVideo(tx, id, b)));
});

/** DELETE xóa video (người tải lên hoặc album.moderate): ẩn khỏi album và xóa tệp ở nơi lưu trữ. Trả về album sau khi xóa. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "videoId");
  const { albumId, asset } = await ctx.db((tx) => removeVideo(tx, id));
  await deleteVideoObject(asset);
  return ctx.db((tx) => getAlbum(tx, albumId));
});
