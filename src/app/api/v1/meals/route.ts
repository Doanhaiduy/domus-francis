import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { getMealsWeek, kdb } from "@/server/modules/kitchen";

/** Tuần bữa ăn chứa ?date= (mặc định hôm nay): thực đơn, người trực, số suất, đăng ký của tôi, bảng điểm danh ngày đó. */
export const GET = api({}, async (ctx) => {
  const date = ctx.query.get("date") || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "VALIDATION_FAILED", "Ngày phải có dạng YYYY-MM-DD.");
  return kdb(ctx, (tx) => getMealsWeek(tx, date));
});
