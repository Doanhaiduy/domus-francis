import { z } from "zod";
import { api, uuidParam, zUuid } from "@/server/http";
import { remindPlan } from "@/server/modules/finance-ops";

const Schema = z
  .object({
    /** Bỏ trống = mọi người chưa đóng của kế hoạch */
    contributionIds: z.array(zUuid).max(200).nullable().optional(),
    app: z.boolean().default(true),
    zalo: z.boolean().default(false),
    message: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.app || v.zalo, { message: "Chọn ít nhất một kênh nhắc (trong ứng dụng hoặc nhóm Zalo)." });

/** Nhắc đóng quỹ: thông báo trong ứng dụng cho người chưa đóng và/hoặc tin vào nhóm Zalo. */
export const POST = api({}, async (ctx) => {
  const planId = uuidParam(ctx, "id");
  const b = await ctx.body(Schema);
  return remindPlan(ctx, planId, { contributionIds: b.contributionIds ?? null, app: b.app, zalo: b.zalo, message: b.message ?? null });
});
