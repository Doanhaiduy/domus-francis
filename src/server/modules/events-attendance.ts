import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { CATEGORY_LABEL, daysBetween } from "@/lib/events-format";
import type {
  AttendanceCell,
  AttendanceReportDto,
  AttendanceReportEventDto,
  AttendanceReportMemberDto,
  AttendanceRosterDto,
  AttendanceStatus,
  CheckInResultDto,
  EventStatus,
} from "@/lib/types/events";

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

// ---------------------------------------------------------------------
// Báo cáo điểm danh nhiều sự kiện (xuất Excel): thành viên × sự kiện đã diễn ra trong khoảng ngày.
// Quyền: event.attendance.read_all ⇒ mọi sự kiện bật điểm danh; còn lại chỉ sự kiện mình điểm danh được (event.attendance.record hoặc ban
// tổ chức — app.fn_can_record_attendance). Không có quyền nào và không phụ trách sự kiện nào ⇒ 403. RLS attendance_records vẫn áp dụng.
// ---------------------------------------------------------------------
const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "excused", "absent"];

export async function attendanceReport(tx: Tx, from: string, to: string): Promise<AttendanceReportDto> {
  const span = daysBetween(from, to);
  if (!(span >= 0 && span <= 366)) throw badRequest("Khoảng ngày không hợp lệ (tối đa 1 năm).");
  const perm = (
    await tx.query<{ all: boolean; rec: boolean; org: boolean }>(
      `SELECT app.has_permission('event.attendance.read_all') AS all, app.has_permission('event.attendance.record') AS rec,
              EXISTS (SELECT 1 FROM event_organizers o WHERE o.member_id = app.current_member_id()) AS org`
    )
  ).rows[0];
  if (!perm.all && !perm.rec && !perm.org) throw forbidden("Xuất điểm danh chỉ dành cho người quản lý và ban tổ chức sự kiện.");

  const evRows = (
    await tx.query(
      `SELECT e.id, e.title, e.status::text AS status, e.starts_at, e.expected_scope,
              to_char(e.starts_at AT TIME ZONE '${VN}', 'YYYY-MM-DD') AS d,
              to_char(e.starts_at AT TIME ZONE '${VN}', 'HH24:MI') AS hm,
              to_char(e.ends_at AT TIME ZONE '${VN}', 'HH24:MI') AS ehm,
              COALESCE(NULLIF(e.location_text, ''), r.name, '') AS location,
              c.code AS cat_code, c.name AS cat_name
         FROM events e
         JOIN categories c ON c.id = e.category_id
         LEFT JOIN rooms r ON r.id = e.location_room_id
        WHERE e.deleted_at IS NULL AND e.requires_attendance AND e.status NOT IN ('draft', 'cancelled')
          AND e.starts_at <= now()
          AND e.starts_at >= ($1::date::timestamp AT TIME ZONE '${VN}')
          AND e.starts_at < (($2::date + 1)::timestamp AT TIME ZONE '${VN}')
          AND ($3::boolean OR app.fn_can_record_attendance(e.id))
        ORDER BY e.starts_at, e.title
        LIMIT 300`,
      [from, to, perm.all]
    )
  ).rows;
  const ids = evRows.map((e) => e.id as string);
  const cells = ids.length
    ? (
        await tx.query<{ event_id: string; member_id: string; status: AttendanceStatus | null; t: string | null }>(
          `WITH ev AS (SELECT id, starts_at, expected_scope FROM events WHERE id = ANY ($1::uuid[]))
           SELECT ev.id AS event_id, m.id AS member_id, a.status::text AS status,
                  to_char(a.checked_in_at AT TIME ZONE '${VN}', 'HH24:MI') AS t
             FROM ev
             JOIN members m ON true
             LEFT JOIN attendance_records a ON a.event_id = ev.id AND a.member_id = m.id
             LEFT JOIN event_participants ep ON ep.event_id = ev.id AND ep.member_id = m.id
            WHERE a.id IS NOT NULL
               OR (m.deleted_at IS NULL AND m.status = 'active' AND m.joined_on <= app.local_date(ev.starts_at)
                   AND (ev.expected_scope = 'all' OR COALESCE(ep.is_invited, false)))`,
          [ids]
        )
      ).rows
    : [];
  const memberIds = [...new Set(cells.map((c) => c.member_id))];
  const members = memberIds.length
    ? (
        await tx.query<{ id: string; display_name: string; full_name: string; room: string | null }>(
          `SELECT m.id, m.display_name, m.full_name,
                  (SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
                    WHERE ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
                    ORDER BY ra.starts_on DESC LIMIT 1) AS room
             FROM members m WHERE m.id = ANY ($1::uuid[])
            ORDER BY m.display_name, m.full_name`,
          [memberIds]
        )
      ).rows
    : [];

  const idx = new Map(ids.map((id, i) => [id, i]));
  const byMember = new Map<string, { cells: AttendanceCell[]; times: (string | null)[] }>();
  for (const m of members) byMember.set(m.id, { cells: ids.map(() => null), times: ids.map(() => null) });
  const evStats = ids.map(() => ({ expected: 0, present: 0, late: 0, excused: 0, absent: 0, unrecorded: 0 }));
  for (const c of cells) {
    const i = idx.get(c.event_id);
    const row = byMember.get(c.member_id);
    if (i === undefined || !row) continue;
    row.cells[i] = c.status ?? "none";
    row.times[i] = c.t ?? null;
    const s = evStats[i];
    s.expected++;
    if (c.status && STATUS_ORDER.includes(c.status)) s[c.status]++;
    else s.unrecorded++;
  }

  const events: AttendanceReportEventDto[] = evRows.map((e, i) => ({
    id: e.id,
    title: e.title,
    date: e.d,
    startHm: e.hm,
    endHm: e.ehm,
    category: CATEGORY_LABEL[e.cat_code] ?? e.cat_name,
    status: e.status as EventStatus,
    location: e.location,
    ...evStats[i],
  }));
  const out: AttendanceReportMemberDto[] = members.map((m) => {
    const row = byMember.get(m.id)!;
    const t = { expected: 0, present: 0, late: 0, excused: 0, absent: 0, unrecorded: 0 };
    for (const c of row.cells) {
      if (c === null) continue;
      t.expected++;
      if (c === "none") t.unrecorded++;
      else t[c]++;
    }
    return {
      memberId: m.id,
      name: m.display_name,
      fullName: m.full_name,
      room: m.room ?? null,
      cells: row.cells,
      times: row.times,
      totals: { ...t, ratePct: t.expected ? Math.round(((t.present + t.late) / t.expected) * 1000) / 10 : null },
    };
  });
  return { from, to, events, members: out, scope: perm.all ? "all" : "organizer", generatedAt: new Date().toISOString() };
}
