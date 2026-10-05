import { z } from "zod";
import { api } from "@/server/http";
import { zUuid } from "@/server/http";
import { zMethod } from "@/server/modules/finance-schema";
import { createClaim, listPendingClaims } from "@/server/modules/finance-ops";

const Schema = z.object({
  contributionId: zUuid,
  method: zMethod,
  referenceCode: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Các yêu cầu "đã đóng" đang chờ xác nhận (?plan=…). Người thường chỉ thấy của mình (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listPendingClaims(tx, ctx.query.get("plan"))));

/** Thành viên báo đã đóng một khoản của chính mình (chờ Thủ quỹ/Trưởng nhà/Admin xác nhận). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Schema);
  const id = await ctx.db((tx) => createClaim(tx, b));
  return Response.json({ id }, { status: 201 });
});
