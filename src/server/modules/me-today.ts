import "server-only";
import { batch, type Tx } from "../db";
import { addDaysIso, liturgicalDay } from "@/lib/liturgy/engine";
import { requirementFor } from "./liturgy-calendar";
import { PHASE_SQL } from "./discipline";
import { SELF_CONSENT_PURPOSES } from "./consents";
import { planLink } from "@/lib/types/finance";
import { LEAVE_KIND_LABEL, isDoorKind, type LeaveKind, type LeaveStatus } from "@/lib/types/leave";
import { penaltyText, type PenaltyKind } from "@/lib/types/discipline";
import type { AttendanceStatus } from "@/lib/types/events";
import type { MassCheckinStatus, SpecialDayColor, SpecialDayDto } from "@/lib/types/liturgy";
import {
  MY_TODAY_KIND_ORDER,
  type MyTodayDto,
  type MyTodayItem,
  type MyTodayMealSlot,
  type OnboardingDto,
} from "@/lib/types/me-today";

// =====================================================================
// "Việc của tôi hôm nay" — GET /api/v1/me/today (thẻ đầu trang Tổng quan cho MỌI thành viên) + dữ liệu "Bắt đầu với Lưu Xá".
//   • Chỉ việc của CHÍNH người xem: mọi câu lọc theo app.current_member_id() (kể cả khi RLS cho người quản lý thấy dữ liệu của người khác).
//   • Mọi câu chạy dưới RLS của người xem (ctx.db) và gửi trong MỘT vòng mạng (batch).
//   • Gồm: tuần trực vệ sinh (tuần này / tuần sau / phải trực lại), cơm hôm nay (khi phân hệ Bếp bật), khoản quỹ chưa đóng (nút mã QR), sự kiện
//     hôm nay có điểm danh, lễ bắt buộc check-in (hôm nay, ngày lễ vừa qua còn hạn, lễ vọng ngày mai), lời nhờ để cửa, đơn xin phép của tôi,
//     phân công phụng vụ 7 ngày tới, hình phạt đang chấp hành, Luật nhà chưa xác nhận đọc.
// Thêm loại việc mới ⇒ thêm kiểu ở lib/types/me-today.ts + câu SQL trong batch + phần dựng mục bên dưới + giao diện MyTodayCard + test member-ux.
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type LitConf = Parameters<typeof requirementFor>[0];

const VN = "Asia/Ho_Chi_Minh";
const HOUR = 3600_000;
const DUES_HORIZON_DAYS = 30;
const MEAL_LABEL = { lunch: "Trưa", dinner: "Tối" } as const;
const ATT_LABEL: Record<AttendanceStatus, string> = { present: "Có mặt", late: "Đi muộn", absent: "Vắng", excused: "Vắng có phép" };

const isoOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
/** "2026-10-05" → "05/10" */
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** Ngày (giờ VN) của một thời điểm: "YYYY-MM-DD" */
const vnDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * HOUR).toISOString().slice(0, 10);
/** "HH:MM" giờ VN */
const hm = (iso: string) => new Date(new Date(iso).getTime() + 7 * HOUR).toISOString().slice(11, 16);
/** "21:30" nếu cùng ngày hôm nay, "21:30 13/10" nếu khác ngày */
const hmDay = (iso: string, today: string) => (vnDate(iso) === today ? hm(iso) : `${hm(iso)} ${dm(vnDate(iso))}`);
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const jsonText = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

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

