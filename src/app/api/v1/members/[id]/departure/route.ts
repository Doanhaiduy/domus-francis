import { api, uuidParam } from "@/server/http";
import { DepartureSchema, applyDeparture, getDepartureChecklist } from "@/server/modules/members-lifecycle";

/** Việc còn treo của một thành viên trước khi cho rời nhà: khoản quỹ chưa đóng, tuần trực sắp tới, hình phạt đang mở, đơn xin phép đang chờ. */
export const GET = api({}, (ctx) => ctx.db((tx) => getDepartureChecklist(tx, uuidParam(ctx, "id"))));

/** Áp dụng các lựa chọn xử lý việc treo RỒI đổi trạng thái sang "đã rời" / "cựu thành viên" — một giao dịch (member.status.change + quyền từng phân hệ). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(DepartureSchema);
  return ctx.db((tx) => applyDeparture(tx, uuidParam(ctx, "id"), b));
});
