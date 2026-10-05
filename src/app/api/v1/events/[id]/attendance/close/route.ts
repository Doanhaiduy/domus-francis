import { api, uuidParam } from "@/server/http";
import { attendanceRoster, closeAttendance } from "@/server/modules/events-attendance";

/** POST /api/v1/events/:id/attendance/close — chốt điểm danh sau sự kiện (app.fn_close_event_attendance). */
export const POST = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    const result = await closeAttendance(tx, id);
    return { result, roster: await attendanceRoster(tx, id) };
  });
});
