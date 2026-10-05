import "server-only";
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import { qrShortCode } from "@/lib/events-format";
import type { AttendanceRosterDto, CheckInResultDto, QrDisplayDto, QrSessionDto } from "@/lib/types/events";

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

const toSession = (q: { id: string; opens_at: Date; closes_at: Date; rotation_seconds: number }): QrSessionDto => ({
  id: q.id,
  opensAt: q.opens_at.toISOString(),
  closesAt: q.closes_at.toISOString(),
  rotationSeconds: q.rotation_seconds,
});

async function activeSession(tx: Tx, eventId: string) {
  return (
    await tx.query<{ id: string; opens_at: Date; closes_at: Date; rotation_seconds: number }>(
      `SELECT id, opens_at, closes_at, rotation_seconds FROM qr_sessions
        WHERE event_id = $1 AND status = 'active' AND closes_at > now() ORDER BY created_at DESC LIMIT 1`,
      [eventId]
    )
  ).rows[0];
}

/**
 * Mở phiên điểm danh QR (RLS qr_sessions__insert: event.qr.manage hoặc ban tổ chức). Khóa bí mật do DB sinh
 * (DEFAULT gen_random_bytes) và luuxa_app không đọc được. Mỗi sự kiện tối đa một phiên active (index) ⇒ đã có thì trả lại.
 */
export async function openQrSession(tx: Tx, eventId: string, opts: { durationMinutes?: number; rotationSeconds?: number }) {
  const e = await eventBasics(tx, eventId);
  if (!e.requires_attendance) throw new ApiError(422, "CHECKIN_DISABLED", "Sự kiện này không bật điểm danh — hãy sửa sự kiện và bật điểm danh trước.");
  if (["cancelled", "completed", "draft"].includes(e.status)) {
    throw new ApiError(422, "EVENT_CLOSED", e.status === "cancelled" ? "Sự kiện đã hủy." : "Sự kiện đã chốt điểm danh.");
  }
  if (e.ended) throw new ApiError(422, "EVENT_ENDED", "Sự kiện đã kết thúc — không mở phiên QR nữa. Hãy điểm danh thủ công hoặc chốt điểm danh.");
  // Phiên cũ đã hết hạn nhưng còn active ⇒ đóng để không vướng index một-phiên-mỗi-sự-kiện
  await tx.query(
    "UPDATE qr_sessions SET status = 'closed', closed_at = now() WHERE event_id = $1 AND status = 'active' AND closes_at <= now()",
    [eventId]
  );
  const cur = await activeSession(tx, eventId);
  if (cur) return toSession(cur);
  const r = await tx.query<{ id: string; opens_at: Date; closes_at: Date; rotation_seconds: number }>(
    `INSERT INTO qr_sessions (event_id, rotation_seconds, opens_at, closes_at, created_by)
     VALUES ($1, $2, now(),
             LEAST(now() + interval '24 hours',
                   CASE WHEN $3::int IS NULL THEN GREATEST($4::timestamptz, now() + interval '5 minutes')
                        ELSE now() + make_interval(mins => $3::int) END),
             app.current_user_id())
     RETURNING id, opens_at, closes_at, rotation_seconds`,
    [eventId, opts.rotationSeconds ?? 45, opts.durationMinutes ?? null, e.ends_at]
  );
  return toSession(r.rows[0]);
}

export async function closeQrSession(tx: Tx, eventId: string) {
  await eventBasics(tx, eventId);
  const r = await tx.query("UPDATE qr_sessions SET status = 'closed', closed_at = now() WHERE event_id = $1 AND status = 'active'", [eventId]);
  if (!r.rowCount) {
    const can = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('event.qr.manage') OR app.fn_is_event_organizer($1) AS ok", [eventId])).rows[0].ok;
    if (!can) throw forbidden("Bạn không có quyền đóng phiên điểm danh.");
  }
}

/**
 * Mã QR hiện tại cho màn hình ban tổ chức: token lấy từ app.fn_qr_token (HMAC xoay vòng theo rotation_seconds — hàm tự kiểm
 * quyền điểm danh), mã hóa thành URL trang điểm danh trong ứng dụng; ảnh SVG sinh trên máy chủ bằng thư viện qrcode.
 */
