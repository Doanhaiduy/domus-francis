import "server-only";
import type { QueryResult } from "pg";
import { batch, type Tx } from "../db";
import { ApiError, badRequest, forbidden } from "../errors";
import {
  monthRangeLabel,
  planShortLabel,
  type BankAccountDto,
  type ContributionPlanDto,
  type FeeType,
  type FinanceMonthDto,
  type FinanceOptionsDto,
  type FinanceOverviewDto,
  type FinanceSummaryDto,
  type FundDto,
  type MemberContributionRow,
  type PeriodStatus,
  type PersonRef,
  type PlanSummaryDto,
  type ReceivingAccountDto,
} from "@/lib/types/finance";

// ---------------------------------------------------------------------
// Ngữ cảnh người gọi: mã user/member + các quyền tài chính (một truy vấn)
// ---------------------------------------------------------------------
export interface FinanceCaller {
  uid: string;
  mid: string | null;
  today: string;
  summary: boolean;
  ledger: boolean;
  readAll: boolean;
  create: boolean;
  approve: boolean;
  pay: boolean;
  reverse: boolean;
  contribAll: boolean;
  record: boolean;
  waive: boolean;
  planManage: boolean;
  fundOptions: boolean;
  /** Vai trò duyệt chi đang hiệu lực của người gọi (house_head / treasurer) */
  approverRoles: string[];
  /** Hạn mức Thủ quỹ tự duyệt một chữ ký (null nếu không đọc được cấu hình) */
  treasurerSoloMaxVnd: number | null;
}

/** Một câu SQL trong batch(): [sql, tham số?] */
export type SqlItem = readonly [sql: string, params?: readonly unknown[]];

/** Câu SQL của financeCaller() — để gộp vào batch của hàm gọi; đọc kết quả bằng financeCallerFrom(). */
export const FINANCE_CALLER_SQL = `SELECT app.current_user_id() AS uid, app.current_member_id() AS mid, app.local_today()::text AS today,
              app.has_permission('finance.summary.read') AS summary,
              app.has_permission('finance.ledger.read') AS ledger,
              app.has_permission('finance.expense.read_all') AS read_all,
              app.has_permission('finance.expense.create') AS "create",
              app.has_permission('finance.expense.approve') AS approve,
              app.has_permission('finance.expense.pay') AS pay,
              app.has_permission('finance.expense.reverse') AS reverse,
              app.has_permission('finance.contribution.read_all') AS contrib_all,
              app.has_permission('finance.contribution.record') AS record,
              app.has_permission('finance.contribution.waive') AS waive,
              app.has_permission('finance.contribution.plan.manage') AS plan_manage,
              app.has_any_permission(ARRAY['finance.expense.create', 'finance.expense.read_all', 'finance.expense.pay',
                'finance.contribution.record', 'finance.ledger.read', 'finance.fund.manage', 'finance.reconcile']) AS fund_options,
              ARRAY(SELECT r FROM unnest(ARRAY['house_head', 'treasurer']) r WHERE app.has_role(r)) AS approver_roles,
              (SELECT (value #>> '{}')::bigint FROM settings WHERE key = 'finance.expense.treasurer_solo_approve_max_vnd') AS solo_max`;

export function financeCallerFrom(res: QueryResult): FinanceCaller {
  const r = res.rows[0];
  return {
    uid: r.uid,
    mid: r.mid,
    today: r.today,
    summary: r.summary,
    ledger: r.ledger,
    readAll: r.read_all,
    create: r.create,
    approve: r.approve,
    pay: r.pay,
    reverse: r.reverse,
    contribAll: r.contrib_all,
    record: r.record,
    waive: r.waive,
    planManage: r.plan_manage,
    fundOptions: r.fund_options,
    approverRoles: r.approver_roles ?? [],
    treasurerSoloMaxVnd: r.solo_max === null || r.solo_max === undefined ? null : Number(r.solo_max),
  };
}