// ---------------------------------------------------------------------
// Các câu SQL (một vòng mạng)
// ---------------------------------------------------------------------
const BASE_SQL = `
  SELECT app.current_member_id() AS me, app.local_today()::text AS today, now() AS now,
         app.has_permission('meal.register') AS meal_register, app.has_permission('meal.manage') AS meal_manage,
         COALESCE(app.setting_bool('feature.meals.enabled'), false) AS meals_enabled,
         app.setting_json('org.patron_feast') AS patron, app.setting_json('org.patron_name') AS patron_name,
         app.setting_json('liturgy.checkin_sunday') AS c_sun, app.setting_json('liturgy.checkin_solemnity') AS c_sol,
         app.setting_json('liturgy.checkin_grace_days') AS grace, app.has_permission('liturgy.calendar.manage') AS lit_manage,
         (SELECT s.value FROM settings s WHERE s.key = 'liturgy.auto_approve_no_photo') AS auto_ok,
         m.full_name, m.display_name, m.avatar_file_id, m.joined_on::text AS joined_on,
         EXISTS (SELECT 1 FROM member_payment_accounts pa WHERE pa.member_id = m.id) AS has_payment,
         (SELECT count(*)::int FROM push_subscriptions ps WHERE ps.user_id = app.current_user_id() AND ps.revoked_at IS NULL) AS push_devices,
         EXISTS (SELECT 1 FROM consents c WHERE c.member_id = m.id AND c.purpose_code = ANY ($1::text[])) AS consent_choice
    FROM (SELECT 1) AS one
    LEFT JOIN members m ON m.id = app.current_member_id()`;

const SPECIALS_SQL = `
  SELECT id, title, description, month, day, year, color, requires_checkin, evidence_required, notify, is_active, version
    FROM liturgy_special_days WHERE deleted_at IS NULL`;

const DUTY_SQL = `
  SELECT w.week_start::text AS week_start, w.redo_required, w.redo_note, w.score,
         COALESCE((SELECT array_agg(o.display_name ORDER BY o.display_name)
                     FROM duty_week_members om JOIN members o ON o.id = om.member_id
                    WHERE om.week_id = w.id AND om.member_id <> wm.member_id), '{}') AS partners
    FROM duty_weeks w
    JOIN duty_week_members wm ON wm.week_id = w.id AND wm.member_id = app.current_member_id()
   WHERE w.week_start BETWEEN date_trunc('week', app.local_today())::date - 7 AND date_trunc('week', app.local_today())::date + 7
   ORDER BY w.week_start`;

const MEALS_SQL = `
  SELECT mt.meal::text AS meal, m.status::text AS status,
         COALESCE(m.cutoff_at, app.fn_meal_default_cutoff(app.local_today(), mt.meal)) AS cutoff_at,
         mr.will_eat
    FROM (VALUES (1, 'lunch'::meal_type_t), (2, 'dinner'::meal_type_t)) AS mt(ord, meal)
    LEFT JOIN meal_menus m ON m.menu_date = app.local_today() AND m.meal_type = mt.meal
    LEFT JOIN meal_registrations mr ON mr.menu_id = m.id AND mr.member_id = app.current_member_id()
   ORDER BY mt.ord`;

const DUES_SQL = `
  SELECT ct.id, ct.plan_id, cp.code AS plan_code, cp.name AS plan_name, ct.due_date::text AS due_date,
         (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd)::bigint AS remaining,
         EXISTS (SELECT 1 FROM contribution_claims c WHERE c.contribution_id = ct.id AND c.status = 'pending') AS claim_pending
    FROM contributions ct
    JOIN contribution_plans cp ON cp.id = ct.plan_id AND cp.status NOT IN ('cancelled', 'draft')
   WHERE ct.member_id = app.current_member_id() AND ct.status IN ('unpaid', 'partial')
     AND ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd > 0
   ORDER BY ct.due_date, cp.name
   LIMIT 60`;

