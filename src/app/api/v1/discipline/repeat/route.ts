import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { RepeatQuerySchema, repeatInfo } from "@/server/modules/discipline";

/**
 * "Lần thứ N trong 12 tháng" khi ghi / sửa vi phạm (Trưởng nhà, Admin):
 * ?memberId=… &ruleId=… (hoặc &ruleTitle=… cho điều ghi tay) &occurredOn=YYYY-MM-DD &excludeId=<bản đang sửa>.
 * Trả số lần cùng điều luật + tổng vi phạm trước đó, cờ cảnh báo đỏ khi tái phạm điều có quy định "tái phạm ⇒ Lỗi đỏ".
 */
export const GET = api({}, async (ctx) => {
  const p = ctx.query;
  const parsed = RepeatQuerySchema.safeParse({
    memberId: p.get("memberId"),
    ruleId: p.get("ruleId") || null,
    ruleTitle: p.get("ruleTitle") || null,
    occurredOn: p.get("occurredOn") || undefined,
    excludeId: p.get("excludeId") || null,
  });
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  return ctx.db((tx) => repeatInfo(tx, parsed.data));
});
