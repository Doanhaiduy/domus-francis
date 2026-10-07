import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { forbidden } from "../errors";
import { permissions, iso } from "./community-shared";
import { PHASE_SQL } from "./discipline";
import { penaltyText, type PenaltyKind } from "@/lib/types/discipline";
import type {
  MemberAcademicStat,
  MemberAttendanceStat,
  MemberDisciplineStat,
  MemberDonationStat,
  MemberDutyStat,
  MemberFinanceStat,
  MemberLeaveStat,
  MemberReportDto,
  MemberReportKind,
  MemberReportRow,
  MemberReportScope,
} from "@/lib/types/member-report";

// Tổng kết theo thành viên + cả nhà theo tháng / quý / năm. Mỗi mục đọc dưới RLS của người gọi và chỉ chạy khi người gọi có quyền xem mục đó
// (phạm vi "all" cần report.read); phạm vi "me" chỉ gồm số liệu của chính mình. Điểm học tập chỉ hiện với thành viên đã đồng ý chia sẻ.

export const MemberReportQuerySchema = z.object({
  kind: z.enum(["month", "quarter", "year"]),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  scope: z.enum(["all", "me"]).default("all"),
});
export type MemberReportQuery = z.infer<typeof MemberReportQuerySchema>;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const num = (v: unknown) => Number(v ?? 0);

