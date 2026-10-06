import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { forbidden } from "../errors";
import { permissions } from "./community-shared";
import type { ActivityReportDto, ReportKind } from "@/lib/types/activity-report";

// Báo cáo hoạt động quý/năm: chỉ số liệu TỔNG HỢP. Mỗi mục đọc qua RLS của người gọi (tài chính cần quyền xem thống kê quỹ).

export const ReportQuerySchema = z.object({
  kind: z.enum(["quarter", "year"]),
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export function periodOf(kind: ReportKind, year: number, quarter?: number) {
  if (kind === "year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Năm ${year}`, quarter: null };
  const q = quarter ?? 1;
  const m1 = (q - 1) * 3 + 1;
  const m3 = m1 + 2;
  return { from: `${year}-${pad(m1)}-01`, to: `${year}-${pad(m3)}-${pad(lastDay(year, m3))}`, label: `Quý ${q}/${year}`, quarter: q };
}

export async function buildActivityReport(tx: Tx, kind: ReportKind, year: number, quarter?: number): Promise<ActivityReportDto> {
  const perm = await permissions(tx, ["report.read", "finance.summary.read"] as const);
  if (!perm["report.read"]) throw forbidden("Bạn không có quyền xem báo cáo hoạt động.");
  const { from, to, label, quarter: q } = periodOf(kind, year, quarter);

  const [house, mem, gender, uni, ev, evCat, att, duty, issues] = await Promise.all([
    tx
      .query<{ k: string; v: string | null }>("SELECT key AS k, value #>> '{}' AS v FROM settings WHERE key IN ('org.house_name', 'org.order_name', 'org.address', 'org.motto')")
      .then((r) => Object.fromEntries(r.rows.map((x) => [x.k, x.v]))),
    tx.query(
      `SELECT count(*) FILTER (WHERE joined_on < $1 AND (left_on IS NULL OR left_on >= $1))::int AS start_n,
              count(*) FILTER (WHERE joined_on <= $2 AND (left_on IS NULL OR left_on > $2))::int AS end_n,
              count(*) FILTER (WHERE joined_on BETWEEN $1 AND $2)::int AS joined_n,
              count(*) FILTER (WHERE left_on BETWEEN $1 AND $2 AND status = 'alumni')::int AS alumni_n,
              count(*) FILTER (WHERE left_on BETWEEN $1 AND $2 AND status = 'left')::int AS left_n
         FROM members WHERE deleted_at IS NULL`,
      [from, to]
    ),
    tx.query(
      `SELECT count(*) FILTER (WHERE gender = 'male')::int AS male, count(*) FILTER (WHERE gender = 'female')::int AS female
         FROM members WHERE deleted_at IS NULL AND joined_on <= $1 AND (left_on IS NULL OR left_on > $1)`,
      [to]
    ),
    tx.query(
      `SELECT COALESCE(u.name, 'Chưa cập nhật') AS name, count(*)::int AS n
         FROM members m
         LEFT JOIN student_profiles sp ON sp.member_id = m.id AND sp.is_current AND sp.deleted_at IS NULL
         LEFT JOIN universities u ON u.id = sp.university_id
        WHERE m.deleted_at IS NULL AND m.joined_on <= $1 AND (m.left_on IS NULL OR m.left_on > $1)
        GROUP BY 1 ORDER BY n DESC, 1 LIMIT 6`,
      [to]
    ),
    tx.query(
      `SELECT count(*) FILTER (WHERE status IN ('scheduled', 'ongoing', 'completed'))::int AS total,
              count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM events WHERE starts_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      [from, to]
    ),
    tx.query(
      `SELECT c.name, count(*)::int AS n
         FROM events e JOIN categories c ON c.id = e.category_id
        WHERE e.status IN ('scheduled', 'ongoing', 'completed')
          AND e.starts_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND e.starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        GROUP BY c.name ORDER BY n DESC, c.name LIMIT 8`,
      [from, to]
    ),
    tx.query(
      `SELECT count(*) FILTER (WHERE a.status = 'present')::int AS present, count(*) FILTER (WHERE a.status = 'late')::int AS late,
              count(*) FILTER (WHERE a.status = 'absent')::int AS absent, count(*) FILTER (WHERE a.status = 'excused')::int AS excused
         FROM attendance_records a JOIN events e ON e.id = a.event_id
        WHERE e.status = 'completed'
          AND e.starts_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND e.starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      [from, to]
    ),
    tx.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'approved')::int AS approved,
              count(*) FILTER (WHERE status = 'missed')::int AS missed, count(*) FILTER (WHERE status = 'excused')::int AS excused
         FROM duty_assignments WHERE duty_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
      [from, to]
    ),
    tx.query(
      `SELECT count(*) FILTER (WHERE created_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS opened,
              count(*) FILTER (WHERE status = 'done' AND resolved_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND resolved_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS done
         FROM maintenance_issues`,
      [from, to]
    ),
  ]);

  let finance: ActivityReportDto["finance"] = null;
  if (perm["finance.summary.read"]) {
    const s = (await tx.query<{ s: Record<string, any> }>("SELECT app.fn_finance_summary($1::date, $2::date) AS s", [from, to])).rows[0]?.s ?? {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    finance = {
      openingVnd: Number(s.opening_balance_vnd ?? 0),
      incomeVnd: Number(s.total_in_vnd ?? 0),
      expenseVnd: Number(s.total_out_vnd ?? 0),
      closingVnd: Number(s.closing_balance_vnd ?? 0),
      duesExpectedVnd: Number(s.dues_expected_vnd ?? 0),
      duesCollectedVnd: Number(s.dues_collected_vnd ?? 0),
      collectionRatePct: s.collection_rate_pct === null || s.collection_rate_pct === undefined ? null : Number(s.collection_rate_pct),
      expenseByCategory: ((s.expense_by_category ?? []) as Record<string, any>[]) // eslint-disable-line @typescript-eslint/no-explicit-any
        .map((x) => ({ name: String(x.name), amountVnd: Number(x.total_vnd), count: Number(x.count) }))
        .sort((a, b) => b.amountVnd - a.amountVnd),
    };
  }

  const m = mem.rows[0];
  const a = att.rows[0];
  const d = duty.rows[0];
  const attDen = a.present + a.late + a.absent;
  return {
    kind,
    year,
    quarter: q,
    label,
    from,
    to,
    generatedAt: new Date().toISOString(),
    house: { name: house["org.house_name"] ?? "Lưu Xá Phanxicô", orderName: house["org.order_name"] ?? null, address: house["org.address"] ?? null, motto: house["org.motto"] ?? null },
    members: {
      startCount: m.start_n,
      endCount: m.end_n,
      joined: m.joined_n,
      becameAlumni: m.alumni_n,
      left: m.left_n,
      male: gender.rows[0].male,
      female: gender.rows[0].female,
      byUniversity: uni.rows.map((r) => ({ name: r.name, count: r.n })),
    },
    finance,
    events: {
      total: ev.rows[0].total,
      completed: ev.rows[0].completed,
      cancelled: ev.rows[0].cancelled,
      byCategory: evCat.rows.map((r) => ({ name: r.name, count: r.n })),
      attendance: { present: a.present, late: a.late, absent: a.absent, excused: a.excused, ratePct: pct(a.present + a.late, attDen) },
    },
    duty: {
      assignments: d.total,
      approved: d.approved,
      missed: d.missed,
      excused: d.excused,
      completionPct: pct(d.approved, d.approved + d.missed),
      issuesOpened: issues.rows[0].opened,
      issuesDone: issues.rows[0].done,
    },
  };
}
