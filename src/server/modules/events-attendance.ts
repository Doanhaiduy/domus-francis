import "server-only";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import type { AttendanceRosterDto, CheckInResultDto } from "@/lib/types/events";

const VN = "Asia/Ho_Chi_Minh";

async function eventBasics(tx: Tx, eventId: string) {
  const e = (
    await tx.query<{ id: string; title: string; status: string; requires_attendance: boolean; starts_at: Date; ends_at: Date; ended: boolean }>(
      `SELECT id, title, status::text AS status, requires_attendance, starts_at, ends_at, now() > ends_at AS ended
         FROM events WHERE id = $1 AND deleted_at IS NULL`,
      [eventId]
    )
  ).rows[0];
  if (!e) throw notFound("Không tìm thấy sự kiện.");
  return e;
}

// ---------------------------------------------------------------------
// Tự điểm danh bằng ẢNH (db/app/1033): thành viên chụp ảnh gửi lại là được — không còn mã QR / mã 6 số / định vị.
// Giờ ghi nhận là giờ máy chủ; có mặt hay đi muộn do trigger DB tính; đúng cửa sổ điểm danh và danh sách mời.
// ---------------------------------------------------------------------
export async function checkInByPhoto(
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
  i: { eventId: string; fileId: string }
): Promise<CheckInResultDto> {
  return run(async (tx) => {
    const e = await eventBasics(tx, i.eventId);
    if (!e.requires_attendance) throw new ApiError(422, "CHECKIN_DISABLED", "Sự kiện này không bật điểm danh.");
    const id = (await tx.query<{ id: string }>("SELECT app.fn_checkin_by_photo($1, $2) AS id", [i.eventId, i.fileId])).rows[0].id;
    const r = (
      await tx.query<{ event_id: string; title: string; status: CheckInResultDto["status"]; t: string | null; d: string }>(
        `SELECT a.event_id, e.title, a.status::text AS status,
                to_char(a.checked_in_at AT TIME ZONE '${VN}', 'HH24:MI') AS t,
                to_char(e.starts_at AT TIME ZONE '${VN}', 'DD/MM/YYYY') AS d
           FROM attendance_records a JOIN events e ON e.id = a.event_id WHERE a.id = $1`,
        [id]
      )
    ).rows[0];
    return { attendanceId: id, eventId: r.event_id, eventTitle: r.title, status: r.status, time: r.t, date: r.d };
  });
}

// ---------------------------------------------------------------------
// Danh sách điểm danh + điểm danh hộ (event.attendance.record hoặc ban tổ chức — trigger tg_attendance_rules kiểm)
// ---------------------------------------------------------------------
export async function attendanceRoster(tx: Tx, eventId: string): Promise<AttendanceRosterDto> {
  const e = await eventBasics(tx, eventId);
  const perm = (
    await tx.query<{ rec: boolean; all: boolean }>(
      "SELECT app.fn_can_record_attendance($1) AS rec, app.has_permission('event.attendance.read_all') AS all",
      [eventId]
    )
  ).rows[0];
  if (!perm.rec && !perm.all) throw forbidden("Danh sách điểm danh chỉ dành cho người quản lý và ban tổ chức sự kiện.");
  const rows = (
    await tx.query(
      `WITH ev AS (SELECT id, starts_at, expected_scope FROM events WHERE id = $1)
       SELECT m.id AS member_id, m.display_name, m.full_name, rm.code AS room,
              a.status::text AS status, a.method::text AS method, a.checked_in_at, a.note, a.evidence_file_id,
              to_char(a.checked_in_at AT TIME ZONE '${VN}', 'HH24:MI') AS t,
              rb.display_name AS recorded_by, COALESCE(ep.rsvp, 'none') AS rsvp
         FROM ev
         JOIN members m ON true
         LEFT JOIN attendance_records a ON a.event_id = ev.id AND a.member_id = m.id
         LEFT JOIN event_participants ep ON ep.event_id = ev.id AND ep.member_id = m.id
         LEFT JOIN members rb ON rb.user_id = a.recorded_by AND a.method = 'manual'
         LEFT JOIN LATERAL (
           SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
            WHERE ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
            ORDER BY ra.starts_on DESC LIMIT 1
         ) rm ON true
        WHERE a.id IS NOT NULL
           OR (m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= app.local_date(ev.starts_at)
               AND (ev.expected_scope = 'all' OR COALESCE(ep.is_invited, false)))
        ORDER BY (a.status IS NULL), CASE a.status WHEN 'present' THEN 0 WHEN 'late' THEN 1 WHEN 'excused' THEN 2 ELSE 3 END,
                 a.checked_in_at NULLS LAST, m.display_name`,
      [eventId]
    )
  ).rows;
  return {
    eventId,
    canRecord: perm.rec,
    ended: e.ended,
    status: e.status as AttendanceRosterDto["status"],
    rows: rows.map((r) => ({
      memberId: r.member_id,
      name: r.display_name,
      fullName: r.full_name,
      room: r.room ?? null,
      status: r.status ?? null,
      method: r.method ?? null,
      checkedInAt: r.checked_in_at ? (r.checked_in_at as Date).toISOString() : null,
      time: r.t ?? null,
      note: r.note ?? null,
      recordedBy: r.recorded_by ?? null,
      rsvp: r.rsvp,
      evidenceFileId: r.evidence_file_id ?? null,
    })),
  };
}

export async function markAttendance(tx: Tx, eventId: string, i: { memberId: string; status: "present" | "late" | "absent"; note?: string | null }) {
  const e = await eventBasics(tx, eventId);
  if (!e.requires_attendance) throw new ApiError(422, "CHECKIN_DISABLED", "Sự kiện này không bật điểm danh.");
  const can = (await tx.query<{ ok: boolean }>("SELECT app.fn_can_record_attendance($1) AS ok", [eventId])).rows[0].ok;
  if (!can) throw forbidden("Bạn không có quyền điểm danh hộ cho sự kiện này.");
  const present = i.status !== "absent";
  await tx.query(
    `INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at, recorded_by, note)
     VALUES ($1, $2, $3::attendance_status_t, 'manual', CASE WHEN $4 THEN now() END, app.current_user_id(), $5)
     ON CONFLICT (event_id, member_id) DO UPDATE
        SET status = EXCLUDED.status, method = 'manual', recorded_by = EXCLUDED.recorded_by,
            checked_in_at = CASE WHEN $4 THEN COALESCE(attendance_records.checked_in_at, now()) END,
            leave_request_id = NULL, qr_session_id = CASE WHEN $4 THEN attendance_records.qr_session_id END,
            note = COALESCE(EXCLUDED.note, attendance_records.note)`,
    [eventId, i.memberId, i.status, present, i.note?.trim() || null]
  );
}

/** Chốt điểm danh sau sự kiện (app.fn_close_event_attendance): người chưa điểm danh ⇒ vắng/có phép, ghi điểm chuyên cần, sự kiện ⇒ hoàn tất. */
export async function closeAttendance(tx: Tx, eventId: string) {
  await eventBasics(tx, eventId);
  return (await tx.query<{ r: { absent_created: number; excused_created: number; merit_entries: number } }>(
    "SELECT app.fn_close_event_attendance($1) AS r",
    [eventId]
  )).rows[0].r;
}
