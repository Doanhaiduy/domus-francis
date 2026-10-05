import { z } from "zod";
import { api } from "@/server/http";
import { setConsent } from "@/server/modules/ai";
import { AI_CONSENT_PURPOSES } from "@/lib/types/ai";

/**
 * Đồng ý / rút đồng ý một mục đích AI của chính mình:
 *  ai_processing (mặc định — "Dùng AI xử lý nội dung do tôi tạo"), ai_academic_summary ("Dùng AI nhận xét điểm học tập của tôi").
 */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(z.object({ granted: z.boolean(), purpose: z.enum(AI_CONSENT_PURPOSES).default("ai_processing") }));
  return ctx.db((tx) => setConsent(tx, b.granted, ctx.ip, b.purpose));
});
