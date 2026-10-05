import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { decideClaim } from "@/server/modules/finance-ops";

const Schema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).nullable().optional() });

/** Xác nhận (ghi phiếu thu) hoặc từ chối một yêu cầu "đã đóng" — cần finance.contribution.record. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(Schema);
  return ctx.db((tx) => decideClaim(tx, id, b.approve, b.note ?? null));
});