export async function financeCaller(tx: Tx): Promise<FinanceCaller> {
  return financeCallerFrom(await tx.query(FINANCE_CALLER_SQL));
}

// ---------------------------------------------------------------------
// Định dạng
// ---------------------------------------------------------------------
export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
};
/** "Tháng 10/2026" */
export const monthLabel = (ym: string) => `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const shortLabel = (ym: string) => `T${Number(ym.slice(5, 7))}`;

interface SummaryJson {
  opening_balance_vnd: number;
  total_in_vnd: number;
  total_out_vnd: number;
  closing_balance_vnd: number;
  dues_expected_vnd: number;
  dues_collected_vnd: number;
  collection_rate_pct: number | null;
  expense_by_category: { code: string; name: string; color: string; total_vnd: number; count: number }[];
}

// Các truy vấn tổng hợp dưới đây có dạng "câu SQL" (gộp vào batch của hàm gọi) + "đọc kết quả" — DB ở xa, mỗi vòng mạng đều đắt.
const summaryItem = (from: string, to: string): SqlItem => ["SELECT app.fn_finance_summary($1::date, $2::date) AS s", [from, to]];
const summaryFrom = (r: QueryResult): SummaryJson => r.rows[0].s;

/** 6 tháng kết thúc ở tháng chứa `endIso` — thu/chi thuần + số dư cuối tháng (fn_finance_summary, đọc trực tiếp sổ cái). */
const lastMonthsItem = (endIso: string, n = 6): SqlItem => [
  `SELECT to_char(m, 'YYYY-MM') AS m,
              app.fn_finance_summary(m::date, (m + interval '1 month' - interval '1 day')::date) AS s
         FROM generate_series(date_trunc('month', $1::date) - make_interval(months => $2 - 1), date_trunc('month', $1::date), interval '1 month') m
        ORDER BY m`,
  [endIso, n],
];

function lastMonthsFrom(res: QueryResult): FinanceMonthDto[] {
  const rows = res.rows as { m: string; s: SummaryJson }[];
  return rows.map((r) => ({
    month: r.m,
    label: shortLabel(r.m),
    incomeVnd: Number(r.s.total_in_vnd),
    expenseVnd: Number(r.s.total_out_vnd),
    closingVnd: Number(r.s.closing_balance_vnd),
  }));
}

const FUND_BALANCES_SQL =
  "SELECT fund_id, code, name, fund_type::text AS type, balance_vnd FROM v_fund_balances ORDER BY CASE fund_type WHEN 'cash' THEN 0 ELSE 1 END, code";

function fundBalancesFrom(res: QueryResult): FundDto[] {
  return res.rows.map((r) => ({ id: r.fund_id, code: r.code, name: r.name, type: r.type, balanceVnd: Number(r.balance_vnd) }));
}

// ---------------------------------------------------------------------
// Kế hoạch thu (quỹ định kỳ, điện nước, quỹ tháng cũ…) kèm thống kê thu
// ---------------------------------------------------------------------
/**
 * Câu SQL đọc kế hoạch thu (chưa hủy) theo điều kiện `where` + thống kê. Người chỉ thấy khoản của mình (RLS contributions)
 * nhận số tổng hợp toàn nhà từ app.fn_contribution_plan_totals (không lộ tên ai). Tham số của `where` là $1…$n.
 */
function planSelectItem(c: FinanceCaller, where: string, params: unknown[] = []): SqlItem {
  const k = params.length + 1;
  return [
    `SELECT cp.id, cp.code, cp.name, cp.fee_type::text AS fee_type, to_char(cp.period_month, 'YYYY-MM') AS month,
              to_char(cp.period_end_month, 'YYYY-MM') AS end_month, cp.amount_vnd, cp.due_date::text AS due_date,
              cp.status::text AS status, cp.fund_id, cp.bill_total_vnd, cp.split_count, cp.note,
              count(ct.id) FILTER (WHERE ct.status NOT IN ('cancelled', 'waived'))::int AS total,
              count(ct.id) FILTER (WHERE ct.status = 'paid')::int AS paid,
              count(ct.id) FILTER (WHERE ct.status = 'partial')::int AS partial,
              count(ct.id) FILTER (WHERE ct.status = 'waived')::int AS waived,
              count(ct.id) FILTER (WHERE ct.status = 'unpaid')::int AS unpaid,
              COALESCE(sum(ct.amount_due_vnd - ct.discount_vnd) FILTER (WHERE ct.status <> 'cancelled'), 0)::bigint AS expected,
              COALESCE(sum(ct.paid_vnd) FILTER (WHERE ct.status <> 'cancelled'), 0)::bigint AS collected,
              CASE WHEN $${k}::boolean THEN NULL ELSE app.fn_contribution_plan_totals(cp.id) END AS s
         FROM contribution_plans cp
         LEFT JOIN contributions ct ON ct.plan_id = cp.id
        WHERE cp.status <> 'cancelled' AND cp.period_month IS NOT NULL AND (${where})
        GROUP BY cp.id
        ORDER BY cp.period_month, CASE cp.fee_type WHEN 'periodic_dues' THEN 0 WHEN 'monthly_dues' THEN 1 WHEN 'utility' THEN 2 ELSE 3 END, cp.code`,
    [...params, c.contribAll],
  ];
}

/** Câu SQL của listPlans() — kế hoạch có thời gian GIAO với khoảng [fromIso, toIso]; đọc kết quả bằng listPlansFrom(). */
export const listPlansItem = (c: FinanceCaller, fromIso: string, toIso: string): SqlItem =>
  planSelectItem(c, "cp.period_month <= $2::date AND COALESCE(cp.period_end_month, cp.period_month) >= date_trunc('month', $1::date)", [
    fromIso,
    toIso,
  ]);

/** Một kế hoạch theo mã (chưa hủy). */
export const planByIdItem = (c: FinanceCaller, planId: string): SqlItem => planSelectItem(c, "cp.id = $1::uuid", [planId]);

/** Kỳ quỹ định kỳ đang diễn ra + kế hoạch điện nước gần nhất (tháng hóa đơn ≤ tháng này). */
export const currentPlansItem = (c: FinanceCaller): SqlItem =>
  planSelectItem(
    c,
    `cp.id IN (SELECT x.id FROM contribution_plans x
                WHERE x.fee_type = 'periodic_dues' AND x.status <> 'cancelled' AND x.period_month <= app.local_today()
                  AND COALESCE(x.period_end_month, x.period_month) >= date_trunc('month', app.local_today())
                ORDER BY x.period_month DESC LIMIT 1)
     OR cp.id IN (SELECT x.id FROM contribution_plans x
                   WHERE x.fee_type = 'utility' AND x.status <> 'cancelled' AND x.period_month <= app.local_today()
                   ORDER BY x.period_month DESC LIMIT 1)`
  );

export function listPlansFrom(res: QueryResult, c: FinanceCaller): ContributionPlanDto[] {
  return res.rows.map((r) => {
    const all = c.contribAll;
    const feeType = r.fee_type as FeeType;
    const plan = { feeType, month: r.month as string, endMonth: (r.end_month as string | null) ?? null, name: r.name as string };
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      feeType,
      month: plan.month,
      endMonth: plan.endMonth,
      shortLabel: planShortLabel(plan),
      amountVnd: Number(r.amount_vnd),
      dueDate: r.due_date,
      status: r.status,
      fundId: r.fund_id,
      billTotalVnd: r.bill_total_vnd === null ? null : Number(r.bill_total_vnd),
      splitCount: r.split_count ?? null,
      note: r.note ?? null,
      stats: {
        totalCount: all ? r.total : null,
        paidCount: all ? r.paid : null,
        partialCount: all ? r.partial : null,
        waivedCount: all ? r.waived : null,
        unpaidCount: all ? r.unpaid : null,
        expectedVnd: all ? Number(r.expected) : Number(r.s?.expected_vnd ?? 0),
        collectedVnd: all ? Number(r.collected) : Number(r.s?.collected_vnd ?? 0),
      },
    };
  });
}

/** Kế hoạch thu có thời gian giao với khoảng [fromIso, toIso] kèm thống kê thu. */
export async function listPlans(tx: Tx, c: FinanceCaller, fromIso: string, toIso: string): Promise<ContributionPlanDto[]> {
  const [sql, params] = listPlansItem(c, fromIso, toIso);
  return listPlansFrom(await tx.query(sql, params as unknown[]), c);
}

/** GET /api/v1/finance/contribution-plans?from=YYYY-MM&to=YYYY-MM — mặc định 12 tháng gần nhất + 6 tháng tới (kỳ lập trước). */
export async function listPlansRange(tx: Tx, fromMonth?: string, toMonth?: string): Promise<ContributionPlanDto[]> {
  const c = await financeCaller(tx);
  if (!c.summary) throw forbidden("Bạn không có quyền xem tình hình quỹ.");
  const shift = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
  const cur = c.today.slice(0, 7);
  const from = fromMonth ?? shift(cur, -11);
  const to = toMonth ?? shift(cur, 6);
  if (from > to) throw badRequest("Tháng bắt đầu phải trước tháng kết thúc.");
  return listPlans(tx, c, `${from}-01`, monthEnd(`${to}-01`));
}

const SIGNATORIES_SQL = `SELECT pos.position_code, m.full_name, r.code AS room
         FROM v_member_current_position pos
         JOIN members m ON m.id = pos.member_id AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
        WHERE pos.position_code IN ('treasurer', 'house_head')`;

function signatoriesFrom(res: QueryResult): { treasurer: PersonRef | null; houseHead: PersonRef | null } {
  const rows = res.rows;
  const pick = (code: string) => {
    const r = rows.find((x) => x.position_code === code);
    return r ? { name: r.full_name as string, room: (r.room as string) ?? null } : null;
  };
  return { treasurer: pick("treasurer"), houseHead: pick("house_head") };
}

// ---------------------------------------------------------------------
// Tổng quan một kỳ (tháng / khoảng ngày / toàn bộ)
// ---------------------------------------------------------------------
export async function getOverview(tx: Tx, q: { from?: string; to?: string; all?: boolean }): Promise<FinanceOverviewDto> {
  // Pha 1 — gộp quyền người gọi + các truy vấn không phụ thuộc kỳ báo cáo (chỉ đọc, kết quả bỏ đi nếu không có quyền):
  // 1 vòng mạng thay vì 5–6. Các truy vấn fn_finance_summary (báo lỗi nếu thiếu quyền) để sang pha 2.
  const p1: SqlItem[] = [
    [FINANCE_CALLER_SQL],
    ["SELECT to_char(period_month, 'YYYY-MM') AS month, status::text AS status FROM financial_periods ORDER BY period_month"],
    ["SELECT count(*)::int AS n FROM expense_vouchers WHERE status = 'pending_approval'"],
    ["SELECT key, value #>> '{}' AS v FROM settings WHERE key IN ('org.house_name', 'org.order_name')"],
    [SIGNATORIES_SQL],
  ];
  if (q.all) p1.push(["SELECT LEAST((SELECT min(period_month) FROM financial_periods), (SELECT min(period_month) FROM contribution_plans))::text AS d"]);
  const [callerR, periodsR, pendingR, orgR, signatoriesR, firstR] = await batch(tx, p1);
  const c = financeCallerFrom(callerR);
  if (!c.summary) throw forbidden("Bạn không có quyền xem tình hình quỹ.");
  let to = q.to ?? monthEnd(c.today);
  let from = q.from ?? monthStart(to);
  if (q.all) {
    const first = (firstR.rows[0] as { d: string | null }).d;
    to = monthEnd(c.today);
    from = first && first < to ? first : monthStart(to);
    // fn_finance_summary giới hạn 366 ngày
    const minFrom = new Date(Date.parse(`${to}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
    if (from < minFrom) from = minFrom;
  }
  if (from > to) throw badRequest("Ngày bắt đầu phải trước ngày kết thúc.");

  // Pha 2 — gộp các số liệu theo kỳ (đúng thứ tự cũ): 1 vòng mạng thay vì 4
  const [sR, monthsR, fundsR, plansR] = await batch(tx, [
    summaryItem(from, to),
    lastMonthsItem(to),
    c.ledger ? [FUND_BALANCES_SQL] : summaryItem(monthStart(c.today), c.today),
    listPlansItem(c, from, to),
  ]);
  const s = summaryFrom(sR);
  const months = lastMonthsFrom(monthsR);
  const funds = c.ledger ? fundBalancesFrom(fundsR) : null;
  const fundBalanceVnd = funds ? funds.reduce((a, f) => a + f.balanceVnd, 0) : Number(summaryFrom(fundsR).closing_balance_vnd);
  const periods = periodsR.rows as { month: string; status: PeriodStatus }[];
  const plans = listPlansFrom(plansR, c);
  const pendingApprovals = (pendingR.rows[0] as { n: number }).n;
  const org = orgR.rows as { key: string; v: string }[];

  return {
    from,
    to,
    today: c.today,
    openingVnd: Number(s.opening_balance_vnd),
    incomeVnd: Number(s.total_in_vnd),
    expenseVnd: Number(s.total_out_vnd),
    closingVnd: Number(s.closing_balance_vnd),
    duesExpectedVnd: Number(s.dues_expected_vnd),
    duesCollectedVnd: Number(s.dues_collected_vnd),
    collectionRatePct: s.collection_rate_pct === null ? null : Number(s.collection_rate_pct),
    expenseByCategory: (s.expense_by_category ?? []).map((x) => ({
      code: x.code,
      name: x.name,
      color: x.color,
      amountVnd: Number(x.total_vnd),
      count: Number(x.count),
    })),
    fundBalanceVnd,
    funds,
    months,
    periods,
    plans,
    pendingApprovals,
    signatories: signatoriesFrom(signatoriesR),
    org: {
      houseName: org.find((o) => o.key === "org.house_name")?.v || null,
      orderName: org.find((o) => o.key === "org.order_name")?.v || null,
    },
    access: { ledger: c.ledger, contributionsAll: c.contribAll },
  };
}