const EVENTS_SQL = `
  SELECT e.id, e.title, e.starts_at, e.ends_at,
         to_char(e.starts_at AT TIME ZONE '${VN}', 'YYYY-MM-DD') AS d,
         to_char(e.starts_at AT TIME ZONE '${VN}', 'HH24:MI') AS hm,
         to_char(e.ends_at AT TIME ZONE '${VN}', 'HH24:MI') AS ehm,
         COALESCE(NULLIF(e.location_text, ''), r.name, '') AS location,
         e.starts_at - make_interval(mins => COALESCE(e.attendance_open_minutes::int, app.setting_int('event.attendance.open_minutes_before')::int, 30)) AS opens_at,
         ar.status::text AS att, to_char(ar.checked_in_at AT TIME ZONE '${VN}', 'HH24:MI') AS att_hm
    FROM events e
    LEFT JOIN rooms r ON r.id = e.location_room_id
    LEFT JOIN attendance_records ar ON ar.event_id = e.id AND ar.member_id = app.current_member_id()
   WHERE e.deleted_at IS NULL AND e.requires_attendance AND e.status IN ('scheduled', 'ongoing')
     AND e.ends_at > now() AND e.starts_at < ((app.local_today() + 1)::timestamp AT TIME ZONE '${VN}')
     AND app.current_member_id() IS NOT NULL
     AND (e.expected_scope = 'all' OR EXISTS (SELECT 1 FROM event_participants p
                                               WHERE p.event_id = e.id AND p.member_id = app.current_member_id() AND p.is_invited))
   ORDER BY e.starts_at, e.title
   LIMIT 6`;

const MASS_SQL = `
  SELECT day_date::text AS d, status::text AS status, review_note
    FROM mass_checkins
   WHERE member_id = app.current_member_id() AND day_date BETWEEN app.local_today() - 14 AND app.local_today() + 1`;

const DOOR_SQL = `SELECT leave_id, member_name, kind, status, starts_at, effective_ends_at FROM app.fn_leave_door_duties()`;

const EFF_END = `GREATEST(l.ends_at, COALESCE((SELECT max(x.new_ends_at) FROM leave_extensions x WHERE x.leave_request_id = l.id), l.ends_at))`;
const LEAVE_SQL = `
  SELECT l.id, l.kind::text AS kind, l.status::text AS status, l.starts_at, l.ends_at, e.title AS event_title,
         (SELECT COALESCE(dm.display_name, dm.full_name) FROM members dm WHERE dm.id = l.door_member_id) AS door_name,
         ${EFF_END} AS eff_end,
         (SELECT count(*)::int FROM leave_extensions x WHERE x.leave_request_id = l.id) AS ext
    FROM leave_requests l
    LEFT JOIN events e ON e.id = l.event_id
   WHERE l.member_id = app.current_member_id() AND l.status IN ('pending', 'approved')
     AND ${EFF_END} > now() - interval '3 hours'
   ORDER BY l.starts_at
   LIMIT 10`;

const LITURGY_SQL = `
  SELECT la.id, la.status, rt.name_vi AS role_name, e.title, e.starts_at
    FROM liturgy_assignments la
    JOIN liturgy_role_types rt ON rt.id = la.role_type_id
    JOIN events e ON e.id = la.event_id AND e.deleted_at IS NULL AND e.status NOT IN ('cancelled', 'draft')
   WHERE la.member_id = app.current_member_id() AND la.status IN ('assigned', 'confirmed')
     AND e.ends_at > now() AND e.starts_at < now() + interval '7 days'
   ORDER BY e.starts_at
   LIMIT 6`;

const DISCIPLINE_SQL = `
  SELECT r.id, r.rule_title, r.penalty_kind, r.penalty_qty, r.penalty_detail,
         r.penalty_starts_on::text AS starts_on, r.penalty_ends_on::text AS ends_on,
         ${PHASE_SQL} AS phase, COALESCE(dr.is_red, false) AS is_red
    FROM discipline_records r
    LEFT JOIN discipline_rules dr ON dr.id = r.rule_id
   WHERE r.member_id = app.current_member_id() AND r.status = 'open' AND r.penalty_kind <> 'none'
     AND (r.penalty_starts_on IS NULL OR r.penalty_starts_on <= app.local_today() + 3)
   ORDER BY r.penalty_ends_on NULLS LAST, r.created_at
   LIMIT 6`;

