import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { CATEGORY_LABEL, hmToVn, isoToDmy, resolveEventTimes } from "@/lib/events-format";
import type {
  DayDutyDto,
  EventCategoryDto,
  EventDto,
  EventStatsDto,
  EventsMonthDto,
  RsvpStatus,
  UpcomingEventDto,
} from "@/lib/types/events";
import { createPoll, listPolls } from "./events-polls";
import type { EventInput } from "./events-schema";

const VN = "Asia/Ho_Chi_Minh";

// ---------------------------------------------------------------------
// Danh mục
// ---------------------------------------------------------------------
export async function listCategories(tx: Tx): Promise<EventCategoryDto[]> {
  return (
    await tx.query(
      `SELECT id, code, name, color, icon_name FROM categories
        WHERE kind = 'event' AND deleted_at IS NULL AND is_active ORDER BY sort_order, name`
    )
  ).rows.map((c) => ({ id: c.id, code: c.code, name: c.name, label: CATEGORY_LABEL[c.code] ?? c.name, color: c.color, icon: c.icon_name }));
}

async function resolveCategory(tx: Tx, i: { categoryId?: string; categoryCode?: string }): Promise<{ id: string; code: string }> {
  const r = (
    await tx.query<{ id: string; code: string }>(
      `SELECT id, code FROM categories WHERE kind = 'event' AND deleted_at IS NULL AND is_active
          AND (($1::uuid IS NOT NULL AND id = $1::uuid) OR ($1::uuid IS NULL AND code = $2))
        LIMIT 1`,
      [i.categoryId ?? null, i.categoryCode ?? "EVT_SOCIAL"]
    )
  ).rows[0];
  if (!r) throw badRequest("Danh mục sự kiện không hợp lệ.");
  return r;
}

// ---------------------------------------------------------------------
// Đọc sự kiện
// ---------------------------------------------------------------------
const EVENT_SELECT = `
  SELECT e.id, e.title, e.status::text AS status, e.starts_at, e.ends_at,
         to_char(e.starts_at AT TIME ZONE '${VN}', 'YYYY-MM-DD') AS d,
         to_char(e.starts_at AT TIME ZONE '${VN}', 'HH24:MI') AS hm,
         to_char(e.ends_at AT TIME ZONE '${VN}', 'YYYY-MM-DD') AS ed,
         to_char(e.ends_at AT TIME ZONE '${VN}', 'HH24:MI') AS ehm,
         COALESCE(NULLIF(e.location_text, ''), r.name, '') AS location,
         e.organizer_text, e.description, e.requires_attendance, e.cancel_reason,
         c.id AS cat_id, c.code AS cat_code, c.name AS cat_name, c.color AS cat_color,
         app.fn_is_event_organizer(e.id) AS is_org,
         app.fn_can_record_attendance(e.id) AS can_record,
         COALESCE(ep.rsvp, 'none') AS my_rsvp,
         ar.status::text AS my_att, ar.method::text AS my_method, ar.checked_in_at AS my_at,
         to_char(ar.checked_in_at AT TIME ZONE '${VN}', 'HH24:MI') AS my_at_hm,
         COALESCE((SELECT json_agg(json_build_object('memberId', o.member_id, 'name', m.display_name, 'role', o.role_label)
                                   ORDER BY o.role_label, m.display_name)
                     FROM event_organizers o JOIN members m ON m.id = o.member_id
                    WHERE o.event_id = e.id), '[]'::json) AS organizers
    FROM events e
    JOIN categories c ON c.id = e.category_id
    LEFT JOIN rooms r ON r.id = e.location_room_id
    LEFT JOIN event_participants ep ON ep.event_id = e.id AND ep.member_id = app.current_member_id()
    LEFT JOIN attendance_records ar ON ar.event_id = e.id AND ar.member_id = app.current_member_id()
   WHERE e.deleted_at IS NULL`;

interface Perms {
  manage: boolean;
}

