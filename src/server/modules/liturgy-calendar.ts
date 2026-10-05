import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../errors";
import { addDaysIso, liturgicalDay, liturgicalRange, monthDevotion, type LitDay } from "@/lib/liturgy/engine";
import { feastToLabel } from "@/lib/types/settings";
import {
  SPECIAL_DAY_COLORS,
  type CalendarDayDetailDto,
  type CalendarDayDto,
  type CalendarMonthDto,
  type MassCheckinDto,
  type MassCheckinRowDto,
  type MassOccasion,
  type MassReportDto,
  type MassRequirementDto,
  type SpecialDayColor,
  type SpecialDayDto,
  type UpcomingFeastDto,
} from "@/lib/types/liturgy";
import { loadGospelRefs, loadReadingSets } from "./liturgy-lectionary";
import { iso } from "./community-shared";

// ---------------------------------------------------------------------
// Lịch phụng vụ trên trang Lịch sự kiện: lịch do src/lib/liturgy/engine.ts tính; phần này ghép thêm dữ liệu của nhà
// (ngày Bổn mạng, ngày đặc biệt, ý lễ, Lời Chúa đã nạp) và check-in đi lễ của anh em.
// ---------------------------------------------------------------------

type Row = Record<string, any>;

// (không import từ ../http: module này còn được job nền dùng, ngoài vòng đời request)
const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD.");

interface Conf {
  today: string;
  patron: string | null;
  patronName: string | null;
  checkinSunday: boolean;
  checkinSolemnity: boolean;
  graceDays: number;
  canManage: boolean;
  me: string | null;
  specials: SpecialDayDto[];
}

const toSpecial = (r: Row): SpecialDayDto => ({
  id: r.id,
  title: r.title,
  description: r.description ?? null,
  month: r.month,
  day: r.day,
  year: r.year ?? null,
  color: r.color as SpecialDayColor,
  requiresCheckin: r.requires_checkin,
  evidenceRequired: r.evidence_required,
  notify: r.notify,
  isActive: r.is_active,
  version: r.version,
});

const jsonText = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

async function loadConf(tx: Tx): Promise<Conf> {
  const [base, specials] = await Promise.all([
    tx.query(
      `SELECT app.local_today()::text AS today,
              app.setting_json('org.patron_feast') AS patron,
              app.setting_json('org.patron_name') AS patron_name,
              app.setting_json('liturgy.checkin_sunday') AS c_sun,
              app.setting_json('liturgy.checkin_solemnity') AS c_sol,
              app.setting_json('liturgy.checkin_grace_days') AS grace,
              app.has_permission('liturgy.calendar.manage') AS manage,
              app.current_member_id() AS me`
    ),
    tx.query(
      `SELECT id, title, description, month, day, year, color, requires_checkin, evidence_required, notify, is_active, version
         FROM liturgy_special_days WHERE deleted_at IS NULL ORDER BY month, day, title`
    ),
  ]);
  const b = base.rows[0];
  const patron = jsonText(b.patron);
  return {
    today: b.today,
    patron: patron && /^\d{2}-\d{2}$/.test(patron) ? patron : null,
    patronName: jsonText(b.patron_name)?.trim() || null,
    checkinSunday: b.c_sun !== false,
    checkinSolemnity: b.c_sol !== false,
    graceDays: typeof b.grace === "number" ? b.grace : 2,
    canManage: !!b.manage,
    me: b.me ?? null,
    specials: specials.rows.map(toSpecial),
  };
}

const specialsOn = (c: Conf, date: string) =>
  c.specials.filter((s) => s.isActive && s.month === +date.slice(5, 7) && s.day === +date.slice(8, 10) && (s.year == null || s.year === +date.slice(0, 4)));

const isPatron = (c: Conf, date: string) => !!c.patron && date.slice(5) === c.patron;

