import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden } from "../errors";
import type {
  ContributionPlanDto,
  FinanceMonthDto,
  FinanceOptionsDto,
  FinanceOverviewDto,
  FinanceSummaryDto,
  FundDto,
  MemberContributionRow,
  PeriodStatus,
  PersonRef,
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
  /** Vai trò duyệt chi đang hiệu lực của người gọi (house_head / treasurer / vice_head) */
  approverRoles: string[];
  /** Hạn mức Thủ quỹ tự duyệt một chữ ký (null nếu không đọc được cấu hình) */
  treasurerSoloMaxVnd: number | null;
}

export async function financeCaller(tx: Tx): Promise<FinanceCaller> {
  const r = (
    await tx.query(
      `SELECT app.current_user_id() AS uid, app.current_member_id() AS mid, app.local_today()::text AS today,
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
              ARRAY(SELECT r FROM unnest(ARRAY['house_head', 'treasurer', 'vice_head']) r WHERE app.has_role(r)) AS approver_roles,
              (SELECT (value #>> '{}')::bigint FROM settings WHERE key = 'finance.expense.treasurer_solo_approve_max_vnd') AS solo_max`
    )
  ).rows[0];
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

async function summaryOf(tx: Tx, from: string, to: string): Promise<SummaryJson> {
  return (await tx.query<{ s: SummaryJson }>("SELECT app.fn_finance_summary($1::date, $2::date) AS s", [from, to])).rows[0].s;
}

/** 6 tháng kết thúc ở tháng chứa `endIso` — thu/chi thuần + số dư cuối tháng (fn_finance_summary, đọc trực tiếp sổ cái). */
async function lastMonths(tx: Tx, endIso: string, n = 6): Promise<FinanceMonthDto[]> {
  const rows = (
    await tx.query<{ m: string; s: SummaryJson }>(
      `SELECT to_char(m, 'YYYY-MM') AS m,
              app.fn_finance_summary(m::date, (m + interval '1 month' - interval '1 day')::date) AS s
         FROM generate_series(date_trunc('month', $1::date) - make_interval(months => $2 - 1), date_trunc('month', $1::date), interval '1 month') m
        ORDER BY m`,
      [endIso, n]
    )
  ).rows;
  return rows.map((r) => ({
    month: r.m,
    label: shortLabel(r.m),
    incomeVnd: Number(r.s.total_in_vnd),
    expenseVnd: Number(r.s.total_out_vnd),
    closingVnd: Number(r.s.closing_balance_vnd),
  }));
}

async function fundBalances(tx: Tx): Promise<FundDto[]> {
  return (
    await tx.query(
      "SELECT fund_id, code, name, fund_type::text AS type, balance_vnd FROM v_fund_balances ORDER BY CASE fund_type WHEN 'cash' THEN 0 ELSE 1 END, code"
    )
  ).rows.map((r) => ({ id: r.fund_id, code: r.code, name: r.name, type: r.type, balanceVnd: Number(r.balance_vnd) }));
}

/** Kế hoạch thu quỹ tháng trong khoảng tháng [fromIso, toIso] kèm thống kê thu. */
export async function listPlans(tx: Tx, c: FinanceCaller, fromIso: string, toIso: string): Promise<ContributionPlanDto[]> {
  const rows = (
    await tx.query(
      `SELECT cp.id, cp.code, cp.name, to_char(cp.period_month, 'YYYY-MM') AS month, cp.amount_vnd, cp.due_date::text AS due_date,
              cp.status::text AS status, cp.fund_id,
              count(ct.id) FILTER (WHERE ct.status NOT IN ('cancelled', 'waived'))::int AS total,
              count(ct.id) FILTER (WHERE ct.status = 'paid')::int AS paid,
              count(ct.id) FILTER (WHERE ct.status = 'partial')::int AS partial,
              count(ct.id) FILTER (WHERE ct.status = 'waived')::int AS waived,
              count(ct.id) FILTER (WHERE ct.status = 'unpaid')::int AS unpaid,
              COALESCE(sum(ct.amount_due_vnd - ct.discount_vnd) FILTER (WHERE ct.status <> 'cancelled'), 0)::bigint AS expected,
              COALESCE(sum(ct.paid_vnd) FILTER (WHERE ct.status <> 'cancelled'), 0)::bigint AS collected,
              CASE WHEN $3 THEN NULL
                   ELSE app.fn_finance_summary(cp.period_month, (cp.period_month + interval '1 month' - interval '1 day')::date) END AS s
         FROM contribution_plans cp
         LEFT JOIN contributions ct ON ct.plan_id = cp.id
        WHERE cp.fee_type = 'monthly_dues' AND cp.status <> 'cancelled'
          AND cp.period_month BETWEEN date_trunc('month', $1::date) AND $2::date
        GROUP BY cp.id
        ORDER BY cp.period_month`,
      [fromIso, toIso, c.contribAll]
    )
  ).rows;
  return rows.map((r) => {
    const all = c.contribAll;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      month: r.month,
      amountVnd: Number(r.amount_vnd),
      dueDate: r.due_date,
      status: r.status,
      fundId: r.fund_id,
      stats: {
        totalCount: all ? r.total : null,
        paidCount: all ? r.paid : null,
        partialCount: all ? r.partial : null,
        waivedCount: all ? r.waived : null,
        unpaidCount: all ? r.unpaid : null,
        // Người chỉ thấy khoản của mình: số tổng hợp toàn nhà lấy từ fn_finance_summary (không lộ tên)
        expectedVnd: all ? Number(r.expected) : Number(r.s?.dues_expected_vnd ?? 0),
        collectedVnd: all ? Number(r.collected) : Number(r.s?.dues_collected_vnd ?? 0),
      },
    };
  });
}

