import { z } from "zod";
import { api } from "@/server/http";
import { getPrefs, setPushEnabled, setQuiet } from "@/server/modules/notification-prefs";

export const GET = api({}, (ctx) => ctx.db((tx) => getPrefs(tx)));

const Body = z.union([
  z.object({ category: z.string().min(2).max(30), enabled: z.boolean() }),
  z.object({ quiet: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).nullable() }),
]);

/** Bật/tắt kênh đẩy theo nhóm, hoặc đặt/xóa giờ yên tĩnh. */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return ctx.db(async (tx) => {
    if ("quiet" in b) await setQuiet(tx, b.quiet?.start ?? null, b.quiet?.end ?? null);
    else await setPushEnabled(tx, b.category, b.enabled);
    return getPrefs(tx);
  });
});
