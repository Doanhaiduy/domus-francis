import "server-only";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import { financeCaller, listPlans, monthEnd, monthLabel } from "./finance";
import type { ContributionCellDto, ContributionMatrixDto, ContributionRowDto, ContributionStatus, PaymentMethod } from "@/lib/types/finance";

const addMonths = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Ma trận đóng quỹ thành viên × tháng (12 tháng kết thúc ở `toMonth`).
 * RLS contributions: người có finance.contribution.read_all thấy cả nhà; thành viên chỉ thấy dòng của mình.
 */
export async function getContributionMatrix(tx: Tx, toMonth: string | undefined, monthsCount = 12): Promise<ContributionMatrixDto> {
  const c = await financeCaller(tx);
  const end = toMonth ?? c.today.slice(0, 7);
  const n = Math.min(24, Math.max(1, monthsCount));
  const months = Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));
  const plans = await listPlans(tx, c, `${months[0]}-01`, monthEnd(`${end}-01`));

  const cells = (
    await tx.query(
      `SELECT ct.id, ct.plan_id, ct.member_id, to_char(cp.period_month, 'YYYY-MM') AS month, ct.status::text AS status,
              ct.amount_due_vnd, ct.discount_vnd, ct.paid_vnd, ct.due_date::text AS due_date, ct.discount_reason,
              (ct.status IN ('unpaid', 'partial') AND ct.due_date < app.local_today()) AS overdue,
              COALESCE((SELECT json_agg(json_build_object(
                          'paymentId', p.id, 'allocatedVnd', a.amount_vnd, 'totalVnd', p.amount_vnd, 'paidOn', p.paid_on::text,
                          'method', p.method::text,
                          'monthsCovered', (SELECT count(*) FROM contribution_payment_allocations a2 WHERE a2.payment_id = p.id))
                          ORDER BY p.paid_on, p.created_at)
                          FROM contribution_payment_allocations a JOIN contribution_payments p ON p.id = a.payment_id
                         WHERE a.contribution_id = ct.id AND p.voided_at IS NULL), '[]'::json) AS payments
         FROM contributions ct
         JOIN contribution_plans cp ON cp.id = ct.plan_id
        WHERE cp.id = ANY ($1::uuid[]) AND ct.status <> 'cancelled'`,
      [plans.map((p) => p.id)]
    )
  ).rows;

  // Dòng: mọi thành viên đang ở (nếu xem được cả nhà) + bất kỳ ai có khoản phải thu trong cửa sổ
  const memberIds = new Set<string>(cells.map((r) => r.member_id));
  if (c.contribAll) {
    for (const r of (await tx.query<{ id: string }>("SELECT id FROM members WHERE deleted_at IS NULL AND status IN ('active', 'on_leave')")).rows)
      memberIds.add(r.id);
  } else if (c.mid) memberIds.add(c.mid);
  const people = (
    await tx.query(
      `SELECT m.id, m.display_name, m.full_name, r.code AS room
         FROM members m
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
        WHERE m.id = ANY ($1::uuid[])
        ORDER BY r.code NULLS LAST, m.member_no`,
      [[...memberIds]]
    )
  ).rows;

  const rows: ContributionRowDto[] = people.map((p) => ({
    memberId: p.id,
    name: p.display_name,
    fullName: p.full_name,
    room: p.room ?? null,
    cells: {},
    outstandingVnd: 0,
    overdueMonths: 0,
  }));
  const byId = new Map(rows.map((r) => [r.memberId, r]));
  for (const r of cells) {
    const row = byId.get(r.member_id);
    if (!row) continue;
    const net = Number(r.amount_due_vnd) - Number(r.discount_vnd);
    const paid = Number(r.paid_vnd);
    const cell: ContributionCellDto = {
      contributionId: r.id,
      planId: r.plan_id,
      month: r.month,
      status: r.status as ContributionStatus,
      amountDueVnd: Number(r.amount_due_vnd),
      discountVnd: Number(r.discount_vnd),
      netDueVnd: net,
      paidVnd: paid,
      remainingVnd: Math.max(0, net - paid),
      dueDate: r.due_date,
      overdue: r.overdue,
      discountReason: r.discount_reason,
      payments: (r.payments as ContributionCellDto["payments"]).map((x) => ({ ...x, method: x.method as PaymentMethod })),
    };
    row.cells[r.month] = cell;
    if (cell.status === "unpaid" || cell.status === "partial") {
      row.outstandingVnd += cell.remainingVnd;
      if (cell.overdue) row.overdueMonths++;
    }
  }
  return { months, plans, rows, canReadAll: c.contribAll };
}

