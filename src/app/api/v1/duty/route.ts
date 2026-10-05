import { api } from "@/server/http";
import { getDutyWeek, runDutyJobs } from "@/server/modules/duty";

/** Roster trực nhật của một tuần (?week=YYYY-MM-DD, ngày bất kỳ trong tuần; mặc định tuần hiện tại). Quyền: duty.read (RLS). */
export const GET = api({}, async (ctx) => {
  await runDutyJobs(ctx);
  const week = ctx.query.get("week");
  return ctx.db((tx) => getDutyWeek(tx, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : ""));
});