// ---------------------------------------------------------------------
// GET /api/v1/finance/summary — hợp đồng cho trang Tổng quan
// ---------------------------------------------------------------------
const MINE_SQL = `SELECT COALESCE(sum(ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) FILTER (WHERE ct.status IN ('unpaid', 'partial')), 0)::bigint AS outstanding,
              count(*) FILTER (WHERE ct.status IN ('unpaid', 'partial'))::int AS items,
              count(*) FILTER (WHERE ct.status IN ('unpaid', 'partial') AND ct.due_date < app.local_today())::int AS overdue
         FROM contributions ct
         JOIN contribution_plans cp ON cp.id = ct.plan_id AND cp.status <> 'cancelled'
        WHERE ct.member_id = app.current_member_id()`;

function planSummaryOf(p: ContributionPlanDto | undefined): PlanSummaryDto | null {
  if (!p) return null;
  return {
    planId: p.id,
    periodLabel:
      p.feeType === "utility" ? `điện nước T${Number(p.month.slice(5, 7))}/${p.month.slice(0, 4)}` : `quỹ kỳ ${monthRangeLabel(p.month, p.endMonth)}`,
    dueDate: p.dueDate,
    paidCount: p.stats.paidCount === null ? null : p.stats.paidCount + (p.stats.waivedCount ?? 0),
    totalCount: p.stats.totalCount === null ? null : p.stats.totalCount + (p.stats.waivedCount ?? 0),
    collectedVnd: p.stats.collectedVnd,
    expectedVnd: p.stats.expectedVnd,
  };
}

