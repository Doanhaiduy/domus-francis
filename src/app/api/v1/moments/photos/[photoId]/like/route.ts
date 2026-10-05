import { api, uuidParam } from "@/server/http";
import { setPhotoLike } from "@/server/modules/moments";

/** POST thả tim ảnh (mỗi thành viên một lần) · DELETE bỏ tim. */
export const POST = api({}, (ctx) => ctx.db((tx) => setPhotoLike(tx, uuidParam(ctx, "photoId"), true)));
export const DELETE = api({}, (ctx) => ctx.db((tx) => setPhotoLike(tx, uuidParam(ctx, "photoId"), false)));