async function perms(tx: Tx): Promise<Perms> {
  return (await tx.query<Perms>("SELECT app.has_permission('event.manage') AS manage")).rows[0];
}

const EMPTY_STATS: EventStatsDto = { going: 0, maybe: 0, notGoing: 0, present: 0, late: 0, absent: 0, excused: 0, expected: null };

async function hydrate(tx: Tx, rows: Record<string, any>[], opts: { withPolls?: boolean } = {}): Promise<EventDto[]> {
  if (!rows.length) return [];
  const p = await perms(tx);
  const ids = rows.map((r) => r.id as string);
  const stats = new Map<string, EventStatsDto>(
    (await tx.query("SELECT * FROM app.fn_event_stats($1::uuid[])", [ids])).rows.map((s) => [
      s.event_id,
      {
        going: s.rsvp_going,
        maybe: s.rsvp_maybe,
        notGoing: s.rsvp_not_going,
        present: s.present_count,
        late: s.late_count,
        absent: s.absent_count,
        excused: s.excused_count,
        expected: s.expected_count,
      },
    ])
  );
  const polls = opts.withPolls === false ? [] : await listPolls(tx, { eventIds: ids, limit: 200 });
  return rows.map((r): EventDto => {
    const organizers = r.organizers as EventDto["organizers"];
    const lead = organizers.find((o) => o.role === "lead") ?? organizers[0];
    return {
      id: r.id,
      title: r.title,
      categoryId: r.cat_id,
      categoryCode: r.cat_code,
      category: CATEGORY_LABEL[r.cat_code] ?? r.cat_name,
      categoryColor: r.cat_color,
      status: r.status,
      startsAt: (r.starts_at as Date).toISOString(),
      endsAt: (r.ends_at as Date).toISOString(),
      dateIso: r.d,
      date: isoToDmy(r.d),
      time: hmToVn(r.hm),
      startHm: r.hm,
      endHm: r.ehm,
      endDateIso: r.ed,
      location: r.location,
      organizer: r.organizer_text || (lead ? lead.name : ""),
      organizerText: r.organizer_text,
      organizers,
      description: r.description,
      hasCheckIn: r.requires_attendance,
      cancelReason: r.cancel_reason,
      stats: stats.get(r.id) ?? EMPTY_STATS,
      myRsvp: r.my_rsvp,
      myAttendance: r.my_att ? { status: r.my_att, method: r.my_method, checkedInAt: r.my_at ? (r.my_at as Date).toISOString() : null, time: r.my_at_hm } : null,
      canEdit: p.manage || r.is_org,
      canRecord: r.can_record,
      polls: polls.filter((x) => x.eventId === r.id),
    };
  });
}

/** Sự kiện giao với khoảng ngày [from, to] (giờ VN, tính cả hai đầu). */
export async function listEvents(tx: Tx, from: string, to: string): Promise<EventsMonthDto> {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (!(days >= 0 && days <= 120)) throw badRequest("Khoảng ngày không hợp lệ (tối đa 120 ngày).");
  const rows = (
    await tx.query(
      `${EVENT_SELECT}
         AND e.starts_at < (($2::date + 1)::timestamp AT TIME ZONE '${VN}')
         AND e.ends_at >= ($1::date::timestamp AT TIME ZONE '${VN}')
       ORDER BY e.starts_at, e.title`,
      [from, to]
    )
  ).rows;
  return { events: await hydrate(tx, rows), categories: await listCategories(tx) };
}

export async function getEvent(tx: Tx, id: string): Promise<EventDto> {
  const rows = (await tx.query(`${EVENT_SELECT} AND e.id = $1`, [id])).rows;
  if (!rows.length) throw notFound("Không tìm thấy sự kiện.");
  return (await hydrate(tx, rows))[0];
}