export async function getDashboardSummary(tx: Tx): Promise<FinanceSummaryDto> {
  // Pha 1 — gộp quyền người gọi + số phiếu chờ duyệt + khoản của chính mình: 1 vòng mạng
  const [callerR, pendingR, mineR] = await batch(tx, [
    [FINANCE_CALLER_SQL],
    ["SELECT count(*)::int AS n FROM expense_vouchers WHERE status = 'pending_approval'"],
    [MINE_SQL],
  ]);
  const c = financeCallerFrom(callerR);
  const pendingApprovals = (pendingR.rows[0] as { n: number }).n;
  const m = mineR.rows[0] as { outstanding: string; items: number; overdue: number };
  const mine = c.mid ? { outstandingVnd: Number(m.outstanding), items: m.items, overdue: m.overdue } : null;
  if (!c.summary) {
    return {
      fundBalanceVnd: null,
      funds: null,
      month: null,
      last6Months: null,
      expenseByCategory: null,
      contributions: null,
      utility: null,
      mine,
      pendingApprovals,
    };
  }
  const from = monthStart(c.today);
  const to = monthEnd(c.today);
  // Pha 2 — gộp các số liệu tháng này + kế hoạch thu đang diễn ra (cần quyền finance.summary.read): 1 vòng mạng
  const [sR, monthsR, fundsR, plansR] = await batch(tx, [
    summaryItem(from, to),
    lastMonthsItem(to),
    c.ledger ? [FUND_BALANCES_SQL] : summaryItem(from, c.today),
    currentPlansItem(c),
  ]);
  const s = summaryFrom(sR);
  const months = lastMonthsFrom(monthsR);
  const funds = c.ledger ? fundBalancesFrom(fundsR) : null;
  const fundBalanceVnd = funds ? funds.reduce((a, f) => a + f.balanceVnd, 0) : Number(summaryFrom(fundsR).closing_balance_vnd);
  const plans = listPlansFrom(plansR, c);
  return {
    fundBalanceVnd,
    funds: funds?.map((f) => ({ code: f.code, name: f.name, balanceVnd: f.balanceVnd })) ?? null,
    month: { label: monthLabel(monthKey(c.today)), incomeVnd: Number(s.total_in_vnd), expenseVnd: Number(s.total_out_vnd) },
    last6Months: months.map((x) => ({ label: x.label, incomeVnd: x.incomeVnd, expenseVnd: x.expenseVnd })),
    expenseByCategory: (s.expense_by_category ?? []).map((x) => ({ name: x.name, color: x.color, amountVnd: Number(x.total_vnd) })),
    contributions: planSummaryOf(plans.find((p) => p.feeType === "periodic_dues")),
    utility: planSummaryOf(plans.find((p) => p.feeType === "utility")),
    mine,
    pendingApprovals,
  };
}