async function signatories(tx: Tx): Promise<{ treasurer: PersonRef | null; houseHead: PersonRef | null }> {
  const rows = (
    await tx.query(
      `SELECT pos.position_code, m.full_name, r.code AS room
         FROM v_member_current_position pos
         JOIN members m ON m.id = pos.member_id AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
        WHERE pos.position_code IN ('treasurer', 'house_head')`
    )
  ).rows;
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
  const c = await financeCaller(tx);
  if (!c.summary) throw forbidden("Bạn không có quyền xem tình hình quỹ.");
  let to = q.to ?? monthEnd(c.today);
  let from = q.from ?? monthStart(to);
  if (q.all) {
    const first = (
      await tx.query<{ d: string | null }>(
        "SELECT LEAST((SELECT min(period_month) FROM financial_periods), (SELECT min(period_month) FROM contribution_plans))::text AS d"
      )
    ).rows[0].d;
    to = monthEnd(c.today);
    from = first && first < to ? first : monthStart(to);
    // fn_finance_summary giới hạn 366 ngày
    const minFrom = new Date(Date.parse(`${to}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
    if (from < minFrom) from = minFrom;
  }
  if (from > to) throw badRequest("Ngày bắt đầu phải trước ngày kết thúc.");

  const s = await summaryOf(tx, from, to);
  const months = await lastMonths(tx, to);
  const funds = c.ledger ? await fundBalances(tx) : null;
  const fundBalanceVnd = funds
    ? funds.reduce((a, f) => a + f.balanceVnd, 0)
    : Number((await summaryOf(tx, monthStart(c.today), c.today)).closing_balance_vnd);
  const periods = (
    await tx.query<{ month: string; status: PeriodStatus }>(
      "SELECT to_char(period_month, 'YYYY-MM') AS month, status::text AS status FROM financial_periods ORDER BY period_month"
    )
  ).rows;
  const plans = await listPlans(tx, c, from, to);
  const pendingApprovals = (
    await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM expense_vouchers WHERE status = 'pending_approval'")
  ).rows[0].n;
  const org = (
    await tx.query<{ key: string; v: string }>("SELECT key, value #>> '{}' AS v FROM settings WHERE key IN ('org.house_name', 'org.order_name')")
  ).rows;

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
    signatories: await signatories(tx),
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
export async function getDashboardSummary(tx: Tx): Promise<FinanceSummaryDto> {
  const c = await financeCaller(tx);
  const pendingApprovals = (
    await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM expense_vouchers WHERE status = 'pending_approval'")
  ).rows[0].n;
  if (!c.summary) {
    return { fundBalanceVnd: null, funds: null, month: null, last6Months: null, expenseByCategory: null, contributions: null, pendingApprovals };
  }
  const from = monthStart(c.today);
  const to = monthEnd(c.today);
  const s = await summaryOf(tx, from, to);
  const months = await lastMonths(tx, to);
  const funds = c.ledger ? await fundBalances(tx) : null;
  const fundBalanceVnd = funds ? funds.reduce((a, f) => a + f.balanceVnd, 0) : Number((await summaryOf(tx, from, c.today)).closing_balance_vnd);
  const plan = (await listPlans(tx, c, from, to))[0];
  return {
    fundBalanceVnd,
    funds: funds?.map((f) => ({ code: f.code, name: f.name, balanceVnd: f.balanceVnd })) ?? null,
    month: { label: monthLabel(monthKey(c.today)), incomeVnd: Number(s.total_in_vnd), expenseVnd: Number(s.total_out_vnd) },
    last6Months: months.map((m) => ({ label: m.label, incomeVnd: m.incomeVnd, expenseVnd: m.expenseVnd })),
    expenseByCategory: (s.expense_by_category ?? []).map((x) => ({ name: x.name, color: x.color, amountVnd: Number(x.total_vnd) })),
    contributions: {
      periodLabel: monthLabel(monthKey(c.today)),
      paidCount: plan ? plan.stats.paidCount : c.contribAll ? 0 : null,
      totalCount: plan ? plan.stats.totalCount : c.contribAll ? 0 : null,
      collectedVnd: plan ? plan.stats.collectedVnd : Number(s.dues_collected_vnd),
      expectedVnd: plan ? plan.stats.expectedVnd : Number(s.dues_expected_vnd),
    },
    pendingApprovals,
  };
}

// ---------------------------------------------------------------------
// Dữ liệu form: túi quỹ, danh mục chi, ngưỡng (đọc được tới đâu theo RLS)
// ---------------------------------------------------------------------
export async function getOptions(tx: Tx): Promise<FinanceOptionsDto> {
  const c = await financeCaller(tx);
  const funds = c.fundOptions
    ? (await tx.query("SELECT id, code, name, fund_type::text AS type FROM app.fn_fund_options()")).rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
      }))
    : [];
  funds.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "cash" ? -1 : 1));
  const categories = (
    await tx.query("SELECT id, code, name, color, icon_name AS icon FROM categories WHERE kind = 'expense' AND is_active AND deleted_at IS NULL ORDER BY sort_order, name")
  ).rows.map((r) => ({ id: r.id, code: r.code, name: r.name, color: r.color ?? "#6b7280", icon: r.icon ?? null }));
  const st = Object.fromEntries(
    (await tx.query<{ key: string; v: string }>("SELECT key, value #>> '{}' AS v FROM settings WHERE key LIKE 'finance.%'")).rows.map((r) => [r.key, r.v])
  );
  const num = (k: string) => (st[k] !== undefined && st[k] !== null && st[k] !== "" ? Number(st[k]) : null);
  return {
    today: c.today,
    funds,
    categories,
    receiptRequiredMinVnd: num("finance.expense.receipt_required_min_vnd"),
    dualApprovalMinVnd: num("finance.expense.dual_approval_min_vnd"),
    treasurerSoloMaxVnd: num("finance.expense.treasurer_solo_approve_max_vnd"),
    monthlyDuesVnd: num("finance.monthly_dues_vnd"),
    duesDueDay: num("finance.dues_due_day"),
  };
}

// ---------------------------------------------------------------------
// GET /api/v1/finance/members/:memberId/contributions?months=N — hợp đồng cho hồ sơ thành viên
// ---------------------------------------------------------------------
export async function getMemberContributions(tx: Tx, memberId: string, months: number): Promise<MemberContributionRow[]> {
  const c = await financeCaller(tx);
  if (memberId !== c.mid && !c.contribAll) throw forbidden("Bạn chỉ xem được lịch sử đóng quỹ của chính mình.");
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new ApiError(400, "VALIDATION_FAILED", "Số tháng phải từ 1 đến 36.");
  const rows = (
    await tx.query(
      `SELECT to_char(cp.period_month, 'FMMM') AS mm, to_char(cp.period_month, 'YYYY') AS yyyy,
              (ct.amount_due_vnd - ct.discount_vnd)::bigint AS due, ct.paid_vnd, ct.status::text AS status
         FROM contributions ct
         JOIN contribution_plans cp ON cp.id = ct.plan_id AND cp.fee_type = 'monthly_dues' AND cp.status <> 'cancelled'
        WHERE ct.member_id = $1 AND ct.status <> 'cancelled' AND cp.period_month <= date_trunc('month', app.local_today())
        ORDER BY cp.period_month DESC
        LIMIT $2`,
      [memberId, months]
    )
  ).rows;
  return rows.map((r) => ({
    periodLabel: `Tháng ${r.mm} / ${r.yyyy}`,
    amountDueVnd: Number(r.due),
    amountPaidVnd: Number(r.paid_vnd),
    status: r.status as MemberContributionRow["status"],
  }));
}