/** Ngày này anh em có phải check-in đi lễ không, loại gì, có cần ảnh không. */
export function requirementFor(c: Conf, d: LitDay): MassRequirementDto | null {
  const deadline = addDaysIso(d.date, c.graceDays);
  const evidence = (want: boolean) => want && !d.isSunday;
  const special = specialsOn(c, d.date).find((s) => s.requiresCheckin);
  if (special) return { occasion: `special:${special.id}`, label: special.title, evidenceRequired: evidence(special.evidenceRequired), deadline };
  if (isPatron(c, d.date) && c.checkinSolemnity) return { occasion: "patron", label: "Lễ Bổn mạng của nhà", evidenceRequired: evidence(true), deadline };
  // Thứ Bảy Tuần Thánh không có Thánh lễ ban ngày (Đêm Canh Thức tính cho Chúa Nhật Phục Sinh)
  if (d.isSolemnity && c.checkinSolemnity && !d.title.startsWith("Thứ Bảy Tuần Thánh"))
    return { occasion: "solemnity", label: d.rank === "triduum" ? "Tam Nhật Vượt Qua" : "Lễ trọng", evidenceRequired: evidence(true), deadline };
  if (d.isSunday && c.checkinSunday) return { occasion: "sunday", label: "Chúa Nhật", evidenceRequired: false, deadline };
  return null;
}

/** Được check-in từ chiều hôm trước (lễ vọng) đến hết hạn; trả lý do nếu chưa/không được. */
function checkinWindow(c: Conf, req: MassRequirementDto | null, date: string): string | null {
  if (!req) return "Ngày này không bắt buộc check-in đi lễ.";
  if (!c.me) return "Tài khoản chưa gắn với hồ sơ thành viên.";
  if (c.today < addDaysIso(date, -1)) return "Chưa đến ngày lễ — mở check-in từ hôm trước (lễ vọng).";
  if (c.today > req.deadline) return `Đã quá hạn check-in (hạn ${+req.deadline.slice(8)}/${+req.deadline.slice(5, 7)}).`;
  return null;
}

function compactDay(c: Conf, d: LitDay, extra: { gospelRef: string | null; hasIntention: boolean; mine: Row | undefined }): CalendarDayDto {
  return {
    date: d.date,
    weekday: d.weekday,
    title: d.title,
    rank: d.rank,
    rankLabel: d.rankLabel,
    color: d.color,
    season: d.season,
    seasonLabel: d.seasonLabel,
    weekLabel: d.weekLabel,
    isSunday: d.isSunday,
    isSolemnity: d.isSolemnity,
    isObligation: d.isObligation,
    isHighlight: d.isHighlight || isPatron(c, d.date) || specialsOn(c, d.date).length > 0,
    tet: d.tet,
    lunarLabel: d.lunar.label,
    lunarDay: d.lunar.day,
    lunarMonth: d.lunar.month,
    fasting: d.fasting,
    isPatron: isPatron(c, d.date),
    special: specialsOn(c, d.date).map((s) => ({ id: s.id, title: s.title, color: s.color })),
    gospelRef: extra.gospelRef,
    hasIntention: extra.hasIntention,
    requirement: requirementFor(c, d),
    myCheckin: extra.mine ? { status: extra.mine.status, hasEvidence: !!extra.mine.evidence_file_id } : null,
  };
}

const RangeQuery = z.object({ from: zDate, to: zDate });

/** Lịch tháng (hoặc khoảng ≤ 62 ngày): tên lễ, màu, âm lịch, Bổn mạng, ngày đặc biệt, yêu cầu + trạng thái check-in của tôi. */
export async function getCalendar(tx: Tx, q: { from: string | null; to: string | null }): Promise<CalendarMonthDto> {
  const p = RangeQuery.safeParse(q);
  if (!p.success) throw badRequest("Cần from và to dạng YYYY-MM-DD.");
  const { from, to } = p.data;
  if (to < from || liturgicalRange(from, to).length > 62) throw badRequest("Khoảng ngày tối đa 62 ngày.");
  const c = await loadConf(tx);
  const days = liturgicalRange(from, to);
  const [refs, notes, mine, count] = await Promise.all([
    loadGospelRefs(tx, days.map((d) => d.lectionary[0]).filter(Boolean)),
    tx.query<{ d: string }>("SELECT day_date::text AS d FROM liturgy_day_notes WHERE day_date BETWEEN $1 AND $2 AND intention IS NOT NULL", [from, to]),
    c.me
      ? tx.query("SELECT day_date::text AS d, status, evidence_file_id FROM mass_checkins WHERE member_id = $1 AND day_date BETWEEN $2 AND $3", [c.me, from, to])
      : Promise.resolve({ rows: [] as Row[] }),
    tx.query<{ n: string }>("SELECT count(*) AS n FROM liturgy_lectionary"),
  ]);
  const withIntention = new Set(notes.rows.map((r) => r.d));
  const mineBy = new Map((mine.rows as Row[]).map((r) => [r.d, r]));
  return {
    from,
    to,
    today: c.today,
    patron: c.patron ? { mmdd: c.patron, label: feastToLabel(c.patron), name: c.patronName } : null,
    lectionaryReady: Number(count.rows[0].n) > 0,
    days: days.map((d) => {
      const l = d.lectionary[0];
      return compactDay(c, d, {
        gospelRef: l ? refs.get(`${l.key}|${l.cycle}`) ?? null : null,
        hasIntention: withIntention.has(d.date),
        mine: mineBy.get(d.date),
      });
    }),
  };
}

