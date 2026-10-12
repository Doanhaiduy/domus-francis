import { z } from "zod";
import { api } from "@/server/http";
import { getPrefs, setPushEnabled, setQuiet, setTypeEnabled } from "@/server/modules/notification-prefs";

export const GET = api({}, (ctx) => ctx.db((tx) => getPrefs(tx)));

const Body = z.union([
  z.object({ category: z.string().min(2).max(30), enabled: z.boolean() }),
  z.object({ type: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Loại thông báo không hợp lệ.").max(80), enabled: z.boolean() }),
  z.object({ quiet: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).nullable() }),
]);

/** Bật/tắt kênh đẩy theo nhóm, bật/tắt RIÊNG một loại thông báo (cả trong ứng dụng lẫn đẩy), hoặc đặt/xóa giờ yên tĩnh. */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return ctx.db(async (tx) => {
    if ("quiet" in b) await setQuiet(tx, b.quiet?.start ?? null, b.quiet?.end ?? null);
    else if ("type" in b) await setTypeEnabled(tx, b.type, b.enabled);
    else await setPushEnabled(tx, b.category, b.enabled);
    return getPrefs(tx);
  });
});
