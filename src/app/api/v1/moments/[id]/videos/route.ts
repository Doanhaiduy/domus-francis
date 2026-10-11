import { api, uuidParam } from "@/server/http";
import { forbidden } from "@/server/errors";
import { getAlbum, registerVideo } from "@/server/modules/moments";
import { RegisterVideoSchema } from "@/server/modules/moments-schema";

export const runtime = "nodejs";

/** Bước 2 tải video: xác minh tệp đã có ở nơi lưu trữ rồi ghi video vào album. Trả về album sau khi thêm. */
export const POST = api({}, async (ctx) => {
  const albumId = uuidParam(ctx, "id");
  const b = await ctx.body(RegisterVideoSchema);
  if (!ctx.userId) throw forbidden("Cần đăng nhập.");
  const uid = ctx.userId;
  const album = await ctx.db(async (tx) => {
    await registerVideo(tx, uid, b, albumId);
    return getAlbum(tx, albumId);
  });
  return Response.json(album, { status: 201 });
});
