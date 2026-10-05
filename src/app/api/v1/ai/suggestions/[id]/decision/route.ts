import { z } from "zod";
import { api } from "@/server/http";
import { decideSuggestion } from "@/server/modules/ai";

/** AIX-SUG-02: người có ai.review chấp nhận/từ chối gợi ý (BR-AI-01). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(z.object({ accept: z.boolean(), note: z.string().trim().max(500).optional() }));
  return ctx.db((tx) => decideSuggestion(tx, ctx.params.id, b.accept, b.note ?? null));
});
