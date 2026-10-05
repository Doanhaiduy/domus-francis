import { z } from "zod";
import { api } from "@/server/http";
import { setConsent } from "@/server/modules/ai";

/** Đồng ý / rút đồng ý "Dùng AI xử lý nội dung do tôi tạo" (ai_processing). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(z.object({ granted: z.boolean() }));
  return ctx.db((tx) => setConsent(tx, b.granted, ctx.ip));
});
