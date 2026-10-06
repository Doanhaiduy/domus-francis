import { z } from "zod";
import { api } from "@/server/http";
import { removeSubscription, saveSubscription } from "@/server/modules/notification-prefs";

const Sub = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }),
});

/** Đăng ký thiết bị này nhận thông báo đẩy (PushSubscription của trình duyệt). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Sub);
  await ctx.db((tx) => saveSubscription(tx, { endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth }, ctx.req.headers.get("user-agent")));
  return { ok: true };
});

/** Hủy đăng ký thiết bị. */
export const DELETE = api({}, async (ctx) => {
  const b = await ctx.body(z.object({ endpoint: z.string().url().max(1000) }));
  await ctx.db((tx) => removeSubscription(tx, b.endpoint));
  return { ok: true };
});