const toCheckin = (r: Row): MassCheckinDto => ({
  id: r.id,
  date: r.d ?? r.day_date,
  occasion: r.occasion as MassOccasion,
  church: r.church ?? null,
  note: r.note ?? null,
  evidenceFileId: r.evidence_file_id ?? null,
  checkedInAt: iso(r.checked_in_at),
  status: r.status,
  reviewNote: r.review_note ?? null,
  reviewedByName: r.reviewer_name ?? null,
  reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
  version: r.version,
});

/** pHash 64 bit: khoảng cách Hamming. */
function hamming(a: string, b: string): number {
  let x = BigInt.asUintN(64, BigInt(a) ^ BigInt(b));
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

async function attendanceFor(tx: Tx, date: string, req: MassRequirementDto): Promise<CalendarDayDetailDto["attendance"]> {
  const rows = (
    await tx.query(
      `SELECT m.id AS member_id, m.status AS mstatus, COALESCE(m.display_name, m.full_name) AS name, m.avatar_file_id,
              (SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
                WHERE ra.member_id = m.id AND ra.starts_on <= $1::date AND (ra.ends_on IS NULL OR ra.ends_on > $1::date)
                ORDER BY ra.starts_on DESC LIMIT 1) AS room,
              c.id, c.day_date::text AS d, c.occasion, c.church, c.note, c.evidence_file_id, c.checked_in_at, c.status, c.review_note,
              c.reviewed_at, c.version, rv.display_name AS reviewer_name, f.phash::text AS phash, f.taken_at
         FROM members m
         LEFT JOIN mass_checkins c ON c.member_id = m.id AND c.day_date = $1::date
         LEFT JOIN members rv ON rv.user_id = c.reviewed_by AND rv.deleted_at IS NULL
         LEFT JOIN storage_files f ON f.id = c.evidence_file_id
        WHERE m.deleted_at IS NULL AND (m.status = 'active' OR c.id IS NOT NULL)
        ORDER BY (c.id IS NULL) DESC, COALESCE(m.display_name, m.full_name)`,
      [date]
    )
  ).rows;
  const out: MassCheckinRowDto[] = rows.map((r) => ({
    memberId: r.member_id,
    name: r.name,
    room: r.room ?? null,
    avatarFileId: r.avatar_file_id ?? null,
    checkin: r.id ? toCheckin(r) : null,
    duplicateOf: null,
    warning: null,
  }));
  // Ảnh trùng/gần giống ảnh của người khác (pHash) và ảnh chụp không đúng ngày (EXIF) ⇒ cảnh báo cho người duyệt
  const withHash = rows.map((r, i) => ({ i, h: r.phash as string | null, name: r.name as string })).filter((x) => x.h);
  for (const a of withHash)
    for (const b of withHash)
      if (a.i !== b.i && hamming(a.h!, b.h!) <= 6) {
        out[a.i].duplicateOf = b.name;
        break;
      }
  rows.forEach((r, i) => {
    if (!r.taken_at || !r.evidence_file_id) return;
    const taken = new Date(new Date(r.taken_at).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
    if (taken < addDaysIso(date, -1) || taken > req.deadline) out[i].warning = `Ảnh chụp ngày ${+taken.slice(8)}/${+taken.slice(5, 7)}/${taken.slice(0, 4)}, không trùng dịp lễ.`;
  });
  const expected = rows.filter((r) => r.mstatus === "active").length;
  return {
    expected,
    checkedIn: out.filter((r) => r.checkin && r.checkin.status !== "rejected").length,
    rejected: out.filter((r) => r.checkin?.status === "rejected").length,
    rows: out,
  };
}

export async function getDay(tx: Tx, date: string): Promise<CalendarDayDetailDto> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw notFound();
  const d = liturgicalDay(date);
  const c = await loadConf(tx);
  const [readings, alt, note, mine] = await Promise.all([
    loadReadingSets(tx, d.lectionary),
    loadReadingSets(tx, d.altLectionary),
    tx.query(
      `SELECT n.intention, n.note, n.version, COALESCE(m.display_name, m.full_name) AS by_name
         FROM liturgy_day_notes n LEFT JOIN members m ON m.user_id = n.updated_by AND m.deleted_at IS NULL
        WHERE n.day_date = $1`,
      [date]
    ),
    c.me
      ? tx.query(
          `SELECT c.*, c.day_date::text AS d, rv.display_name AS reviewer_name
             FROM mass_checkins c LEFT JOIN members rv ON rv.user_id = c.reviewed_by AND rv.deleted_at IS NULL
            WHERE c.member_id = $1 AND c.day_date = $2`,
          [c.me, date]
        )
      : Promise.resolve({ rows: [] as Row[] }),
  ]);
  const n = note.rows[0];
  const m = (mine.rows as Row[])[0];
  const req = requirementFor(c, d);
  const blocked = checkinWindow(c, req, date);
  const compact = compactDay(c, d, { gospelRef: readings[0]?.slots.find((s) => s.kind === "gospel")?.ref ?? null, hasIntention: !!n?.intention, mine: m });
  return {
    ...compact,
    sundayCycle: d.sundayCycle,
    weekdayCycle: d.weekdayCycle,
    psalterWeek: d.psalterWeek,
    optional: d.optional.map((o) => ({ title: o.title, color: o.color })),
    notes: d.notes,
    intentions: d.intentions,
    monthDevotion: monthDevotion(+date.slice(5, 7)),
    houseIntention: n?.intention ?? null,
    houseNote: n?.note ?? null,
    noteUpdatedBy: n?.by_name ?? null,
    noteVersion: n?.version ?? null,
    readings,
    altReadings: alt.filter((a) => !readings.some((r) => r.key === a.key)),
    officialReadingsUrl: `https://kpv.vn/liturgy/mass-readings?date=${date}`,
    myCheckin: m ? { ...toCheckin(m), hasEvidence: !!m.evidence_file_id } : null,
    canCheckin: !blocked && !(m && m.status === "approved"),
    checkinBlockedReason: m?.status === "approved" ? null : blocked,
    canManage: c.canManage,
    attendance: c.canManage && req ? await attendanceFor(tx, date, req) : null,
    specialDetails: specialsOn(c, date),
  };
}

// ---------------------------------------------------------------------
// Ý lễ / ghi chú theo ngày
// ---------------------------------------------------------------------
export const DayNoteSchema = z.object({
  intention: z.string().trim().max(1000, "Ý lễ tối đa 1.000 ký tự.").nullable().optional(),
  note: z.string().trim().max(2000, "Ghi chú tối đa 2.000 ký tự.").nullable().optional(),
  version: z.number().int().positive().nullable().optional(),
});

export async function saveDayNote(tx: Tx, date: string, b: z.infer<typeof DayNoteSchema>) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw notFound();
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('liturgy.calendar.manage') AS ok")).rows[0]?.ok;
  if (!ok) throw forbidden("Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin được sửa ý lễ.");
  const intention = b.intention?.trim() || null;
  const note = b.note?.trim() || null;
  const cur = (await tx.query<{ version: number }>("SELECT version FROM liturgy_day_notes WHERE day_date = $1", [date])).rows[0];
  if (cur && b.version && cur.version !== b.version) throw conflict("Ý lễ ngày này vừa được người khác sửa — tải lại để xem bản mới.", "STALE_VERSION");
  if (!intention && !note) {
    await tx.query("DELETE FROM liturgy_day_notes WHERE day_date = $1", [date]);
    return { ok: true };
  }
  await tx.query(
    `INSERT INTO liturgy_day_notes (day_date, intention, note) VALUES ($1, $2, $3)
     ON CONFLICT (day_date) DO UPDATE SET intention = EXCLUDED.intention, note = EXCLUDED.note`,
    [date, intention, note]
  );
  return { ok: true };
}

