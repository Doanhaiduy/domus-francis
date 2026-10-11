import { api } from "@/server/http";
import { ensureDailyAlbum } from "@/server/modules/moments";

/** Mở album chung "Khoảnh khắc thường ngày" (tạo nếu chưa có). Mọi thành viên có hồ sơ. */
export const POST = api({}, async (ctx) => ({ id: await ctx.db((tx) => ensureDailyAlbum(tx)) }));