export async function qrDisplay(tx: Tx, eventId: string, origin: string): Promise<QrDisplayDto | null> {
  await eventBasics(tx, eventId);
  const s = await activeSession(tx, eventId);
  if (!s) {
    const can = (await tx.query<{ ok: boolean }>("SELECT app.fn_can_record_attendance($1) AS ok", [eventId])).rows[0].ok;
    if (!can) throw forbidden("Bạn không có quyền xem mã QR điểm danh của sự kiện này.");
    return null;
  }
  const { token, ms } = (
    await tx.query<{ token: string; ms: number }>(
      `SELECT app.fn_qr_token($1) AS token,
              (($2::int * 1000) - ((extract(epoch FROM now()) * 1000)::bigint % ($2::int * 1000)))::int AS ms`,
      [s.id, s.rotation_seconds]
    )
  ).rows[0];
  const url = `${origin}/lich-su-kien/diem-danh?t=${encodeURIComponent(token)}`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#2a1660", light: "#ffffff" },
  });
  return { session: toSession(s), token, code: qrShortCode(token), url, svg, refreshInMs: Math.max(1000, ms) };
}

// ---------------------------------------------------------------------
// Tự điểm danh: quét QR (token) hoặc nhập mã 6 số. Giới hạn số lần nhập sai trong bộ nhớ tiến trình (chống dò mã).
// ---------------------------------------------------------------------
const failures = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 8;
const WINDOW_MS = 5 * 60_000;

function checkThrottle(userId: string) {
  const f = failures.get(userId);
  if (f && f.until > Date.now() && f.n >= MAX_FAILS) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau vài phút hoặc quét mã QR.");
  }
}
function noteFailure(userId: string) {
  const f = failures.get(userId);
  if (!f || f.until <= Date.now()) failures.set(userId, { n: 1, until: Date.now() + WINDOW_MS });
  else f.n++;
}

/** Băm id thiết bị (sinh ngẫu nhiên ở trình duyệt) — DB chỉ lưu dấu vết băm để chặn một máy điểm danh cho nhiều người. */
const deviceHash = (deviceId: string | null | undefined) =>
  deviceId && deviceId.length >= 8 ? createHash("sha256").update(`luuxa-device:${deviceId}`).digest("hex").slice(0, 32) : null;

export async function checkIn(
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
  userId: string,
  i: { token?: string; code?: string; eventId?: string | null; deviceId?: string | null }
): Promise<CheckInResultDto> {
  checkThrottle(userId);
  const dh = deviceHash(i.deviceId);
  try {
    return await run(async (tx) => {
      const id = i.token
        ? (await tx.query<{ id: string }>("SELECT app.fn_checkin_by_qr($1, NULL, NULL, $2) AS id", [i.token, dh])).rows[0].id
        : (await tx.query<{ id: string }>("SELECT app.fn_checkin_by_code($1, $2, $3) AS id", [i.code ?? "", i.eventId ?? null, dh])).rows[0].id;
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
  } catch (e) {
    const pg = e as { code?: string; constraint?: string; message?: string };
    if (pg.code === "23505" && pg.constraint === "ux_attendance_records__event_device") {
      throw new ApiError(409, "DEVICE_ALREADY_USED", "Thiết bị này đã được dùng để điểm danh cho một anh em khác trong sự kiện này — mỗi người hãy điểm danh bằng điện thoại của mình.");
    }
    if (pg.message && /BR-EVT-04|Mã QR không hợp lệ|Mã điểm danh gồm/.test(pg.message)) noteFailure(userId);
    throw e;
  }
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
  if (!perm.rec && !perm.all) throw forbidden("Danh sách điểm danh chỉ dành cho Ban điều hành và ban tổ chức sự kiện.");
  const rows = (
    await tx.query(
      `WITH ev AS (SELECT id, starts_at, expected_scope FROM events WHERE id = $1)
       SELECT m.id AS member_id, m.display_name, m.full_name, rm.code AS room,
              a.status::text AS status, a.method::text AS method, a.checked_in_at, a.note,
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
