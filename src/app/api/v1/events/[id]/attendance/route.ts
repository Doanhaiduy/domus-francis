import { api, uuidParam } from "@/server/http";
import { attendanceRoster, markAttendance } from "@/server/modules/events-attendance";
import { AttendanceMarkSchema } from "@/server/modules/events-schema";

/** GET /api/v1/events/:id/attendance — danh sách điểm danh đầy đủ. Quyền: event.attendance.record/read_all hoặc ban tổ chức. */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db((tx) => attendanceRoster(tx, id));
});

/** POST /api/v1/events/:id/attendance { memberId, status: present|late|absent, note? } — điểm danh hộ. Quyền: event.attendance.record hoặc ban tổ chức. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(AttendanceMarkSchema);
  return ctx.db(async (tx) => {
    await markAttendance(tx, id, b);
    return attendanceRoster(tx, id);
  });
});