/** Hợp đồng cho Tổng quan: sự kiện chưa kết thúc (đang diễn ra hoặc sắp tới), không gồm sự kiện đã hủy. */
export async function upcomingEvents(tx: Tx, limit: number): Promise<UpcomingEventDto[]> {
  const rows = (
    await tx.query(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, COALESCE(NULLIF(e.location_text, ''), r.name, '') AS location,
              c.code AS cat_code, c.name AS cat_name, c.color AS cat_color, e.requires_attendance,
              COALESCE(ep.rsvp, 'none') AS my_rsvp
         FROM events e
         JOIN categories c ON c.id = e.category_id
         LEFT JOIN rooms r ON r.id = e.location_room_id
         LEFT JOIN event_participants ep ON ep.event_id = e.id AND ep.member_id = app.current_member_id()
        WHERE e.deleted_at IS NULL AND e.status IN ('scheduled', 'ongoing') AND e.ends_at >= now()
        ORDER BY e.starts_at, e.title
        LIMIT $1`,
      [limit]
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: (r.starts_at as Date).toISOString(),
    endsAt: (r.ends_at as Date).toISOString(),
    location: r.location,
    category: CATEGORY_LABEL[r.cat_code] ?? r.cat_name,
    categoryColor: r.cat_color,
    hasCheckIn: r.requires_attendance,
    myRsvp: r.my_rsvp as RsvpStatus,
  }));
}

// ---------------------------------------------------------------------
// Ghi sự kiện
// ---------------------------------------------------------------------
function times(i: Partial<EventInput>, categoryCode: string) {
  if (i.startsAt) {
    const s = new Date(i.startsAt);
    const e = i.endsAt ? new Date(i.endsAt) : new Date(s.getTime() + 90 * 60_000);
    return { startsAt: s.toISOString(), endsAt: e.toISOString() };
  }
  if (!i.date || !i.time) throw badRequest("Nhập ngày và giờ bắt đầu của sự kiện.");
  const r = resolveEventTimes({ date: i.date, time: i.time, endTime: i.endTime ?? undefined, categoryCode });
  if (!r.ok) throw badRequest(r.error);
  return { startsAt: r.startsAt, endsAt: r.endsAt };
}

function checkRange(startsAt: string, endsAt: string) {
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  if (!(e > s)) throw badRequest("Giờ kết thúc phải sau giờ bắt đầu.");
  if (e - s > 14 * 86_400_000) throw badRequest("Một sự kiện kéo dài tối đa 14 ngày.");
}

/** Ban tổ chức có cấu trúc: người đầu tiên là chủ trì (lead). RLS event_organizers__write: event.manage. */
async function syncOrganizers(tx: Tx, eventId: string, memberIds: string[]) {
  const ids = [...new Set(memberIds)];
  const cur = (await tx.query<{ member_id: string; role_label: string }>(
    "SELECT member_id, role_label FROM event_organizers WHERE event_id = $1 ORDER BY role_label, member_id", [eventId]
  )).rows;
  const same = cur.length === ids.length && ids.every((id, idx) => cur.some((c) => c.member_id === id && c.role_label === (idx === 0 ? "lead" : "member")));
  if (same) return;
  const p = await perms(tx);
  if (!p.manage) throw forbidden("Chỉ người có quyền quản lý sự kiện được đổi ban tổ chức.");
  await tx.query("DELETE FROM event_organizers WHERE event_id = $1", [eventId]);
  for (const [idx, id] of ids.entries()) {
    await tx.query("INSERT INTO event_organizers (event_id, member_id, role_label) VALUES ($1, $2, $3)", [eventId, id, idx === 0 ? "lead" : "member"]);
  }
}

export async function createEvent(tx: Tx, i: EventInput): Promise<string> {
  const cat = await resolveCategory(tx, i);
  const t = times(i, cat.code);
  checkRange(t.startsAt, t.endsAt);
  const r = await tx.query<{ id: string }>(
    `INSERT INTO events (title, category_id, starts_at, ends_at, location_text, organizer_text, description, requires_attendance, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, app.current_user_id()) RETURNING id`,
    [i.title.trim(), cat.id, t.startsAt, t.endsAt, i.location?.trim() || null, i.organizerText?.trim() || null, i.description?.trim() || null, i.hasCheckIn ?? false]
  );
  const id = r.rows[0].id;
  if (i.organizerIds?.length) await syncOrganizers(tx, id, i.organizerIds);
  if (i.poll) await createPoll(tx, { ...i.poll, eventId: id });
  return id;
}

async function loadForWrite(tx: Tx, id: string) {
  const e = (
    await tx.query<{ status: string; cat_code: string; starts_at: Date; ends_at: Date; d: string; hm: string; ehm: string }>(
      `SELECT e.status::text AS status, c.code AS cat_code, e.starts_at, e.ends_at,
              to_char(e.starts_at AT TIME ZONE '${VN}', 'YYYY-MM-DD') AS d,
              to_char(e.starts_at AT TIME ZONE '${VN}', 'HH24:MI') AS hm,
              to_char(e.ends_at AT TIME ZONE '${VN}', 'HH24:MI') AS ehm
         FROM events e JOIN categories c ON c.id = e.category_id WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id]
    )
  ).rows[0];
  if (!e) throw notFound("Không tìm thấy sự kiện.");
  return e;
}

