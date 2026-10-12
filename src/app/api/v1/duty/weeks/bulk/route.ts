import { api } from "@/server/http";
import { saveDutyWeeksBulk } from "@/server/modules/duty-weeks";
import { BulkWeeksSchema } from "@/server/modules/duty-weeks-schema";

/**
 * Lưu lịch trực NHIỀU TUẦN trong một thao tác (sau khi xem trước / sửa tay): mỗi tuần 1–2 người đang ở, qua app.fn_duty_week_save
 * (người được xếp nhận thông báo). Tuần đã có người bị bỏ qua trừ khi overwrite = true; tuần đã đánh giá không đổi. Quyền: duty.manage.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BulkWeeksSchema);
  return ctx.db((tx) => saveDutyWeeksBulk(tx, b));
});
