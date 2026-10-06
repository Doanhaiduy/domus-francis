import { api, uuidParam } from "@/server/http";
import { deleteFaq, updateFaq } from "@/server/modules/public-site";
import { FaqSchema } from "@/server/modules/public-site-schema";

export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(FaqSchema.partial());
  return ctx.db((tx) => updateFaq(tx, uuidParam(ctx, "id"), b));
});

export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteFaq(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
