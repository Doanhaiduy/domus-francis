import { api } from "@/server/http";
import { getLaundryWeek } from "@/server/modules/facilities";
import { runDutyJobs } from "@/server/modules/duty";

/** Lịch máy giặt 7 ngày từ ?week=YYYY-MM-DD (mặc định hôm nay): máy, khung giờ (settings laundry.slots), lượt đã đặt. Quyền: house.read (RLS). */
export const GET = api({}, async (ctx) => {
  await runDutyJobs(ctx);
  const week = ctx.query.get("week");
  return ctx.db((tx) => getLaundryWeek(tx, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null));
});
