import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { planDutyWeeks } from "@/server/modules/duty-weeks";
import { PlanQuerySchema } from "@/server/modules/duty-weeks-schema";

/**
 * Xem trước XẾP LỊCH TRỰC TỰ ĐỘNG (?from=YYYY-MM-DD&weeks=4..8&overwrite=0|1): đề xuất người trực từng tuần theo thứ tự công bằng
 * (ít lượt trực gần đây nhất → lâu nhất chưa trực). Tuần đã có người được giữ nguyên trừ khi overwrite; tuần đã đánh giá không đổi.
 * Không ghi gì — lưu bằng POST /api/v1/duty/weeks/bulk. Quyền: duty.manage.
 */
export const GET = api({}, async (ctx) => {
  const p = PlanQuerySchema.safeParse(Object.fromEntries(ctx.query));
  if (!p.success) throw badRequest(p.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  const overwrite = p.data.overwrite === "1" || p.data.overwrite === "true";
  return ctx.db((tx) => planDutyWeeks(tx, { from: p.data.from, weeks: p.data.weeks, overwrite }));
});