export async function updateEvent(tx: Tx, id: string, i: Partial<EventInput>) {
  const cur = await loadForWrite(tx, id);
  if (cur.status === "cancelled") throw new ApiError(422, "EVENT_CANCELLED", "Sự kiện đã hủy — không sửa được.");
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  let catCode = cur.cat_code;
  if (i.title !== undefined) set("title", i.title.trim());
  if (i.categoryCode !== undefined || i.categoryId !== undefined) {
    const c = await resolveCategory(tx, i);
    catCode = c.code;
    set("category_id", c.id);
  }
  if (i.startsAt !== undefined || i.date !== undefined || i.time !== undefined || i.endTime !== undefined) {
    // Sửa một phần (vd chỉ giờ kết thúc): phần còn thiếu lấy từ sự kiện hiện tại
    let t: { startsAt: string; endsAt: string };
    if (i.startsAt) t = times(i, catCode);
    else if (i.endTime === undefined) {
      // Dời giờ bắt đầu, giữ nguyên thời lượng
      const s = times({ date: i.date ?? cur.d, time: i.time ?? cur.hm, endTime: null }, catCode).startsAt;
      t = { startsAt: s, endsAt: new Date(Date.parse(s) + (cur.ends_at.getTime() - cur.starts_at.getTime())).toISOString() };
    } else t = times({ date: i.date ?? cur.d, time: i.time ?? cur.hm, endTime: i.endTime }, catCode);
    checkRange(t.startsAt, t.endsAt);
    set("starts_at", t.startsAt);
    set("ends_at", t.endsAt);
  }
  if (i.location !== undefined) set("location_text", i.location?.trim() || null);
  if (i.organizerText !== undefined) set("organizer_text", i.organizerText?.trim() || null);
  if (i.description !== undefined) set("description", i.description?.trim() || null);
  if (i.hasCheckIn !== undefined) set("requires_attendance", i.hasCheckIn);
  if (sets.length) {
    const r = await tx.query(`UPDATE events SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, vals);
    if (!r.rowCount) throw forbidden("Bạn không có quyền sửa sự kiện này.");
  }
  if (i.organizerIds !== undefined) await syncOrganizers(tx, id, i.organizerIds);
}

async function requireManage(tx: Tx, msg: string) {
  const p = await perms(tx);
  if (!p.manage) throw forbidden(msg);
}

export async function cancelEvent(tx: Tx, id: string, reason: string) {
  const cur = await loadForWrite(tx, id);
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được hủy sự kiện.");
  if (cur.status === "cancelled") return;
  if (cur.status === "completed") throw new ApiError(422, "EVENT_COMPLETED", "Sự kiện đã chốt điểm danh/hoàn tất — không hủy được.");
  const r = await tx.query("UPDATE events SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [id, reason.trim()]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền hủy sự kiện này.");
  // Biểu quyết đang mở của sự kiện bị hủy: đóng lại để không nhận thêm phiếu
  await tx.query("UPDATE polls SET status = 'closed' WHERE event_id = $1 AND status = 'open'", [id]);
}

/** Xóa mềm (deleted_at) — điểm danh/RSVP vẫn giữ để đối chiếu; biểu quyết chưa có phiếu bị xóa, có phiếu thì đóng. */
export async function deleteEvent(tx: Tx, id: string) {
  await loadForWrite(tx, id);
  await requireManage(tx, "Chỉ người có quyền quản lý sự kiện được xóa sự kiện.");
  // Đếm phiếu qua app.fn_poll_results (RLS poll_votes chỉ cho thấy phiếu của chính mình)
  await tx.query(
    "DELETE FROM polls p WHERE p.event_id = $1 AND COALESCE((SELECT r.voters FROM app.fn_poll_results(p.id) r LIMIT 1), 0) = 0",
    [id]
  );
  await tx.query("UPDATE polls SET status = 'closed' WHERE event_id = $1 AND status = 'open'", [id]);
  const r = await tx.query("UPDATE events SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền xóa sự kiện này.");
}

/** RSVP của chính mình (RLS event_participants: is_self; trigger ép is_invited=false nếu người thường tự thêm dòng). */
export async function setRsvp(tx: Tx, id: string, rsvp: RsvpStatus) {
  const cur = await loadForWrite(tx, id);
  if (cur.status === "cancelled") throw new ApiError(422, "EVENT_CANCELLED", "Sự kiện đã hủy.");
  if (cur.ends_at.getTime() < Date.now()) throw new ApiError(422, "EVENT_ENDED", "Sự kiện đã kết thúc — không đổi phản hồi tham dự nữa.");
  const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
  if (!me) throw forbidden("Tài khoản chưa gắn hồ sơ thành viên.");
  await tx.query(
    `INSERT INTO event_participants (event_id, member_id, is_invited, rsvp, rsvp_at)
     VALUES ($1, $2, false, $3, now())
     ON CONFLICT (event_id, member_id) DO UPDATE SET rsvp = EXCLUDED.rsvp, rsvp_at = now()`,
    [id, me, rsvp]
  );
}

// ---------------------------------------------------------------------
// Phân công trực nhật trong ngày (chỉ đọc lịch trực đã công bố — dữ liệu của phân hệ Trực nhật)
// ---------------------------------------------------------------------
export async function dayDuties(tx: Tx, date: string): Promise<DayDutyDto[]> {
  return (
    await tx.query(
      `SELECT a.id, s.name AS shift, ca.name AS area, a.status::text AS status,
              COALESCE(array_agg(m.display_name ORDER BY dam.member_role, m.display_name) FILTER (WHERE m.id IS NOT NULL), '{}') AS members
         FROM duty_assignments a
         JOIN duty_rosters ro ON ro.id = a.roster_id AND ro.status <> 'draft'
         JOIN duty_shifts s ON s.id = a.shift_id
         JOIN cleaning_areas ca ON ca.id = a.area_id
         LEFT JOIN duty_assignment_members dam ON dam.assignment_id = a.id
         LEFT JOIN members m ON m.id = dam.member_id
        WHERE a.duty_date = $1::date AND a.status <> 'cancelled'
        GROUP BY a.id, s.name, s.start_time, ca.name, ca.sort_order
        ORDER BY s.start_time, ca.sort_order, ca.name`,
      [date]
    )
  ).rows.map((r) => ({ id: r.id, shift: r.shift, area: r.area, status: r.status, members: r.members }));
}