// ---------------------------------------------------------------------
// Dữ liệu form: túi quỹ, danh mục chi, ngưỡng, cấu hình quỹ định kỳ / điện nước (đọc được tới đâu theo RLS)
// ---------------------------------------------------------------------
const CYCLES_SQL = `SELECT to_char(b.start_month, 'YYYY-MM') AS s, to_char(b.end_month, 'YYYY-MM') AS e,
              to_char(n.start_month, 'YYYY-MM') AS ns, to_char(n.end_month, 'YYYY-MM') AS ne
         FROM app.fn_dues_cycle_bounds(app.local_today()) b
        CROSS JOIN LATERAL app.fn_dues_cycle_bounds((b.end_month + interval '1 month')::date) n`;

export async function getOptions(tx: Tx): Promise<FinanceOptionsDto> {
  // Gộp quyền người gọi + danh mục chi + cấu hình tài chính + kỳ quỹ: 1 vòng mạng.
  // app.fn_fund_options() báo lỗi khi thiếu quyền nên chỉ chạy sau khi biết quyền (như cũ).
  const [callerR, categoriesR, settingsR, cyclesR] = await batch(tx, [
    [FINANCE_CALLER_SQL],
    ["SELECT id, code, name, color, icon_name AS icon FROM categories WHERE kind = 'expense' AND is_active AND deleted_at IS NULL ORDER BY sort_order, name"],
    ["SELECT key, value #>> '{}' AS v FROM settings WHERE key LIKE 'finance.%' AND value_type <> 'json'"],
    [CYCLES_SQL],
  ]);
  const c = financeCallerFrom(callerR);
  const funds = c.fundOptions
    ? (await tx.query("SELECT id, code, name, fund_type::text AS type FROM app.fn_fund_options()")).rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
      }))
    : [];
  funds.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "cash" ? -1 : 1));
  const categories = categoriesR.rows.map((r) => ({ id: r.id, code: r.code, name: r.name, color: r.color ?? "#6b7280", icon: r.icon ?? null }));
  const st = Object.fromEntries((settingsR.rows as { key: string; v: string }[]).map((r) => [r.key, r.v]));
  const num = (k: string) => (st[k] !== undefined && st[k] !== null && st[k] !== "" ? Number(st[k]) : null);
  const cy = cyclesR.rows[0] as { s: string; e: string; ns: string; ne: string };
  return {
    today: c.today,
    funds,
    categories,
    receiptRequiredMinVnd: num("finance.expense.receipt_required_min_vnd"),
    dualApprovalMinVnd: num("finance.expense.dual_approval_min_vnd"),
    treasurerSoloMaxVnd: num("finance.expense.treasurer_solo_approve_max_vnd"),
    dues: {
      cycleMonths: num("finance.dues_cycle_months") ?? 6,
      amountVnd: num("finance.dues_cycle_amount_vnd") ?? 0,
      startMonth: num("finance.dues_cycle_start_month") ?? 1,
      dueDay: num("finance.dues_cycle_due_day") ?? 15,
    },
    utilityDueDay: num("finance.utility_due_day") ?? 10,
    currentCycle: { startMonth: cy.s, endMonth: cy.e },
    nextCycle: { startMonth: cy.ns, endMonth: cy.ne },
  };
}

