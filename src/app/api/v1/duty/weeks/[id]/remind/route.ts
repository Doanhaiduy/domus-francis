import { api, uuidParam } from "@/server/http";
import { remindDutyWeek } from "@/server/modules/duty-weeks";

/** Nhắc người trực của tuần (thông báo trong ứng dụng). */
export const POST = api({}, async (ctx) => ({ reminded: await ctx.db((tx) => remindDutyWeek(tx, uuidParam(ctx, "id"))) }));