// ---------------------------------------------------------------------
// Ngày đặc biệt của nhà
// ---------------------------------------------------------------------
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const SpecialDaySchema = z
  .object({
    title: z.string().trim().min(3, "Tên ngày tối thiểu 3 ký tự.").max(160, "Tên ngày tối đa 160 ký tự."),
    description: z.string().trim().max(2000, "Mô tả tối đa 2.000 ký tự.").nullable().optional(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(2000).max(2100).nullable().optional(),
    color: z.enum(SPECIAL_DAY_COLORS).optional(),
    requiresCheckin: z.boolean().optional(),
    evidenceRequired: z.boolean().optional(),
    notify: z.boolean().optional(),
    isActive: z.boolean().optional(),
    version: z.number().int().positive().optional(),
  })
  .refine((v) => v.day <= DAYS_IN_MONTH[v.month - 1], { message: "Ngày không tồn tại trong tháng đã chọn.", path: ["day"] });

async function assertManage(tx: Tx, msg = "Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin được cấu hình ngày đặc biệt.") {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('liturgy.calendar.manage') AS ok")).rows[0]?.ok;
  if (!ok) throw forbidden(msg);
}

export async function listSpecialDays(tx: Tx): Promise<{ items: SpecialDayDto[]; patron: CalendarMonthDto["patron"]; canManage: boolean }> {
  const c = await loadConf(tx);
  return { items: c.specials, patron: c.patron ? { mmdd: c.patron, label: feastToLabel(c.patron), name: c.patronName } : null, canManage: c.canManage };
}

export async function createSpecialDay(tx: Tx, b: z.infer<typeof SpecialDaySchema>): Promise<SpecialDayDto> {
  await assertManage(tx);
  const r = (
    await tx.query(
      `INSERT INTO liturgy_special_days (title, description, month, day, year, color, requires_checkin, evidence_required, notify, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [b.title, b.description ?? null, b.month, b.day, b.year ?? null, b.color ?? "gold", b.requiresCheckin ?? false, b.evidenceRequired ?? true, b.notify ?? true, b.isActive ?? true]
    )
  ).rows[0];
  return toSpecial(r);
}

export async function updateSpecialDay(tx: Tx, id: string, b: z.infer<typeof SpecialDaySchema>): Promise<SpecialDayDto> {
  await assertManage(tx);
  const r = (
    await tx.query(
      `UPDATE liturgy_special_days
          SET title = $2, description = $3, month = $4, day = $5, year = $6, color = $7, requires_checkin = $8, evidence_required = $9,
              notify = $10, is_active = $11
        WHERE id = $1 AND deleted_at IS NULL AND ($12::int IS NULL OR version = $12)
        RETURNING *`,
      [id, b.title, b.description ?? null, b.month, b.day, b.year ?? null, b.color ?? "gold", b.requiresCheckin ?? false, b.evidenceRequired ?? true, b.notify ?? true, b.isActive ?? true, b.version ?? null]
    )
  ).rows[0];
  if (!r) {
    const exists = (await tx.query("SELECT 1 FROM liturgy_special_days WHERE id = $1 AND deleted_at IS NULL", [id])).rowCount;
    if (!exists) throw notFound("Không tìm thấy ngày đặc biệt.");
    throw conflict("Ngày đặc biệt này vừa được người khác sửa — tải lại rồi thử lại.", "STALE_VERSION");
  }
  return toSpecial(r);
}

export async function deleteSpecialDay(tx: Tx, id: string) {
  await assertManage(tx);
  const r = await tx.query("UPDATE liturgy_special_days SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy ngày đặc biệt.");
}

// ---------------------------------------------------------------------
// Check-in đi lễ
// ---------------------------------------------------------------------
export const CheckinSchema = z.object({
  date: zDate,
  church: z.string().trim().max(160, "Tên nhà thờ tối đa 160 ký tự.").nullable().optional(),
  note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự.").nullable().optional(),
  evidenceFileId: z.string().uuid("Ảnh minh chứng không hợp lệ.").nullable().optional(),
});

export async function submitCheckin(tx: Tx, b: z.infer<typeof CheckinSchema>): Promise<MassCheckinDto> {
  const c = await loadConf(tx);
  const d = liturgicalDay(b.date);
  const req = requirementFor(c, d);
  const blocked = checkinWindow(c, req, b.date);
  if (blocked) throw new ApiError(422, "CHECKIN_NOT_ALLOWED", blocked);
  const church = b.church?.trim() || null;
  if (church && church.length < 2) throw badRequest("Tên nhà thờ tối thiểu 2 ký tự.");
  const existing = (await tx.query("SELECT id, status, evidence_file_id, church, note FROM mass_checkins WHERE member_id = $1 AND day_date = $2", [c.me, b.date])).rows[0];
  const evidence = b.evidenceFileId === undefined ? existing?.evidence_file_id ?? null : b.evidenceFileId;
  if (req!.evidenceRequired && !evidence)
    throw new ApiError(422, "EVIDENCE_REQUIRED", `${req!.label} (không phải Chúa Nhật): cần kèm ảnh minh chứng đã đi lễ (ảnh nhà thờ / thánh lễ bạn tham dự).`);
  if (existing?.status === "approved") throw conflict("Check-in ngày này đã được duyệt, không cần gửi lại.");
  if (existing?.status === "rejected" && existing.evidence_file_id === evidence && (existing.church ?? null) === church && (existing.note ?? null) === (b.note?.trim() || null))
    throw new ApiError(422, "NOTHING_CHANGED", "Check-in này chưa hợp lệ — hãy chọn ảnh minh chứng khác hoặc bổ sung ghi chú rồi gửi lại.");
  const sql = existing
    ? `UPDATE mass_checkins SET church = $2, note = $3, evidence_file_id = $4 WHERE id = $1 RETURNING *, day_date::text AS d`
    : `INSERT INTO mass_checkins (day_date, occasion, church, note, evidence_file_id) VALUES ($1, $5, $2, $3, $4)
       RETURNING *, day_date::text AS d`;
  const params = existing ? [existing.id, church, b.note?.trim() || null, evidence] : [b.date, church, b.note?.trim() || null, evidence, req!.occasion];
  try {
    return toCheckin((await tx.query(sql, params)).rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict("Bạn đã check-in ngày này rồi — tải lại trang để xem.");
    throw e;
  }
}

export async function deleteCheckin(tx: Tx, id: string) {
  const r = await tx.query("DELETE FROM mass_checkins WHERE id = $1 AND member_id = app.current_member_id() AND status = 'submitted'", [id]);
  if (!r.rowCount) throw new ApiError(409, "CANNOT_DELETE", "Chỉ hủy được check-in của chính mình khi chưa được duyệt.");
}

export const ReviewSchema = z.object({
  status: z.enum(["approved", "rejected", "submitted"]),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Người duyệt đánh dấu hợp lệ / không hợp lệ; trả về thông tin để gửi thông báo cho người check-in (bước tin cậy). */
export async function reviewCheckin(
  tx: Tx,
  id: string,
  b: z.infer<typeof ReviewSchema>
): Promise<{ memberId: string; date: string; status: string; note: string | null; label: string }> {
  await assertManage(tx, "Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin được duyệt check-in đi lễ.");
  if (b.status === "rejected" && (b.note?.trim().length ?? 0) < 3) throw badRequest("Nêu lý do không hợp lệ (tối thiểu 3 ký tự) để anh em biết bổ sung.");
  const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0]?.id;
  const cur = (await tx.query("SELECT member_id FROM mass_checkins WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy check-in.");
  if (cur.member_id === me) throw forbidden("Không tự duyệt check-in của chính mình.");
  const r = (
    await tx.query("UPDATE mass_checkins SET status = $2, review_note = $3 WHERE id = $1 RETURNING member_id, day_date::text AS d, status, review_note", [
      id,
      b.status,
      b.status === "submitted" ? null : b.note?.trim() || null,
    ])
  ).rows[0];
  const req = requirementFor(await loadConf(tx), liturgicalDay(r.d));
  const label = req && (req.occasion === "patron" || req.occasion.startsWith("special:")) ? req.label : liturgicalDay(r.d).title;
  return { memberId: r.member_id, date: r.d, status: r.status, note: r.review_note ?? null, label };
}

/** Thông báo kết quả duyệt (chạy với vai trò luuxa_worker — luuxa_app không gọi được app.fn_notify). */
export async function notifyReviewed(tx: Tx, r: { memberId: string; date: string; status: string; note: string | null; label: string }) {
  if (r.status === "submitted") return;
  const when = `${+r.date.slice(8)}/${+r.date.slice(5, 7)}`;
  await tx.query("SELECT app.fn_notify($1, 'liturgy.checkin_reviewed', $2, $3, $4::jsonb)", [
    r.memberId,
    r.status === "approved" ? `Check-in đi lễ ngày ${when} đã được xác nhận` : `Check-in đi lễ ngày ${when} chưa hợp lệ`,
    r.status === "approved" ? r.label : `${r.label}. Lý do: ${r.note ?? "—"}. Bạn có thể gửi lại ảnh minh chứng.`,
    JSON.stringify({ href: `/lich-su-kien?date=${r.date}`, date: r.date }),
  ]);
}

// ---------------------------------------------------------------------
// Sắp tới (dải nhắc trên đầu trang, trang chủ) + báo cáo đi lễ
// ---------------------------------------------------------------------
export async function upcomingFeasts(tx: Tx, horizon = 45): Promise<UpcomingFeastDto[]> {
  const c = await loadConf(tx);
  return upcomingFrom(c, Math.min(Math.max(horizon, 1), 120));
}

export function upcomingFrom(c: Conf, horizon: number): UpcomingFeastDto[] {
  const out: UpcomingFeastDto[] = [];
  for (const d of liturgicalRange(c.today, addDaysIso(c.today, horizon))) {
    const daysLeft = Math.round((Date.parse(d.date) - Date.parse(c.today)) / 86_400_000);
    const req = requirementFor(c, d);
    for (const s of specialsOn(c, d.date))
      out.push({ date: d.date, title: s.title, kind: "special", color: s.color, daysLeft, requiresCheckin: s.requiresCheckin, specialId: s.id, notify: s.notify });
    if (isPatron(c, d.date))
      out.push({ date: d.date, title: `Lễ Bổn mạng${c.patronName ? `: ${c.patronName}` : " của nhà"}`, kind: "patron", color: "gold", daysLeft, requiresCheckin: !!req });
    if (d.tet === 1) out.push({ date: d.date, title: d.title, kind: "tet", color: "red", daysLeft, requiresCheckin: false });
    else if (d.isSolemnity && !(d.isSunday && d.rank !== "triduum" && /^Chúa Nhật [IVX]+ /.test(d.title)))
      out.push({ date: d.date, title: d.title, kind: d.rank === "triduum" ? "triduum" : "solemnity", color: d.color, daysLeft, requiresCheckin: !!req && req.occasion === "solemnity" });
  }
  return out;
}

export async function massReport(tx: Tx, q: { from: string | null; to: string | null }): Promise<MassReportDto> {
  await assertManage(tx, "Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin xem được báo cáo đi lễ của cả nhà.");
  const p = RangeQuery.safeParse(q);
  if (!p.success) throw badRequest("Cần from và to dạng YYYY-MM-DD.");
  const { from, to } = p.data;
  if (to < from || liturgicalRange(from, to).length > 93) throw badRequest("Khoảng ngày tối đa 93 ngày.");
  const c = await loadConf(tx);
  const reqDays = liturgicalRange(from, to)
    .filter((d) => d.date <= c.today)
    .map((d) => ({ d, req: requirementFor(c, d) }))
    .filter((x): x is { d: LitDay; req: MassRequirementDto } => !!x.req);
  const [members, checks] = await Promise.all([
    tx.query(
      `SELECT m.id, COALESCE(m.display_name, m.full_name) AS name,
              (SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
                WHERE ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
                ORDER BY ra.starts_on DESC LIMIT 1) AS room
         FROM members m WHERE m.deleted_at IS NULL AND m.status = 'active' ORDER BY COALESCE(m.display_name, m.full_name)`
    ),
    tx.query("SELECT member_id, day_date::text AS d, status FROM mass_checkins WHERE day_date BETWEEN $1 AND $2", [from, to]),
  ]);
  const ok = new Set(checks.rows.filter((r) => r.status !== "rejected").map((r) => `${r.member_id}|${r.d}`));
  return {
    from,
    to,
    days: reqDays.map(({ d, req }) => ({
      date: d.date,
      title: req.occasion.startsWith("special:") || req.occasion === "patron" ? req.label : d.title,
      label: req.label,
      evidenceRequired: req.evidenceRequired,
      expected: members.rows.length,
      checkedIn: members.rows.filter((m) => ok.has(`${m.id}|${d.date}`)).length,
    })),
    members: members.rows.map((m) => {
      const missing = reqDays.filter(({ d }) => !ok.has(`${m.id}|${d.date}`)).map(({ d }) => d.date);
      return { memberId: m.id, name: m.name, room: m.room ?? null, required: reqDays.length, attended: reqDays.length - missing.length, missing };
    }),
  };
}

export { loadConf as loadLiturgyConf };
export type { Conf as LiturgyConf };