// ---------------------------------------------------------------------
// GET /api/v1/finance/members/:memberId/contributions?months=N — hợp đồng cho hồ sơ thành viên
// (các khoản có thời gian giao với N tháng gần nhất: kỳ quỹ đang diễn ra, điện nước, quỹ tháng cũ…)
// ---------------------------------------------------------------------
export async function getMemberContributions(tx: Tx, memberId: string, months: number): Promise<MemberContributionRow[]> {
  const validMonths = Number.isInteger(months) && months >= 1 && months <= 36;
  // Gộp quyền người gọi + lịch sử (chỉ đọc dưới RLS; bỏ kết quả nếu không có quyền): 1 vòng mạng thay vì 2
  const items: SqlItem[] = [[FINANCE_CALLER_SQL]];
  if (validMonths)
    items.push([
      `SELECT cp.id AS plan_id, cp.fee_type::text AS fee_type, cp.name, (ct.amount_due_vnd - ct.discount_vnd)::bigint AS due,
              ct.paid_vnd, ct.status::text AS status, ct.due_date::text AS due_date
         FROM contributions ct
         JOIN contribution_plans cp ON cp.id = ct.plan_id AND cp.status <> 'cancelled'
        WHERE ct.member_id = $1 AND ct.status <> 'cancelled' AND cp.period_month IS NOT NULL
          AND cp.period_month <= date_trunc('month', app.local_today())
          AND COALESCE(cp.period_end_month, cp.period_month) >= (date_trunc('month', app.local_today()) - make_interval(months => $2 - 1))::date
        ORDER BY cp.period_month DESC, CASE cp.fee_type WHEN 'periodic_dues' THEN 0 WHEN 'monthly_dues' THEN 1 ELSE 2 END`,
      [memberId, months],
    ]);
  const [callerR, rowsR] = await batch(tx, items);
  const c = financeCallerFrom(callerR);
  if (memberId !== c.mid && !c.contribAll) throw forbidden("Bạn chỉ xem được lịch sử đóng quỹ của chính mình.");
  if (!validMonths) throw new ApiError(400, "VALIDATION_FAILED", "Số tháng phải từ 1 đến 36.");
  return rowsR.rows.map((r) => ({
    planId: r.plan_id,
    feeType: r.fee_type as FeeType,
    periodLabel: r.name,
    amountDueVnd: Number(r.due),
    amountPaidVnd: Number(r.paid_vnd),
    dueDate: r.due_date,
    status: r.status as MemberContributionRow["status"],
  }));
}

