import { api } from "@/server/http";
import { kdb, setRegistration } from "@/server/modules/kitchen";
import { RegistrationSchema } from "@/server/modules/kitchen-schema";

/** Bật/tắt suất một bữa: của mình (meal.register, trước giờ chốt) hoặc của người khác (meal.manage). Luật do trigger DB kiểm. */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(RegistrationSchema);
  return kdb(ctx, (tx) => setRegistration(tx, b));
});
