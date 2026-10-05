import { api } from "@/server/http";
import { markAllRead } from "@/server/modules/announcements";

export const POST = api({}, async (ctx) => ({ marked: await ctx.db((tx) => markAllRead(tx)) }));