// ---------------------------------------------------------------------
// Tài khoản nhận quỹ của nhà (settings finance.receiving_account — công khai; Thủ quỹ / Trưởng nhà sửa)
// ---------------------------------------------------------------------
const RECEIVING_KEY = "finance.receiving_account";

function accountFrom(v: unknown): BankAccountDto | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const acc: BankAccountDto = {
    bankBin: s("bankBin") || null,
    bankName: s("bankName"),
    accountNo: s("accountNo"),
    accountName: s("accountName"),
    qrFileId: s("qrFileId") || null,
  };
  return acc.accountNo || acc.qrFileId ? acc : null;
}

export async function getReceivingAccount(tx: Tx): Promise<ReceivingAccountDto> {
  const r = (
    await tx.query(
      `SELECT s.value AS v, s.updated_at, s.updated_by IS NOT NULL AS edited, app.has_permission(s.write_permission) AS can_edit,
              (SELECT m.full_name FROM members m WHERE m.user_id = s.updated_by LIMIT 1) AS by_name,
              (SELECT x.value #>> '{}' FROM settings x WHERE x.key = 'finance.dues_bank_account') AS legacy
         FROM settings s WHERE s.key = $1`,
      [RECEIVING_KEY]
    )
  ).rows[0];
  if (!r) return { account: null, legacyText: null, canEdit: false, updatedAt: null, updatedByName: null };
  return {
    account: accountFrom(r.v),
    legacyText: (r.legacy as string | null)?.trim() || null,
    canEdit: !!r.can_edit,
    updatedAt: r.edited ? new Date(r.updated_at).toISOString() : null,
    updatedByName: r.edited ? (r.by_name ?? null) : null,
  };
}

