import { api, uuidParam } from "@/server/http";
import { setAlbumLike } from "@/server/modules/moments";

/** POST thả tim album (mỗi thành viên một lần) · DELETE bỏ tim. */
export const POST = api({}, (ctx) => ctx.db((tx) => setAlbumLike(tx, uuidParam(ctx, "id"), true)));
export const DELETE = api({}, (ctx) => ctx.db((tx) => setAlbumLike(tx, uuidParam(ctx, "id"), false)));
