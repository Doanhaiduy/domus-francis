import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { updateInquiry } from "@/server/modules/public-site";

const Body = z.object({ status: z.enum(["new", "contacted", "visited", "accepted", "rejected", "spam"]).optional(), note: z.string().trim().max(1000).nullable().optional() });

/** Đổi trạng thái / ghi chú xử lý. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  await ctx.db((tx) => updateInquiry(tx, uuidParam(ctx, "id"), b));
  return { ok: true };
});