export async function saveReceivingAccount(
  tx: Tx,
  b: { bankBin?: string | null; bankName: string; accountNo: string; accountName: string; qrFileId?: string | null }
): Promise<ReceivingAccountDto> {
  // Gộp kiểm quyền + kiểm ảnh QR (RLS storage_files: người tải lên hoặc tệp đã gắn): 1 vòng mạng
  const [permR, fileR] = await batch(tx, [
    ["SELECT app.has_permission(write_permission) AS ok FROM settings WHERE key = $1", [RECEIVING_KEY]],
    ["SELECT detected_mime FROM storage_files WHERE id = $1::uuid AND status = 'ready'", [b.qrFileId ?? null]],
  ]);
  if (!permR.rows[0]?.ok) throw forbidden("Chỉ Thủ quỹ hoặc Trưởng nhà được đổi tài khoản nhận quỹ.");
  if (b.qrFileId && !fileR.rows[0]) throw new ApiError(422, "BAD_FILE", "Không tìm thấy ảnh mã QR vừa tải lên — vui lòng tải lại.");
  const value = {
    bankBin: b.bankBin || "",
    bankName: b.bankName,
    accountNo: b.accountNo.replace(/\s/g, ""),
    accountName: b.accountName,
    qrFileId: b.qrFileId ?? null,
  };
  const r = await tx.query("UPDATE settings SET value = $2::jsonb, updated_by = app.current_user_id() WHERE key = $1", [RECEIVING_KEY, JSON.stringify(value)]);
  if (!r.rowCount) throw forbidden("Chỉ Thủ quỹ hoặc Trưởng nhà được đổi tài khoản nhận quỹ.");
  return getReceivingAccount(tx);
}