// ---------------------------------------------------------------------
// Lập kỳ thu tháng + sinh khoản phải thu (finance.contribution.plan.manage)
// ---------------------------------------------------------------------
export async function createPlan(tx: Tx, b: { month: string; amountVnd: number; dueDate: string; fundId?: string; name?: string | null }) {
  const c = await financeCaller(tx);
  if (!c.planManage) throw forbidden("Bạn không có quyền lập kỳ thu quỹ.");
  const periodMonth = `${b.month}-01`;
  if (b.dueDate.slice(0, 7) < b.month) throw new ApiError(422, "BAD_DUE_DATE", "Hạn nộp phải nằm trong hoặc sau tháng thu.");
  const fundId =
    b.fundId ?? (await tx.query<{ id: string }>("SELECT id FROM app.fn_fund_options() WHERE fund_type = 'cash' ORDER BY code LIMIT 1")).rows[0]?.id;
  if (!fundId) throw new ApiError(422, "NO_FUND", "Chưa có túi quỹ tiền mặt để nhận tiền.");
  const [yyyy, mm] = [b.month.slice(0, 4), b.month.slice(5, 7)];
  const dup = (
    await tx.query("SELECT 1 FROM contribution_plans WHERE fee_type = 'monthly_dues' AND status <> 'cancelled' AND period_month = $1::date", [periodMonth])
  ).rowCount;
  if (dup) throw new ApiError(409, "BR-FIN-13", `BR-FIN-13: ${monthLabel(b.month)} đã có kỳ thu quỹ sinh hoạt.`);
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO contribution_plans (code, name, fee_type, academic_year_id, period_month, amount_vnd, due_date, fund_id, created_by)
       VALUES ($1, $2, 'monthly_dues', (SELECT id FROM academic_years WHERE $3::date BETWEEN starts_on AND ends_on LIMIT 1),
               $3::date, $4, $5::date, $6, app.current_user_id())
       RETURNING id`,
      [`QSH-${yyyy}-${mm}`, b.name || `Quỹ sinh hoạt tháng ${mm}/${yyyy}`, periodMonth, b.amountVnd, b.dueDate, fundId]
    )
  ).rows[0].id;
  const generated = (await tx.query<{ n: number }>("SELECT app.fn_generate_contributions($1) AS n", [id])).rows[0].n;
  return { id, generated, label: monthLabel(b.month) };
}

// ---------------------------------------------------------------------
// Ghi thu (một phiếu thu phân bổ cho 1..n tháng) / hủy phiếu thu / miễn giảm
// ---------------------------------------------------------------------
export async function recordPayment(
  tx: Tx,
  b: {
    memberId: string;
    fundId: string;
    method: string;
    paidOn: string;
    referenceCode?: string | null;
    note?: string | null;
    allocations: { contributionId: string; amountVnd: number }[];
    clientRequestId?: string;
  }
): Promise<string> {
  const ok = (await tx.query<{ ok: boolean }>("SELECT $1::date <= app.local_today() AS ok", [b.paidOn])).rows[0].ok;
  if (!ok) throw new ApiError(422, "FUTURE_DATE", "Ngày thu không được ở tương lai.");
  const total = b.allocations.reduce((a, x) => a + x.amountVnd, 0);
  const allocations = b.allocations.map((a) => ({ contribution_id: a.contributionId, amount_vnd: a.amountVnd }));
  return (
    await tx.query<{ id: string }>(
      "SELECT app.fn_record_contribution_payment($1, $2, $3, $4::payment_method_t, $5::date, $6, $7::jsonb, $8, $9) AS id",
      [b.memberId, b.fundId, total, b.method, b.paidOn, b.referenceCode ?? null, JSON.stringify(allocations), b.clientRequestId ?? null, b.note ?? null]
    )
  ).rows[0].id;
}

export async function voidPayment(tx: Tx, paymentId: string, reason: string) {
  await tx.query("SELECT app.fn_void_contribution_payment($1, $2)", [paymentId, reason]);
}

export async function waiveContribution(tx: Tx, id: string, discountVnd: number, reason: string | null | undefined) {
  const c = await financeCaller(tx);
  if (!c.waive) throw forbidden("BR-FIN-14: chỉ Trưởng nhà (quyền finance.contribution.waive) được miễn/giảm khoản phải thu.");
  const cur = (
    await tx.query<{ due: number; paid: number }>("SELECT amount_due_vnd AS due, paid_vnd AS paid FROM contributions WHERE id = $1", [id])
  ).rows[0];
  if (!cur) throw notFound("Không tìm thấy khoản phải thu.");
  if (discountVnd > Number(cur.due) - Number(cur.paid))
    throw new ApiError(422, "BR-FIN-14", "Mức miễn/giảm vượt số còn phải thu (đã trừ phần đã đóng).");
  const r = await tx.query("UPDATE contributions SET discount_vnd = $2, discount_reason = $3 WHERE id = $1", [
    id,
    discountVnd,
    discountVnd > 0 ? reason ?? null : null,
  ]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền miễn/giảm khoản phải thu này.");
}
