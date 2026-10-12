import "server-only";
import { batch, type Tx } from "../db";
import { forbidden } from "../errors";
import type { LedgerBookDto, LedgerBookEntryDto, LedgerBookFundDto, LedgerSourceType } from "@/lib/types/finance";

// =====================================================================
// SỔ QUỸ CÓ SỐ DƯ theo khoảng ngày (xuất Excel / xem trong tab "Sổ quỹ & chốt sổ") — đọc thẳng sổ cái bất biến ledger_entries:
// số dư đầu kỳ = mọi bút toán TRƯỚC ngày bắt đầu; mỗi dòng có số dư sau bút toán (theo thứ tự ngày hạch toán rồi số thứ tự bút toán),
// người đối ứng, chứng từ (số phiếu chi / mã khoản thu / bút toán đảo). Cần finance.ledger.read (RLS ledger_entries).
// =====================================================================

const MAX_ROWS = 5000;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => Number(v ?? 0);

const PLAN_CODES = `(SELECT string_agg(DISTINCT cp.code, ', ')
                       FROM contribution_payment_allocations a
                       JOIN contributions ct ON ct.id = a.contribution_id
                       JOIN contribution_plans cp ON cp.id = ct.plan_id
                      WHERE a.payment_id = %ID%)`;

const ENTRIES_SQL = `SELECT le.id, le.fund_id, le.fund_seq, le.entry_date::text AS entry_date, le.posted_at, le.direction::text AS direction,
        le.amount_vnd, le.source_type::text AS source_type, le.description,
        COALESCE(cm.display_name, cm.full_name) AS counterparty,
        (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = le.created_by LIMIT 1) AS recorded_by,
        CASE le.source_type
          WHEN 'expense' THEN (SELECT ev.voucher_no FROM expense_vouchers ev WHERE ev.id = le.source_id)
          WHEN 'contribution' THEN ${PLAN_CODES.replace("%ID%", "le.source_id")}
          WHEN 'reversal' THEN COALESCE(
            (SELECT 'Đảo ' || ev.voucher_no FROM expense_vouchers ev WHERE ev.id = le.source_id),
            (SELECT 'Hủy phiếu thu' || COALESCE(' ' || ${PLAN_CODES.replace("%ID%", "p.id")}, '') FROM contribution_payments p WHERE p.id = le.source_id))
        END AS document,
        sum(CASE le.direction WHEN 'in' THEN le.amount_vnd ELSE -le.amount_vnd END)
          OVER (PARTITION BY le.fund_id ORDER BY le.entry_date, le.fund_seq) AS running
   FROM ledger_entries le
   LEFT JOIN members cm ON cm.id = le.counterparty_member_id
  WHERE le.entry_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR le.fund_id = $3::uuid)
  ORDER BY le.fund_id, le.entry_date, le.fund_seq
  LIMIT ${MAX_ROWS + 1}`;

const FUNDS_SQL = `SELECT f.id, f.code, f.name, f.fund_type::text AS type, f.is_active,
        app.fn_fund_balance_at(f.id, $1::date - 1) AS opening,
        app.fn_fund_balance_at(f.id, $2::date) AS closing,
        (SELECT COALESCE(sum(le.amount_vnd) FILTER (WHERE le.direction = 'in'), 0) FROM ledger_entries le
          WHERE le.fund_id = f.id AND le.entry_date BETWEEN $1::date AND $2::date) AS total_in,
        (SELECT COALESCE(sum(le.amount_vnd) FILTER (WHERE le.direction = 'out'), 0) FROM ledger_entries le
          WHERE le.fund_id = f.id AND le.entry_date BETWEEN $1::date AND $2::date) AS total_out
   FROM funds f
  WHERE f.deleted_at IS NULL AND ($3::uuid IS NULL OR f.id = $3::uuid)
    AND (f.is_active OR EXISTS (SELECT 1 FROM ledger_entries le WHERE le.fund_id = f.id AND le.entry_date BETWEEN $1::date AND $2::date))
  ORDER BY CASE f.fund_type WHEN 'cash' THEN 0 WHEN 'bank' THEN 1 ELSE 2 END, f.code`;

export async function getLedgerBook(tx: Tx, q: { from: string; to: string; fund?: string | null }): Promise<LedgerBookDto> {
  const params = [q.from, q.to, q.fund ?? null];
  const [permR, fundsR, entriesR, houseR] = await batch(tx, [
    ["SELECT app.has_permission('finance.ledger.read') AS ok"],
    [FUNDS_SQL, params],
    [ENTRIES_SQL, params],
    ["SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'"],
  ]);
  if (!(permR.rows[0] as Row)?.ok) throw forbidden("Bạn không có quyền xem sổ quỹ chi tiết.");
  const rows = entriesR.rows as Row[];
  const truncated = rows.length > MAX_ROWS;
  const byFund = new Map<string, LedgerBookEntryDto[]>();
  const openingOf = new Map<string, number>((fundsR.rows as Row[]).map((f) => [f.id as string, n(f.opening)]));
  for (const r of rows.slice(0, MAX_ROWS)) {
    const list = byFund.get(r.fund_id) ?? [];
    list.push({
      id: r.id,
      seq: n(r.fund_seq),
      date: r.entry_date,
      postedAt: new Date(r.posted_at).toISOString(),
      direction: r.direction,
      amountVnd: n(r.amount_vnd),
      sourceType: r.source_type as LedgerSourceType,
      description: r.description,
      counterparty: r.counterparty ?? null,
      document: r.document ?? null,
      recordedBy: r.recorded_by ?? null,
      balanceAfterVnd: (openingOf.get(r.fund_id) ?? 0) + n(r.running),
    });
    byFund.set(r.fund_id, list);
  }
  const funds: LedgerBookFundDto[] = (fundsR.rows as Row[]).map((f) => {
    // Tổng thu/chi + số dư cuối tính trong CSDL (đúng cả khi danh sách bút toán bị cắt bớt)
    return {
      fundId: f.id,
      code: f.code,
      name: f.name,
      type: f.type ?? null,
      openingVnd: n(f.opening),
      inVnd: n(f.total_in),
      outVnd: n(f.total_out),
      closingVnd: n(f.closing),
      entries: byFund.get(f.id) ?? [],
    };
  });
  return {
    from: q.from,
    to: q.to,
    funds,
    houseName: (houseR.rows[0] as Row)?.v || null,
    generatedAt: new Date().toISOString(),
    truncated,
  };
}