export function memberPeriodOf(kind: MemberReportKind, year: number, month?: number, quarter?: number) {
  if (kind === "year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Năm ${year}`, month: null, quarter: null };
  if (kind === "month") {
    const m = month ?? 1;
    return { from: `${year}-${pad(m)}-01`, to: `${year}-${pad(m)}-${pad(lastDay(year, m))}`, label: `Tháng ${m}/${year}`, month: m, quarter: null };
  }
  const q = quarter ?? 1;
  const m1 = (q - 1) * 3 + 1;
  return { from: `${year}-${pad(m1)}-01`, to: `${year}-${pad(m1 + 2)}-${pad(lastDay(year, m1 + 2))}`, label: `Quý ${q}/${year}`, month: null, quarter: q };
}

const TS_FROM = "($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'";
const TS_TO = "(($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')";

const emptyAttendance = (): MemberAttendanceStat => ({ present: 0, late: 0, excused: 0, absent: 0, ratePct: null });
const emptyLeave = (): MemberLeaveStat => ({ total: 0, approved: 0, rejected: 0, pending: 0, lateReturn: 0, overnightOut: 0, longLeave: 0, eventAbsence: 0 });
const emptyDuty = (): MemberDutyStat => ({ weeks: 0, reviewed: 0, avgScore: null, redo: 0 });
const emptyDiscipline = (): MemberDisciplineStat => ({ count: 0, active: 0, overdue: 0, completed: 0, waived: 0, rosary: 0, mass: 0, duty: 0, other: 0 });
const emptyFinance = (): MemberFinanceStat => ({ dueVnd: 0, paidVnd: 0, owedVnd: 0, overdueVnd: 0, unpaidCount: 0 });

export async function buildMemberReport(tx: Tx, q: MemberReportQuery): Promise<MemberReportDto> {
  const scope: MemberReportScope = q.scope;
  const p = await permissions(tx, [
    "report.read",
    "event.attendance.read_all",
    "leave.review",
    "merit.read_all",
    "discipline.read",
    "discipline.manage",
    "finance.contribution.read_all",
    "finance.contribution.record",
    "academic.read_all",
  ] as const);
  const all = scope === "all";
  if (all && !p["report.read"]) {
    throw forbidden("Bạn không có quyền xem tổng kết cả nhà. Hãy chọn “Của tôi”.");
  }
  const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0]?.id ?? null;
  if (!all && !me) {
    throw forbidden("Tài khoản này chưa gắn hồ sơ thành viên nên chưa có tổng kết cá nhân.");
  }

  // Mục nào được hiện: phạm vi "me" ⇒ mọi mục (chỉ dữ liệu của mình, RLS lo phần còn lại); phạm vi "all" ⇒ theo quyền
  const sections = {
    attendance: !all || p["event.attendance.read_all"],
    leave: !all || p["leave.review"],
    duty: true,
    merit: !all || p["merit.read_all"],
    discipline: !all || p["discipline.read"] || p["discipline.manage"],
    finance: !all || p["finance.contribution.read_all"],
    donations: !all || p["finance.contribution.record"],
    academic: !all || p["academic.read_all"],
  };

  const { from, to, label, month, quarter } = memberPeriodOf(q.kind, q.year, q.month, q.quarter);
  const only = all ? "" : " AND m.id = app.current_member_id()";

  const [house, base] = await Promise.all([
    tx
      .query<{ k: string; v: string | null }>("SELECT key AS k, value #>> '{}' AS v FROM settings WHERE key IN ('org.house_name', 'org.order_name', 'org.address')")
      .then((r) => Object.fromEntries(r.rows.map((x) => [x.k, x.v]))),
    tx.query<Row>(
      `SELECT m.id, COALESCE(m.display_name, m.full_name) AS name, m.full_name, m.status::text AS status,
              (SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
                WHERE ra.member_id = m.id AND ra.starts_on <= $2::date AND (ra.ends_on IS NULL OR ra.ends_on > $2::date)
                ORDER BY ra.starts_on DESC LIMIT 1) AS room
         FROM members m
        WHERE m.deleted_at IS NULL AND m.joined_on <= $2::date AND (m.left_on IS NULL OR m.left_on >= $1::date)${only}
        ORDER BY COALESCE(m.display_name, m.full_name)`,
      [from, to]
    ),
  ]);

  const rows = new Map<string, MemberReportRow>();
  for (const r of base.rows) {
    rows.set(r.id, {
      memberId: r.id,
      name: r.name,
      fullName: r.full_name,
      room: r.room ?? null,
      status: r.status,
      attendance: sections.attendance ? emptyAttendance() : null,
      leave: sections.leave ? emptyLeave() : null,
      duty: emptyDuty(),
      merit: sections.merit ? { points: 0, entries: 0 } : null,
      discipline: sections.discipline ? emptyDiscipline() : null,
      finance: sections.finance ? emptyFinance() : null,
      donations: sections.donations ? { count: 0, totalVnd: 0 } : null,
      academic: null,
    });
  }
  const ids = [...rows.keys()];
  const scoped = (alias: string) => (all ? "" : ` AND ${alias}.member_id = app.current_member_id()`);

  const [att, leave, duty, merit, disc, fin, don, aca, ev, evCat, donAgg, pendDon, discList, donList] = await Promise.all([
    sections.attendance
      ? tx.query<Row>(
          `SELECT a.member_id, count(*) FILTER (WHERE a.status = 'present')::int AS present, count(*) FILTER (WHERE a.status = 'late')::int AS late,
                  count(*) FILTER (WHERE a.status = 'excused')::int AS excused, count(*) FILTER (WHERE a.status = 'absent')::int AS absent
             FROM attendance_records a JOIN events e ON e.id = a.event_id
            WHERE e.status = 'completed' AND e.starts_at >= ${TS_FROM} AND e.starts_at < ${TS_TO}${scoped("a")}
            GROUP BY a.member_id`,
          [from, to]
        )
      : null,
    sections.leave
      ? tx.query<Row>(
          `SELECT l.member_id, count(*)::int AS total, count(*) FILTER (WHERE l.status = 'approved')::int AS approved,
                  count(*) FILTER (WHERE l.status = 'rejected')::int AS rejected, count(*) FILTER (WHERE l.status = 'pending')::int AS pending,
                  count(*) FILTER (WHERE l.kind = 'late_return')::int AS late_return, count(*) FILTER (WHERE l.kind = 'overnight_out')::int AS overnight_out,
                  count(*) FILTER (WHERE l.kind = 'long_leave')::int AS long_leave, count(*) FILTER (WHERE l.kind = 'event_absence')::int AS event_absence
             FROM leave_requests l
            WHERE l.status <> 'cancelled' AND l.starts_at >= ${TS_FROM} AND l.starts_at < ${TS_TO}${scoped("l")}
            GROUP BY l.member_id`,
          [from, to]
        )
      : null,
    tx.query<Row>(
      `SELECT wm.member_id, count(*)::int AS weeks, count(w.score)::int AS reviewed, round(avg(w.score)::numeric, 1)::float AS avg_score,
              count(*) FILTER (WHERE w.redo_required)::int AS redo
         FROM duty_week_members wm JOIN duty_weeks w ON w.id = wm.week_id
        WHERE w.week_start BETWEEN $1::date AND $2::date${scoped("wm")}
        GROUP BY wm.member_id`,
      [from, to]
    ),
    sections.merit
      ? tx.query<Row>(
          `SELECT e.member_id, COALESCE(sum(e.points), 0)::int AS points, count(*)::int AS entries
             FROM merit_entries e WHERE e.occurred_on BETWEEN $1::date AND $2::date${scoped("e")} GROUP BY e.member_id`,
          [from, to]
        )
      : null,
    sections.discipline
      ? tx.query<Row>(
          `SELECT x.member_id, count(*)::int AS n,
                  count(*) FILTER (WHERE x.phase IN ('upcoming', 'serving', 'overdue'))::int AS active, count(*) FILTER (WHERE x.phase = 'overdue')::int AS overdue,
                  count(*) FILTER (WHERE x.phase = 'completed')::int AS completed, count(*) FILTER (WHERE x.phase = 'waived')::int AS waived,
                  COALESCE(sum(x.penalty_qty) FILTER (WHERE x.penalty_kind = 'rosary' AND x.status <> 'waived'), 0)::int AS rosary,
                  COALESCE(sum(x.penalty_qty) FILTER (WHERE x.penalty_kind = 'mass' AND x.status <> 'waived'), 0)::int AS mass,
                  COALESCE(sum(x.penalty_qty) FILTER (WHERE x.penalty_kind = 'duty' AND x.status <> 'waived'), 0)::int AS duty,
                  count(*) FILTER (WHERE x.penalty_kind = 'other' AND x.status <> 'waived')::int AS other
             FROM (SELECT r.*, ${PHASE_SQL} AS phase FROM discipline_records r WHERE r.occurred_on BETWEEN $1::date AND $2::date${scoped("r")}) x
            GROUP BY x.member_id`,
          [from, to]
        )
      : null,
    sections.finance
      ? tx.query<Row>(
          `SELECT ct.member_id, COALESCE(sum(ct.amount_due_vnd - ct.discount_vnd), 0)::bigint AS due, COALESCE(sum(ct.paid_vnd), 0)::bigint AS paid,
                  COALESCE(sum(GREATEST(ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd, 0)) FILTER (WHERE ct.status IN ('unpaid', 'partial')), 0)::bigint AS owed,
                  COALESCE(sum(GREATEST(ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd, 0)) FILTER (WHERE ct.status IN ('unpaid', 'partial') AND ct.due_date < app.local_today()), 0)::bigint AS overdue,
                  count(*) FILTER (WHERE ct.status IN ('unpaid', 'partial'))::int AS unpaid_n
             FROM contributions ct WHERE ct.due_date BETWEEN $1::date AND $2::date AND ct.status <> 'cancelled'${scoped("ct")}
            GROUP BY ct.member_id`,
          [from, to]
        )
      : null,
    sections.donations
      ? tx.query<Row>(
          `SELECT d.donor_member_id AS member_id, count(*)::int AS n, COALESCE(sum(d.amount_vnd), 0)::bigint AS total
             FROM donations d WHERE d.status = 'confirmed' AND d.donor_member_id IS NOT NULL AND d.donated_on BETWEEN $1::date AND $2::date
            GROUP BY d.donor_member_id`,
          [from, to]
        )
      : null,
    sections.academic
      ? tx.query<Row>(
          `SELECT DISTINCT ON (g.member_id) g.member_id, g.gpa10::float AS gpa10, g.gpa4::float AS gpa4, s.name AS semester
             FROM gpa_snapshots g JOIN semesters s ON s.id = g.as_of_semester_id
            WHERE g.scope = 'semester' AND s.starts_on <= $2::date AND s.ends_on >= $1::date${scoped("g")}
            ORDER BY g.member_id, s.ends_on DESC`,
          [from, to]
        )
      : null,
    tx.query<Row>(
      `SELECT count(*) FILTER (WHERE status IN ('scheduled', 'ongoing', 'completed'))::int AS total, count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM events WHERE starts_at >= ${TS_FROM} AND starts_at < ${TS_TO}`,
      [from, to]
    ),
    tx.query<Row>(
      `SELECT c.code, c.name, count(*)::int AS n
         FROM events e JOIN categories c ON c.id = e.category_id
        WHERE e.status IN ('scheduled', 'ongoing', 'completed') AND e.starts_at >= ${TS_FROM} AND e.starts_at < ${TS_TO}
        GROUP BY c.code, c.name ORDER BY n DESC, c.name`,
      [from, to]
    ),
    sections.donations && all
      ? tx.query<Row>(
          `SELECT count(*)::int AS n, COALESCE(sum(amount_vnd), 0)::bigint AS total,
                  count(DISTINCT CASE WHEN donor_member_id IS NOT NULL THEN 'm:' || donor_member_id::text ELSE 'n:' || lower(btrim(donor_name)) END)::int AS donors,
                  count(DISTINCT donor_member_id)::int AS member_donors
             FROM donations WHERE status = 'confirmed' AND donated_on BETWEEN $1::date AND $2::date`,
          [from, to]
        )
      : null,
    sections.donations && all ? tx.query<Row>("SELECT count(*)::int AS n FROM donations WHERE status = 'pending'") : null,
    sections.discipline && all
      ? tx.query<Row>(
          `SELECT COALESCE(mb.display_name, mb.full_name) AS member_name, r.occurred_on, r.rule_title, r.penalty_kind, r.penalty_qty, r.penalty_detail,
                  r.penalty_starts_on, r.penalty_ends_on, ${PHASE_SQL} AS phase
             FROM discipline_records r JOIN members mb ON mb.id = r.member_id
            WHERE r.occurred_on BETWEEN $1::date AND $2::date ORDER BY r.occurred_on, COALESCE(mb.display_name, mb.full_name) LIMIT 2000`,
          [from, to]
        )
      : null,
    sections.donations && all
      ? tx.query<Row>(
          `SELECT d.donor_name, d.donor_member_id, d.donated_on, d.amount_vnd, d.method::text AS method, f.name AS fund_name
             FROM donations d LEFT JOIN funds f ON f.id = d.fund_id
            WHERE d.status = 'confirmed' AND d.donated_on BETWEEN $1::date AND $2::date ORDER BY d.donated_on, d.donor_name LIMIT 2000`,
          [from, to]
        )
      : null,
  ]);

  const set = (res: { rows: Row[] } | null, apply: (row: MemberReportRow, r: Row) => void) => {
    for (const r of res?.rows ?? []) {
      const row = rows.get(r.member_id);
      if (row) apply(row, r);
    }
  };
  set(att, (row, r) => {
    const a = row.attendance!;
    a.present = r.present;
    a.late = r.late;
    a.excused = r.excused;
    a.absent = r.absent;
    a.ratePct = pct(r.present + r.late, r.present + r.late + r.absent);
  });
  set(leave, (row, r) => {
    row.leave = { total: r.total, approved: r.approved, rejected: r.rejected, pending: r.pending, lateReturn: r.late_return, overnightOut: r.overnight_out, longLeave: r.long_leave, eventAbsence: r.event_absence };
  });
  set(duty, (row, r) => {
    row.duty = { weeks: r.weeks, reviewed: r.reviewed, avgScore: r.avg_score === null ? null : Number(r.avg_score), redo: r.redo };
  });
  set(merit, (row, r) => {
    row.merit = { points: r.points, entries: r.entries };
  });
  set(disc, (row, r) => {
    row.discipline = { count: r.n, active: r.active, overdue: r.overdue, completed: r.completed, waived: r.waived, rosary: r.rosary, mass: r.mass, duty: r.duty, other: r.other };
  });
  set(fin, (row, r) => {
    row.finance = { dueVnd: num(r.due), paidVnd: num(r.paid), owedVnd: num(r.owed), overdueVnd: num(r.overdue), unpaidCount: r.unpaid_n };
  });
  set(don, (row, r) => {
    row.donations = { count: r.n, totalVnd: num(r.total) } satisfies MemberDonationStat;
  });
  set(aca, (row, r) => {
    row.academic = { semester: r.semester, gpa10: r.gpa10, gpa4: r.gpa4 } satisfies MemberAcademicStat;
  });

  const members = [...rows.values()];
  const sum = <K extends string>(pick: (r: MemberReportRow) => Record<K, number> | null, keys: K[]) => {
    const t = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    for (const m of members) {
      const v = pick(m);
      if (v) for (const k of keys) t[k] += v[k] ?? 0;
    }
    return t;
  };

  const attT = sections.attendance ? sum((m) => m.attendance, ["present", "late", "excused", "absent"]) : null;
  const leaveT = sections.leave ? sum((m) => m.leave, ["total", "approved", "rejected", "pending", "lateReturn", "overnightOut", "longLeave", "eventAbsence"]) : null;
  const dutyT = sum((m) => m.duty, ["weeks", "reviewed", "redo"]);
  const discT = sections.discipline ? sum((m) => m.discipline, ["count", "active", "overdue", "completed", "waived", "rosary", "mass", "duty", "other"]) : null;
  const finT = sections.finance ? sum((m) => m.finance, ["dueVnd", "paidVnd", "owedVnd", "overdueVnd", "unpaidCount"]) : null;
  const scores = members.flatMap((m) => (m.duty && m.duty.avgScore !== null && m.duty.reviewed ? Array(m.duty.reviewed).fill(m.duty.avgScore) : []));
  const evCount = (code: string) => evCat.rows.find((r) => r.code === code)?.n ?? 0;
  const dA = donAgg?.rows[0];

  return {
    kind: q.kind,
    scope,
    year: q.year,
    month,
    quarter,
    label,
    from,
    to,
    generatedAt: new Date().toISOString(),
    house: { name: house["org.house_name"] ?? "Lưu Xá Phanxicô", orderName: house["org.order_name"] ?? null, address: house["org.address"] ?? null },
    sections,
    members,
    house_totals: {
      memberCount: ids.length,
      events: {
        total: ev.rows[0].total,
        completed: ev.rows[0].completed,
        cancelled: ev.rows[0].cancelled,
        pilgrimages: evCount("EVT_PILGRIM"),
        rosary: evCount("EVT_ROSARY"),
        byCategory: evCat.rows.map((r) => ({ code: r.code, name: r.name, count: r.n })),
      },
      attendance: attT ? { ...attT, ratePct: pct(attT.present + attT.late, attT.present + attT.late + attT.absent), records: attT.present + attT.late + attT.excused + attT.absent } : null,
      leave: leaveT,
      duty: { weeks: dutyT.weeks, avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null },
      merit: sections.merit ? { points: members.reduce((s, m) => s + (m.merit?.points ?? 0), 0) } : null,
      discipline: discT ? { ...discT, people: members.filter((m) => (m.discipline?.count ?? 0) > 0).length } : null,
      finance: finT,
      donations: dA ? { count: dA.n, totalVnd: num(dA.total), donors: dA.donors, memberDonors: dA.member_donors, pendingCount: pendDon?.rows[0]?.n ?? 0 } : null,
    },
    details: {
      discipline: discList
        ? discList.rows.map((r) => ({
            memberName: r.member_name,
            occurredOn: iso(r.occurred_on).slice(0, 10),
            ruleTitle: r.rule_title,
            penalty: penaltyText(r.penalty_kind as PenaltyKind, r.penalty_qty, r.penalty_detail),
            startsOn: r.penalty_starts_on ? iso(r.penalty_starts_on).slice(0, 10) : null,
            endsOn: r.penalty_ends_on ? iso(r.penalty_ends_on).slice(0, 10) : null,
            status: r.phase,
          }))
        : null,
      donations: donList
        ? donList.rows.map((r) => ({ donorName: r.donor_name, isMember: !!r.donor_member_id, donatedOn: iso(r.donated_on).slice(0, 10), amountVnd: num(r.amount_vnd), method: r.method, fundName: r.fund_name ?? null }))
        : null,
    },
  };
}
