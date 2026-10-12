import "server-only";
import type { QueryResult } from "pg";
import { batch, type Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import type {
  ClosePeriodResultDto,
  LedgerChainDto,
  PeriodDto,
  PeriodFundDto,
  PeriodReconciliationDto,
  PeriodsDto,
  PeriodStatus,
} from "@/lib/types/finance";

// =====================================================================
// CHỐT SỔ THÁNG HAI NGƯỜI + ĐỐI SOÁT (thiết kế gốc 35_fn_finance_ledger.sql + db/app/1045):
//   • Thủ quỹ (finance.period.close) chốt: app.fn_close_period_checked → app.fn_close_period — chụp số dư từng túi quỹ, kỳ sang
//     "chờ xác nhận" (đóng băng ghi sổ của tháng đó VÀ mọi tháng trước — trigger tg_ledger_entry_no_backdate).
//   • Người thứ hai (finance.period.confirm — Trưởng nhà, Admin) xác nhận: app.fn_confirm_period_close (người chốt KHÔNG tự xác nhận).
//   • Mở lại (finance.period.reopen) bắt buộc lý do ≥ 10 ký tự: app.fn_reopen_period (chỉ kỳ mới nhất trước).
//   • Đối soát (finance.reconcile): app.fn_reconcile_period — số dư thực tế (sao kê / kiểm đếm) ↔ số dư sổ quỹ cuối tháng.
// Đọc dưới RLS (financial_periods: finance.summary.read; period_fund_balances / ledger_entries: finance.ledger.read).
// =====================================================================

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (m: string) => MONTH_RE.test(m);
const mmYYYY = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const ts = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const n = (v: unknown) => Number(v ?? 0);

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PERM_SQL = `SELECT app.current_user_id() AS uid, app.local_today()::text AS today,
        app.has_permission('finance.ledger.read') AS ledger,
        app.has_permission('finance.expense.read_all') AS read_all,
        app.has_permission('finance.period.close') AS close,
        app.has_permission('finance.period.confirm') AS confirm,
        app.has_permission('finance.period.reopen') AS reopen,
        app.has_permission('finance.reconcile') AS reconcile,
        COALESCE(app.setting_bool('finance.period.close_requires_reconciliation'), false) AS require_recon`;

interface Perm {
  uid: string;
  today: string;
  ledger: boolean;
  readAll: boolean;
  close: boolean;
  confirm: boolean;
  reopen: boolean;
  reconcile: boolean;
  requireRecon: boolean;
}

function permFrom(r: QueryResult): Perm {
  const x = r.rows[0] as Row;
  return {
    uid: x.uid,
    today: x.today,
    ledger: !!x.ledger,
    readAll: !!x.read_all,
    close: !!x.close,
    confirm: !!x.confirm,
    reopen: !!x.reopen,
    reconcile: !!x.reconcile,
    requireRecon: !!x.require_recon,
  };
}

const PERIODS_SQL = `SELECT fp.id, to_char(fp.period_month, 'YYYY-MM') AS month,
        (fp.period_month + interval '1 month' - interval '1 day')::date::text AS end_date,
        fp.status::text AS status, fp.closed_by, fp.closed_at, fp.closing_note, fp.confirmed_by, fp.confirmed_at,
        fp.reopen_count, fp.reopened_at, fp.reopen_reason,
        (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = fp.closed_by LIMIT 1) AS closed_name,
        (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = fp.confirmed_by LIMIT 1) AS confirmed_name,
        (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = fp.reopened_by LIMIT 1) AS reopened_name,
        (SELECT count(*)::int FROM expense_vouchers ev
          WHERE ev.status IN ('pending_approval', 'approved')
            AND ev.expense_date BETWEEN fp.period_month AND (fp.period_month + interval '1 month' - interval '1 day')::date) AS unsettled
   FROM financial_periods fp
  ORDER BY fp.period_month DESC`;

const ACTIVE_FUNDS_SQL = `SELECT id, code, name, fund_type::text AS type FROM funds
  WHERE deleted_at IS NULL AND is_active ORDER BY CASE fund_type WHEN 'cash' THEN 0 WHEN 'bank' THEN 1 ELSE 2 END, code`;

const SNAPSHOTS_SQL = `SELECT pfb.period_id, pfb.fund_id, f.code, f.name, f.fund_type::text AS type, pfb.opening_balance_vnd, pfb.total_in_vnd,
        pfb.total_out_vnd, pfb.closing_balance_vnd, pfb.entry_count, pfb.head_hash
   FROM period_fund_balances pfb LEFT JOIN funds f ON f.id = pfb.fund_id`;

/** Số liệu trực tiếp của các kỳ ĐANG MỞ cho từng túi quỹ đang dùng (RLS: chỉ người xem sổ quỹ). */
const LIVE_SQL = `SELECT fp.id AS period_id, f.id AS fund_id,
        app.fn_fund_balance_at(f.id, fp.period_month - 1) AS opening,
        COALESCE(sum(le.amount_vnd) FILTER (WHERE le.direction = 'in'), 0)::bigint AS total_in,
        COALESCE(sum(le.amount_vnd) FILTER (WHERE le.direction = 'out'), 0)::bigint AS total_out,
        count(le.id)::int AS cnt
   FROM financial_periods fp
  CROSS JOIN funds f
   LEFT JOIN ledger_entries le ON le.fund_id = f.id AND le.period_id = fp.id
  WHERE fp.status = 'open' AND f.deleted_at IS NULL AND f.is_active
  GROUP BY fp.id, fp.period_month, f.id`;

const RECON_SQL = `SELECT pr.period_id, pr.fund_id, pr.statement_balance_vnd, pr.ledger_balance_vnd, pr.difference_vnd, pr.explanation, pr.reconciled_at,
        (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = pr.reconciled_by LIMIT 1) AS by_name,
        app.fn_fund_balance_at(pr.fund_id, (fp.period_month + interval '1 month' - interval '1 day')::date) AS current_ledger
   FROM period_reconciliations pr JOIN financial_periods fp ON fp.id = pr.period_id`;

const CHAIN_SQL = `SELECT c.fund_id, c.fund_code, c.entries_checked, c.first_broken_seq, c.head_matches, f.name
   FROM app.fn_verify_ledger_chain() c LEFT JOIN funds f ON f.id = c.fund_id`;

/** Túi quỹ buộc phải đối soát của từng kỳ đang mở (app.fn_period_unreconciled — rỗng khi cấu hình tắt). */
const UNRECONCILED_SQL = `SELECT fp.id AS period_id, u.fund_id, u.fund_name, u.missing, u.ledger_vnd, u.recorded_vnd
   FROM financial_periods fp CROSS JOIN LATERAL app.fn_period_unreconciled(fp.id) u
  WHERE fp.status = 'open'`;

/** Túi quỹ "phải đối soát" theo cấu hình: quỹ ngân hàng + quỹ chung duy nhất (gộp tiền mặt + ngân hàng) — cùng luật app.fn_period_unreconciled. */
function requiredFundIds(funds: Row[], requireRecon: boolean): Set<string> {
  if (!requireRecon) return new Set();
  const nonEvent = funds.filter((f) => f.type !== "event");
  return new Set(funds.filter((f) => f.type === "bank" || (nonEvent.length === 1 && f.type !== "event")).map((f) => f.id as string));
}

export async function listPeriods(tx: Tx): Promise<PeriodsDto> {
  const [permR, periodsR, fundsR, snapR, liveR, reconR, chainR, unrecR] = await batch(tx, [
    [PERM_SQL],
    [PERIODS_SQL],
    [ACTIVE_FUNDS_SQL],
    [SNAPSHOTS_SQL],
    [LIVE_SQL],
    [RECON_SQL],
    [CHAIN_SQL],
    [UNRECONCILED_SQL],
  ]);
  const p = permFrom(permR);
  if (!p.ledger && !p.close && !p.confirm && !p.reopen && !p.reconcile) throw forbidden("Bạn không có quyền xem sổ quỹ / chốt sổ.");
  const funds = fundsR.rows as Row[];
  const required = requiredFundIds(funds, p.requireRecon);
  const today = p.today;

  const snaps = new Map<string, Row[]>();
  for (const s of snapR.rows as Row[]) snaps.set(s.period_id, [...(snaps.get(s.period_id) ?? []), s]);
  const live = new Map<string, Row[]>();
  for (const l of liveR.rows as Row[]) live.set(l.period_id, [...(live.get(l.period_id) ?? []), l]);
  const recon = new Map<string, Row>();
  for (const r of reconR.rows as Row[]) recon.set(`${r.period_id}:${r.fund_id}`, r);
  const unrec = new Map<string, Row[]>();
  for (const u of unrecR.rows as Row[]) unrec.set(u.period_id, [...(unrec.get(u.period_id) ?? []), u]);

  const periods = periodsR.rows as Row[];
  // Kỳ cũ nhất CHƯA chốt xong (để báo "phải chốt tháng … trước")
  const firstNotClosed = [...periods].reverse().find((x) => x.status !== "closed") as Row | undefined;

  const reconOf = (periodId: string, fundId: string): PeriodReconciliationDto | null => {
    const r = recon.get(`${periodId}:${fundId}`);
    if (!r) return null;
    return {
      statementVnd: n(r.statement_balance_vnd),
      ledgerVnd: n(r.ledger_balance_vnd),
      differenceVnd: n(r.difference_vnd),
      explanation: r.explanation ?? null,
      byName: r.by_name ?? null,
      at: ts(r.reconciled_at)!,
      stale: n(r.ledger_balance_vnd) !== n(r.current_ledger),
    };
  };

  const out: PeriodDto[] = periods.map((x, i) => {
    const status = x.status as PeriodStatus;
    const monthEnded = (x.end_date as string) <= today;
    let fundsDto: PeriodFundDto[] | null = null;
    if (p.ledger) {
      if (status !== "open" && snaps.has(x.id)) {
        fundsDto = snaps.get(x.id)!.map((s) => ({
          fundId: s.fund_id,
          code: s.code ?? "—",
          name: s.name ?? "Túi quỹ đã ngưng",
          type: s.type ?? "cash",
          openingVnd: n(s.opening_balance_vnd),
          inVnd: n(s.total_in_vnd),
          outVnd: n(s.total_out_vnd),
          closingVnd: n(s.closing_balance_vnd),
          entryCount: n(s.entry_count),
          snapshot: true,
          headHash: s.head_hash ?? null,
          reconciliation: reconOf(x.id, s.fund_id),
          requiresReconciliation: required.has(s.fund_id),
        }));
      } else {
        const rows = live.get(x.id) ?? [];
        fundsDto = funds.map((f) => {
          const l = rows.find((r) => r.fund_id === f.id);
          const opening = n(l?.opening);
          const tin = n(l?.total_in);
          const tout = n(l?.total_out);
          return {
            fundId: f.id,
            code: f.code,
            name: f.name,
            type: f.type,
            openingVnd: opening,
            inVnd: tin,
            outVnd: tout,
            closingVnd: opening + tin - tout,
            entryCount: n(l?.cnt),
            snapshot: false,
            headHash: null,
            reconciliation: reconOf(x.id, f.id),
            requiresReconciliation: required.has(f.id),
          };
        });
      }
    }
    const totals = fundsDto
      ? fundsDto.reduce(
          (a, f) => ({
            openingVnd: a.openingVnd + f.openingVnd,
            inVnd: a.inVnd + f.inVnd,
            outVnd: a.outVnd + f.outVnd,
            closingVnd: a.closingVnd + f.closingVnd,
            entryCount: a.entryCount + f.entryCount,
          }),
          { openingVnd: 0, inVnd: 0, outVnd: 0, closingVnd: 0, entryCount: 0 }
        )
      : null;

    // Vì sao chưa chốt được (chỉ kỳ đang mở) — CSDL vẫn kiểm lại khi chốt
    const blockers: string[] = [];
    if (status === "open") {
      if (!monthEnded) blockers.push(`Chưa hết tháng — chốt được từ ngày ${(x.end_date as string).split("-").reverse().join("/")}.`);
      if (firstNotClosed && firstNotClosed.month < x.month)
        blockers.push(
          firstNotClosed.status === "pending_confirmation"
            ? `Tháng ${mmYYYY(firstNotClosed.month)} đang chờ xác nhận chốt sổ — cần xác nhận trước.`
            : `Phải chốt tháng ${mmYYYY(firstNotClosed.month)} trước.`
        );
      for (const u of unrec.get(x.id) ?? [])
        blockers.push(u.missing ? `Chưa đối soát số dư cuối tháng của “${u.fund_name}”.` : `Biên bản đối soát của “${u.fund_name}” đã cũ (sổ quỹ đã thay đổi) — đối soát lại.`);
    }
    // Kỳ mới hơn đã chốt / chờ xác nhận ⇒ chưa mở lại được kỳ này (BR-FIN-11)
    const newerLocked = periods.slice(0, i).some((y) => y.status !== "open");
    const closedByMe = !!x.closed_by && x.closed_by === p.uid;
    return {
      id: x.id,
      month: x.month,
      status,
      monthEnded,
      closed: x.closed_at ? { name: x.closed_name ?? null, at: ts(x.closed_at)!, note: x.closing_note ?? null, byMe: closedByMe } : null,
      confirmed: x.confirmed_at ? { name: x.confirmed_name ?? null, at: ts(x.confirmed_at)! } : null,
      reopenCount: n(x.reopen_count),
      reopened: x.reopened_at ? { name: x.reopened_name ?? null, at: ts(x.reopened_at)!, reason: x.reopen_reason ?? null } : null,
      unsettledVouchers: p.readAll ? n(x.unsettled) : null,
      funds: fundsDto,
      totals,
      can: {
        close: p.close && status === "open" && blockers.length === 0,
        confirm: p.confirm && status === "pending_confirmation" && !closedByMe,
        reopen: p.reopen && status !== "open" && !newerLocked,
        reconcile: p.reconcile && p.ledger && status === "open" && monthEnded,
      },
      blockers,
    };
  });

  const chain: LedgerChainDto[] | null = p.ledger
    ? (chainR.rows as Row[]).map((c) => ({
        fundId: c.fund_id,
        code: c.fund_code,
        name: c.name ?? null,
        entries: n(c.entries_checked),
        ok: c.first_broken_seq === null && !!c.head_matches,
        firstBrokenSeq: c.first_broken_seq === null ? null : n(c.first_broken_seq),
      }))
    : null;

  return {
    today,
    periods: out,
    requireReconciliation: p.requireRecon,
    access: { ledger: p.ledger, close: p.close, confirm: p.confirm, reopen: p.reopen, reconcile: p.reconcile },
    chain,
  };
}

/** Kỳ theo tháng 'YYYY-MM' (RLS financial_periods: finance.summary.read). */
async function periodOf(tx: Tx, month: string): Promise<{ id: string; status: PeriodStatus; closedBy: string | null; confirmedBy: string | null }> {
  if (!isMonth(month)) throw badRequest("Tháng phải có dạng YYYY-MM.");
  const r = (
    await tx.query<Row>("SELECT id, status::text AS status, closed_by, confirmed_by FROM financial_periods WHERE period_month = $1::date", [`${month}-01`])
  ).rows[0];
  if (!r) throw notFound(`Tháng ${mmYYYY(month)} chưa có phát sinh nào trong sổ quỹ — không cần chốt hay đối soát.`);
  return { id: r.id, status: r.status, closedBy: r.closed_by ?? null, confirmedBy: r.confirmed_by ?? null };
}

/** Bước 1 — Thủ quỹ chốt sổ tháng (cần đã hết tháng, kỳ trước đã chốt, các quỹ bắt buộc đã đối soát). */
export async function closePeriod(tx: Tx, month: string, note: string | null | undefined): Promise<ClosePeriodResultDto> {
  const per = await periodOf(tx, month);
  if (per.status !== "open") throw new ApiError(422, "PERIOD_NOT_OPEN", `Tháng ${mmYYYY(month)} đã chốt hoặc đang chờ xác nhận.`);
  const r = (await tx.query<{ r: Row }>("SELECT app.fn_close_period_checked($1, $2) AS r", [per.id, note ?? null])).rows[0].r;
  return {
    month,
    unsettledVouchers: n(r.unsettled_vouchers),
    funds: ((r.funds ?? []) as Row[]).map((f) => ({
      fund: String(f.fund),
      openingVnd: n(f.opening),
      inVnd: n(f.in),
      outVnd: n(f.out),
      closingVnd: n(f.closing),
      headHash: String(f.head_hash),
    })),
  };
}

/** Bước 2 — người thứ hai (khác người chốt) xác nhận. */
export async function confirmPeriod(tx: Tx, month: string): Promise<{ periodId: string; closedBy: string | null }> {
  const per = await periodOf(tx, month);
  if (per.status !== "pending_confirmation") throw new ApiError(422, "PERIOD_NOT_PENDING", `Tháng ${mmYYYY(month)} không ở trạng thái chờ xác nhận chốt sổ.`);
  await tx.query("SELECT app.fn_confirm_period_close($1)", [per.id]);
  return { periodId: per.id, closedBy: per.closedBy };
}

/** Mở lại kỳ đã chốt / đang chờ xác nhận — bắt buộc lý do (≥ 10 ký tự), chỉ kỳ mới nhất trước. */
export async function reopenPeriod(tx: Tx, month: string, reason: string): Promise<{ periodId: string; closedBy: string | null; confirmedBy: string | null }> {
  const per = await periodOf(tx, month);
  if (per.status === "open") throw new ApiError(422, "PERIOD_OPEN", `Tháng ${mmYYYY(month)} đang mở sổ.`);
  if (reason.trim().length < 10) throw badRequest("Lý do mở lại sổ tối thiểu 10 ký tự.");
  await tx.query("SELECT app.fn_reopen_period($1, $2)", [per.id, reason.trim()]);
  return { periodId: per.id, closedBy: per.closedBy, confirmedBy: per.confirmedBy };
}

/** Đối soát số dư cuối tháng của một túi quỹ (Thủ quỹ). Số dư sổ quỹ do CSDL tính. */
export async function reconcilePeriod(
  tx: Tx,
  month: string,
  b: { fundId: string; statementVnd: number; explanation?: string | null }
): Promise<{ statementVnd: number; ledgerVnd: number; differenceVnd: number }> {
  if (!isMonth(month)) throw badRequest("Tháng phải có dạng YYYY-MM.");
  const r = (
    await tx.query<{ r: Row }>("SELECT app.fn_reconcile_period($1::date, $2::uuid, $3::bigint, $4) AS r", [
      `${month}-01`,
      b.fundId,
      b.statementVnd,
      b.explanation ?? null,
    ])
  ).rows[0].r;
  return { statementVnd: n(r.statement_vnd), ledgerVnd: n(r.ledger_vnd), differenceVnd: n(r.difference_vnd) };
}