const RULES_SQL = `
  SELECT v.version, v.updated_at,
         (SELECT a.acknowledged_at FROM house_rule_acknowledgements a WHERE a.member_id = app.current_member_id() AND a.version = v.version) AS acked_at,
         EXISTS (SELECT 1 FROM house_rule_acknowledgements a WHERE a.member_id = app.current_member_id()) AS ever_acked
    FROM app.fn_house_rules_version() v`;

// ---------------------------------------------------------------------
// Dựng danh sách việc
// ---------------------------------------------------------------------
export async function getMyToday(tx: Tx): Promise<MyTodayDto> {
  const [baseR, specialsR, dutyR, mealsR, duesR, eventsR, massR, doorR, leaveR, litR, discR, rulesR] = await batch(tx, [
    [BASE_SQL, [[...SELF_CONSENT_PURPOSES]]],
    [SPECIALS_SQL],
    [DUTY_SQL],
    [MEALS_SQL],
    [DUES_SQL],
    [EVENTS_SQL],
    [MASS_SQL],
    [DOOR_SQL],
    [LEAVE_SQL],
    [LITURGY_SQL],
    [DISCIPLINE_SQL],
    [RULES_SQL],
  ]);
  const b = baseR.rows[0] as Row;
  const today: string = b.today;
  const nowIso = isoOf(b.now);
  const now = new Date(nowIso).getTime();
  const items: MyTodayItem[] = [];

  if (!b.me) {
    return { today, generatedAt: nowIso, items: [], todo: 0, dues: { count: 0, totalVnd: 0, hidden: 0 }, onboarding: null };
  }

  // ---- Tuần trực vệ sinh sân nhà ----
  const monday = addDaysIso(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  for (const w of dutyR.rows as Row[]) {
    const start: string = w.week_start;
    const end = addDaysIso(start, 6);
    const partners: string[] = w.partners ?? [];
    const range = `${dm(start)} – ${dm(end)}`;
    const withWho = partners.length ? ` · cùng ${partners.join(" & ")}` : "";
    const base = { kind: "duty_week" as const, weekStart: start, weekEnd: end, partners, href: "/hau-can?tab=truc-nhat" };
    if (start === monday) {
      items.push({ ...base, key: `duty:${start}`, when: "this", state: "todo", urgent: false, title: "Tuần này bạn trực vệ sinh sân nhà", hint: `Tuần ${range}${withWho}` });
    } else if (start > monday) {
      items.push({ ...base, key: `duty:${start}`, when: "next", state: "info", urgent: false, title: "Tuần sau đến lượt bạn trực vệ sinh", hint: `Tuần ${range}${withWho}` });
    } else if (w.redo_required) {
      items.push({
        ...base,
        key: `duty:${start}`,
        when: "redo",
        state: "todo",
        urgent: true,
        title: "Bạn được yêu cầu trực lại tuần trước",
        hint: [w.redo_note, `Tuần ${range}`, w.score != null ? `${w.score}/10 điểm` : null].filter(Boolean).join(" · "),
      });
    }
  }

  // ---- Cơm hôm nay ----
  if (b.meals_enabled && (b.meal_register || b.meal_manage)) {
    const slots: MyTodayMealSlot[] = (mealsR.rows as Row[]).map((r) => {
      const cutoffAt = isoOf(r.cutoff_at);
      const cancelled = r.status === "cancelled";
      return {
        meal: r.meal,
        willEat: r.will_eat === null || r.will_eat === undefined ? null : !!r.will_eat,
        cutoffAt,
        cancelled,
        open: !cancelled && now < new Date(cutoffAt).getTime() && (r.status == null || r.status === "open"),
      };
    });
    const pending = slots.filter((s) => s.open && s.willEat === null);
    const anyReg = slots.some((s) => s.willEat !== null);
    const base = { kind: "meal" as const, key: `meal:${today}`, date: today, meals: slots, href: "/bep-com" };
    if (pending.length) {
      items.push({
        ...base,
        state: "todo",
        urgent: pending.some((s) => new Date(s.cutoffAt).getTime() - now <= HOUR),
        title: "Báo cơm hôm nay",
        hint: pending.map((s) => `${MEAL_LABEL[s.meal]} chốt lúc ${hm(s.cutoffAt)}`).join(" · "),
      });
    } else if (anyReg) {
      items.push({
        ...base,
        state: "done",
        urgent: false,
        title: "Đã báo cơm hôm nay",
        hint: slots.map((s) => `${MEAL_LABEL[s.meal]}: ${s.cancelled ? "nghỉ nấu" : s.willEat === null ? "chưa báo" : s.willEat ? "ăn" : "không ăn"}`).join(" · "),
      });
    }
  }

  // ---- Khoản quỹ chưa đóng ----
  const dues = duesR.rows as Row[];
  const horizon = addDaysIso(today, DUES_HORIZON_DAYS);
  const near = dues.filter((d) => d.due_date <= horizon);
  const shownDues = near.slice(0, 3);
  for (const d of shownDues) {
    const remaining = Number(d.remaining);
    const overdue = d.due_date < today;
    const late = daysBetween(d.due_date, today);
    const when = overdue ? `quá hạn ${late} ngày` : d.due_date === today ? "hạn hôm nay" : `hạn ${dm(d.due_date)}`;
    items.push({
      kind: "dues",
      key: `dues:${d.id}`,
      state: d.claim_pending ? "info" : "todo",
      urgent: overdue && !d.claim_pending,
      title: d.plan_name,
      hint: d.claim_pending ? `${vnd(remaining)} · bạn đã báo đóng — chờ Thủ quỹ xác nhận` : `Còn ${vnd(remaining)} · ${when}`,
      href: planLink(d.plan_id),
      contributionId: d.id,
      planId: d.plan_id,
      planCode: d.plan_code,
      planName: d.plan_name,
      remainingVnd: remaining,
      dueDate: d.due_date,
      overdue,
      claimPending: !!d.claim_pending,
    });
  }

  // ---- Sự kiện hôm nay có điểm danh ----
  for (const e of eventsR.rows as Row[]) {
    const startsAt = isoOf(e.starts_at);
    const opensAt = isoOf(e.opens_at);
    const att = (e.att ?? null) as AttendanceStatus | null;
    const loc = e.location ? ` · ${e.location}` : "";
    const event = {
      id: e.id,
      title: e.title,
      dateIso: e.d,
      date: dmy(e.d),
      startHm: e.hm,
      endHm: e.ehm,
      location: e.location ?? "",
      startsAt,
      endsAt: isoOf(e.ends_at),
    };
    const base = { kind: "event_checkin" as const, key: `event:${e.id}`, event, opensAt, attendance: att, href: `/lich-su-kien?date=${e.d}` };
    const open = now >= new Date(opensAt).getTime();
    if (att === "present" || att === "late") {
      items.push({ ...base, open, state: "done", urgent: false, title: `Đã điểm danh · ${e.title}`, hint: `${ATT_LABEL[att]}${e.att_hm ? ` lúc ${e.att_hm}` : ""}` });
    } else if (att === "excused") {
      items.push({ ...base, open, state: "done", urgent: false, title: `Vắng có phép · ${e.title}`, hint: "Đơn xin phép đã được duyệt" });
    } else if (open) {
      const started = now >= new Date(startsAt).getTime();
      items.push({
        ...base,
        open,
        state: "todo",
        urgent: started,
        title: `Điểm danh · ${e.title}`,
        hint: `${e.hm}–${e.ehm}${loc} · ${started ? "đã bắt đầu, chụp ảnh gửi ngay" : "đang mở điểm danh"}`,
      });
    } else {
      items.push({ ...base, open, state: "info", urgent: false, title: `${e.title} lúc ${e.hm}`, hint: `Điểm danh mở lúc ${hm(opensAt)}${loc}` });
    }
  }

  // ---- Lễ bắt buộc check-in ----
  const conf: LitConf = {
    today,
    patron: (() => {
      const p = jsonText(b.patron);
      return p && /^\d{2}-\d{2}$/.test(p) ? p : null;
    })(),
    patronName: jsonText(b.patron_name)?.trim() || null,
    checkinSunday: b.c_sun !== false,
    checkinSolemnity: b.c_sol !== false,
    graceDays: typeof b.grace === "number" ? b.grace : 2,
    autoApproveNoPhoto: b.auto_ok === true,
    canManage: !!b.lit_manage,
    me: b.me,
    specials: (specialsR.rows as Row[]).map(toSpecial),
  };
  const massBy = new Map((massR.rows as Row[]).map((r) => [r.d as string, r]));
  const vnHour = Number(hm(nowIso).slice(0, 2));
  for (let k = Math.max(0, Math.min(conf.graceDays, 7)); k >= -1; k--) {
    const date = addDaysIso(today, -k);
    const day = liturgicalDay(date);
    const req = requirementFor(conf, day);
    if (!req || req.deadline < today) continue;
    const mine = massBy.get(date);
    const status = (mine?.status ?? null) as MassCheckinStatus | null;
    const base = {
      kind: "mass" as const,
      key: `mass:${date}`,
      date,
      label: req.label,
      evidenceRequired: req.evidenceRequired,
      deadline: req.deadline,
      status,
      reviewNote: mine?.review_note ?? null,
      href: `/lich-su-kien?date=${date}`,
    };
    const due = req.deadline === today ? "hạn: hết hôm nay" : `hạn: hết ngày ${dm(req.deadline)}`;
    const proof = req.evidenceRequired ? " · cần ảnh minh chứng" : "";
    if (status === "rejected") {
      items.push({ ...base, state: "todo", urgent: true, title: `Check-in lễ ${req.label} ${dm(date)} chưa hợp lệ`, hint: `${mine?.review_note ? `${mine.review_note} · ` : ""}gửi lại trước ${dm(req.deadline)}` });
    } else if (date === today) {
      if (status) items.push({ ...base, state: "done", urgent: false, title: `Đã check-in đi lễ · ${req.label}`, hint: status === "approved" ? "Đã được xác nhận" : "Chờ Ban Phụng vụ xác nhận" });
      else items.push({ ...base, state: "todo", urgent: false, title: `Check-in đi lễ hôm nay · ${req.label}`, hint: `${day.title}${proof} · ${due}` });
    } else if (date < today) {
      if (!status) items.push({ ...base, state: "todo", urgent: req.deadline === today, title: `Bạn chưa check-in lễ ${req.label} ${dm(date)}`, hint: `${day.title}${proof} · ${due}` });
    } else if (!status && vnHour >= 15) {
      // Ngày mai có lễ bắt buộc: dự lễ vọng chiều/tối nay thì check-in luôn được
      items.push({ ...base, state: "info", urgent: false, title: `Mai: ${req.label} — nhớ đi lễ`, hint: `Dự lễ vọng tối nay thì check-in luôn được${proof}` });
    }
  }

  // ---- Được nhờ để cửa ----
  for (const d of doorR.rows as Row[]) {
    const startsAt = isoOf(d.starts_at);
    if (new Date(startsAt).getTime() > now + 24 * HOUR) continue;
    const eff = isoOf(d.effective_ends_at);
    const ahead = new Date(eff).getTime() > now;
    const kind = d.kind as LeaveKind;
    items.push({
      kind: "door",
      key: `door:${d.leave_id}`,
      state: ahead ? "todo" : "info",
      urgent: false,
      title: `Để cửa cho ${d.member_name}`,
      hint: `${kind === "overnight_out" ? "Ngủ ngoài" : "Về muộn"} · ${ahead ? `dự kiến về ${hmDay(eff, today)}` : `đã quá giờ hẹn ${hmDay(eff, today)}`}${d.status === "pending" ? " · đơn đang chờ duyệt" : ""}`,
      href: "/xin-phep",
      leaveId: d.leave_id,
      memberName: d.member_name,
      leaveKind: kind,
      status: d.status as LeaveStatus,
      effectiveEndsAt: eff,
    });
  }

  // ---- Đơn xin phép của tôi ----
  for (const l of leaveR.rows as Row[]) {
    const kind = l.kind as LeaveKind;
    const status = l.status as LeaveStatus;
    const startsAt = isoOf(l.starts_at);
    const eff = isoOf(l.eff_end);
    const s = new Date(startsAt).getTime();
    const e = new Date(eff).getTime();
    const door = isDoorKind(kind);
    const canExtend = door && l.ext < 5 && now <= e + 12 * HOUR;
    const label = LEAVE_KIND_LABEL[kind];
    const range = `${hmDay(startsAt, today)} → ${hmDay(eff, today)}`;
    const base = {
      kind: "leave" as const,
      key: `leave:${l.id}`,
      href: "/xin-phep",
      leaveId: l.id,
      leaveKind: kind,
      status,
      startsAt,
      endsAt: isoOf(l.ends_at),
      effectiveEndsAt: eff,
      eventTitle: l.event_title ?? null,
      doorMemberName: l.door_name ?? null,
      extensions: l.ext,
      canExtend,
    };
    if (status === "pending") {
      if (e < now) continue;
      items.push({ ...base, state: "info", urgent: false, title: `Đơn “${label}” đang chờ duyệt`, hint: l.event_title ? `${l.event_title} · ${range}` : range });
      continue;
    }
    if (s > now + 12 * HOUR) continue;
    if (door) {
      if (e < now) items.push({ ...base, state: "todo", urgent: true, title: `Đã quá giờ về bạn báo (${hm(eff)})`, hint: "Về trễ hơn dự kiến? Xin thêm giờ để nhà biết." });
      else if (s <= now && e - now <= 2 * HOUR) items.push({ ...base, state: "todo", urgent: false, title: `Sắp tới giờ về bạn đã báo (${hm(eff)})`, hint: "Về trễ hơn? Bấm “Xin thêm giờ” để nhà biết." });
      else items.push({ ...base, state: "info", urgent: false, title: `Đã được phép: ${label.toLowerCase()}`, hint: `${range}${l.door_name ? ` · ${l.door_name} để cửa` : ""}` });
    } else if (kind !== "event_absence" && s <= now && e >= now) {
      items.push({ ...base, state: "info", urgent: false, title: `Đang nghỉ phép: ${label}`, hint: `Đến ${hmDay(eff, today)}` });
    } else if (kind !== "event_absence" && s > now) {
      items.push({ ...base, state: "info", urgent: false, title: `Sắp nghỉ phép: ${label}`, hint: range });
    }
  }

  // ---- Phân công phụng vụ ----
  for (const a of litR.rows as Row[]) {
    const startsAt = isoOf(a.starts_at);
    const assigned = a.status === "assigned";
    if (!assigned && new Date(startsAt).getTime() > now + 48 * HOUR) continue;
    items.push({
      kind: "liturgy",
      key: `liturgy:${a.id}`,
      state: assigned ? "todo" : "info",
      urgent: assigned && new Date(startsAt).getTime() - now <= 24 * HOUR,
      title: `${assigned ? "Nhận lời phục vụ" : "Bạn phục vụ"}: ${a.role_name}`,
      hint: `${a.title} · ${hmDay(startsAt, today)}`,
      href: "/phung-vu",
      assignmentId: a.id,
      status: assigned ? "assigned" : "confirmed",
      roleName: a.role_name,
      eventTitle: a.title,
      startsAt,
    });
  }

  // ---- Hình phạt đang chấp hành ----
  for (const r of discR.rows as Row[]) {
    const phase = r.phase as "upcoming" | "serving" | "overdue";
    if (phase !== "upcoming" && phase !== "serving" && phase !== "overdue") continue;
    const penalty = penaltyText(r.penalty_kind as PenaltyKind, r.penalty_qty ?? null, r.penalty_detail ?? null);
    const period = phase === "upcoming" ? (r.starts_on ? `bắt đầu ${dm(r.starts_on)}` : "") : r.ends_on ? `${phase === "overdue" ? "hết hạn" : "đến"} ${dm(r.ends_on)}` : "";
    items.push({
      kind: "discipline",
      key: `discipline:${r.id}`,
      state: phase === "upcoming" ? "info" : "todo",
      urgent: phase === "overdue",
      title: `${phase === "overdue" ? "Hình phạt quá hạn" : phase === "upcoming" ? "Sắp chấp hành" : "Đang chấp hành"}: ${penalty}`,
      hint: [r.rule_title, period].filter(Boolean).join(" · "),
      href: "/ky-luat",
      recordId: r.id,
      phase,
      penalty,
      ruleTitle: r.rule_title,
      startsOn: r.starts_on ?? null,
      endsOn: r.ends_on ?? null,
      isRed: !!r.is_red,
    });
  }

  // ---- Luật nhà chưa xác nhận đọc ----
  const rules = (rulesR.rows[0] ?? {}) as Row;
  const rulesUpdated = rules.updated_at ? isoOf(rules.updated_at) : null;
  if (rules.version && !rules.acked_at) {
    items.push({
      kind: "house_rules",
      key: `rules:${rules.version}`,
      state: "todo",
      urgent: false,
      title: rules.ever_acked ? "Luật nhà vừa cập nhật — đọc và xác nhận lại" : "Đọc và xác nhận Luật nhà",
      hint: rulesUpdated ? `Phiên bản cập nhật ${dmy(vnDate(rulesUpdated))}` : null,
      href: "/thong-bao?tab=luat#xac-nhan-luat-nha",
      version: rules.version,
      updatedAt: rulesUpdated,
      everAcked: !!rules.ever_acked,
    });
  }

  // ---- Xếp: gấp → cần làm → cần biết → đã xong; cùng mức theo loại việc ----
  const rank = (i: MyTodayItem) => (i.state === "todo" ? (i.urgent ? 0 : 1) : i.state === "info" ? 2 : 3);
  const order = (i: MyTodayItem) => MY_TODAY_KIND_ORDER.indexOf(i.kind);
  const sorted = items.map((it, idx) => ({ it, idx })).sort((a, z) => rank(a.it) - rank(z.it) || order(a.it) - order(z.it) || a.idx - z.idx).map((x) => x.it);

  const joinedOn: string = b.joined_on ?? today;
  const daysSinceJoined = Math.max(0, daysBetween(joinedOn, today));
  const onboarding: OnboardingDto = {
    joinedOn,
    daysSinceJoined,
    isNew: daysSinceJoined <= 30,
    avatar: !!b.avatar_file_id,
    paymentAccount: !!b.has_payment,
    pushDevices: Number(b.push_devices ?? 0),
    consentChoice: !!b.consent_choice,
    houseRules: { version: rules.version ?? null, updatedAt: rulesUpdated, ackedAt: rules.acked_at ? isoOf(rules.acked_at) : null },
  };

  return {
    today,
    generatedAt: nowIso,
    items: sorted,
    todo: sorted.filter((i) => i.state === "todo").length,
    dues: { count: dues.length, totalVnd: dues.reduce((s, d) => s + Number(d.remaining), 0), hidden: dues.length - shownDues.length },
    onboarding,
  };
}
