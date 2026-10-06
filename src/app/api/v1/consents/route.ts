import { z } from "zod";
import { api } from "@/server/http";
import { SELF_CONSENT_PURPOSES, getMyConsents, setMyConsent } from "@/server/modules/consents";

/** Đồng ý của chính mình: { catholic_profile, catholic_share_leadership } → boolean. */
export const GET = api({}, (ctx) => ctx.db((tx) => getMyConsents(tx)));

const Body = z.object({ purpose: z.enum(SELF_CONSENT_PURPOSES), granted: z.boolean() });

/** Bật/tắt một đồng ý của chính mình (hồ sơ Công giáo, cho Ban điều hành xem hồ sơ Công giáo). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return ctx.db((tx) => setMyConsent(tx, b.purpose, b.granted, ctx.ip));
});
