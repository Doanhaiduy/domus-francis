import "server-only";
import type { QueryResult } from "pg";
import { batch, type Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import {
  FINANCE_CALLER_SQL,
  financeCaller,
  financeCallerFrom,
  listPlansFrom,
  listPlansItem,
  monthEnd,
  planByIdItem,
  type SqlItem,
} from "./finance";
import type { PlanInput } from "./finance-schema";
import {
  monthRangeLabel,
  type ContributionCellDto,
  type ContributionMatrixDto,
  type ContributionRowDto,
  type ContributionStatus,
  type CreatePlanResultDto,
  type FeeType,
  type PaymentMethod,
  type PlanPreviewDto,
} from "@/lib/types/finance";

const addMonths = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Ma trận đóng quỹ thành viên × kế hoạch thu. Cột = các kế hoạch có thời gian giao với `monthsCount` tháng kết thúc ở `toMonth`
 * (hoặc đúng một kế hoạch `planId`); `memberId` giới hạn còn một thành viên (hộp thoại ghi thu).
 * RLS contributions: người có finance.contribution.read_all thấy cả nhà; thành viên chỉ thấy dòng của mình.
 */
export async function getContributionMatrix(
  tx: Tx,
  q: { toMonth?: string; monthsCount?: number; planId?: string; memberId?: string }
): Promise<ContributionMatrixDto> {
  // Pha 1 — gộp quyền người gọi + danh sách thành viên đang ở (chỉ dùng khi xem được cả nhà): 1 vòng mạng thay vì 2
  const [callerR, activeR] = await batch(tx, [
    [FINANCE_CALLER_SQL],
    ["SELECT id FROM members WHERE deleted_at IS NULL AND status IN ('active', 'on_leave')"],
  ]);
  const c = financeCallerFrom(callerR);
  if (!c.summary) throw forbidden("Bạn không có quyền xem tình hình quỹ.");
  const end = q.toMonth ?? c.today.slice(0, 7);
  const n = Math.min(24, Math.max(1, q.monthsCount ?? 12));
  const from = addMonths(end, -(n - 1));

  // Dòng: mọi thành viên đang ở (nếu xem được cả nhà, trừ khi xem một kế hoạch/một người) + bất kỳ ai có khoản phải thu trong các cột
  const known = new Set<string>();
  if (q.memberId) {
    if (q.memberId !== c.mid && !c.contribAll) throw forbidden("Bạn chỉ xem được khoản đóng quỹ của chính mình.");
    known.add(q.memberId);
  } else if (c.contribAll && !q.planId) for (const r of activeR.rows as { id: string }[]) known.add(r.id);
  else if (c.mid && !q.planId) known.add(c.mid);

  // Pha 2 — gộp kế hoạch + thông tin người của các dòng đã biết: 1 vòng mạng thay vì 2
  const [plansR, knownPeopleR] = await batch(tx, [
    q.planId ? planByIdItem(c, q.planId) : listPlansItem(c, `${from}-01`, monthEnd(`${end}-01`)),
    peopleItem([...known]),
  ]);
  const plans = listPlansFrom(plansR, c);
  if (q.planId && !plans.length) throw notFound("Không tìm thấy kế hoạch thu (hoặc kế hoạch đã hủy).");

  const cells = (
    await tx.query(
      `SELECT ct.id, ct.plan_id, ct.member_id, cp.code AS plan_code, cp.name AS plan_name, cp.fee_type::text AS fee_type,
              to_char(cp.period_month, 'YYYY-MM') AS month, ct.status::text AS status,
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
        WHERE cp.id = ANY ($1::uuid[]) AND ct.status <> 'cancelled' AND ($2::uuid IS NULL OR ct.member_id = $2::uuid)`,
      [plans.map((p) => p.id), q.memberId ?? null]
    )
  ).rows;

  const memberIds = new Set<string>(cells.map((r) => r.member_id));
  for (const id of known) memberIds.add(id);
  // Thường mọi khoản phải thu đều thuộc các dòng đã biết ⇒ dùng luôn kết quả pha 2; chỉ khi có người ngoài danh sách
  // (đã rời nhà nhưng còn khoản, hoặc xem một kế hoạch) mới đọc lại với đủ danh sách (giữ nguyên thứ tự sắp xếp của câu SQL).
  const people = (memberIds.size === known.size ? knownPeopleR : await runPeople(tx, [...memberIds])).rows;

  const rows: ContributionRowDto[] = people.map((p) => ({
    memberId: p.id,
    name: p.display_name,
    fullName: p.full_name,
    room: p.room ?? null,
    cells: {},
    outstandingVnd: 0,
    overdueCount: 0,
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
      planCode: r.plan_code,
      planName: r.plan_name,
      feeType: r.fee_type as FeeType,
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
    row.cells[r.plan_id] = cell;
    if (cell.status === "unpaid" || cell.status === "partial") {
      row.outstandingVnd += cell.remainingVnd;
      if (cell.overdue) row.overdueCount++;
    }
  }
  return { from, to: end, plans, rows, canReadAll: c.contribAll };
}

const peopleItem = (ids: string[]): SqlItem => [
  `SELECT m.id, m.display_name, m.full_name, r.code AS room
         FROM members m
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
        WHERE m.id = ANY ($1::uuid[])
        ORDER BY r.code NULLS LAST, m.member_no`,
  [ids],
];

const runPeople = (tx: Tx, ids: string[]): Promise<QueryResult> => {
  const [sql, params] = peopleItem(ids);
  return tx.query(sql, params as unknown[]);
};

// ---------------------------------------------------------------------
// Lập kế hoạch thu (finance.contribution.plan.manage) — quỹ định kỳ / tiền điện nước — qua hàm SECURITY DEFINER
// (kiểm quyền, chống trùng kỳ BR-FIN-13, chia đều + làm tròn, sinh khoản phải thu trong cùng transaction)
// ---------------------------------------------------------------------
export async function createPlan(tx: Tx, b: PlanInput): Promise<CreatePlanResultDto> {
  const c = await financeCaller(tx);
  if (!c.planManage) throw forbidden("Bạn không có quyền lập kế hoạch thu quỹ.");
  const r =
    b.kind === "periodic_dues"
      ? (
          await tx.query<{ r: Record<string, unknown> }>("SELECT app.fn_create_dues_cycle_plan($1::date, $2::date, $3::uuid) AS r", [
            b.startMonth ? `${b.startMonth}-01` : null,
            b.dueDate ?? null,
            b.fundId ?? null,
          ])
        ).rows[0].r
      : (
          await tx.query<{ r: Record<string, unknown> }>("SELECT app.fn_create_utility_plan($1::date, $2::bigint, $3::date, $4::uuid, $5) AS r", [
            `${b.month}-01`,
            b.billTotalVnd,
            b.dueDate ?? null,
            b.fundId ?? null,
            b.note ?? null,
          ])
        ).rows[0].r;
  const num = (k: string) => (r[k] === undefined || r[k] === null ? null : Number(r[k]));
  return {
    id: String(r.plan_id),
    code: String(r.code),
    name: String(r.name),
    generated: Number(r.generated),
    amountVnd: Number(r.amount_vnd),
    dueDate: String(r.due_date),
    splitCount: num("split_count"),
    billTotalVnd: num("bill_total_vnd"),
    remainderVnd: num("remainder_vnd"),
  };
}

/** Xem trước một kế hoạch (không ghi): số người chia, mỗi người, phần dư, hạn nộp, kế hoạch trùng (nếu có). */
export async function previewPlan(
  tx: Tx,
  q: { kind: "periodic_dues"; startMonth?: string; dueDate?: string } | { kind: "utility"; month: string; billTotalVnd: number; dueDate?: string }
): Promise<PlanPreviewDto> {
  if (q.kind === "periodic_dues") {
    const [callerR, cfgR] = await batch(tx, [
      [FINANCE_CALLER_SQL],
      [
        `SELECT to_char(b.start_month, 'YYYY-MM') AS s, to_char(b.end_month, 'YYYY-MM') AS e,
                COALESCE($2::date, make_date(extract(year FROM b.start_month)::int, extract(month FROM b.start_month)::int,
                                             LEAST(28, GREATEST(1, app.setting_int('finance.dues_cycle_due_day')::int))))::text AS due,
                app.setting_int('finance.dues_cycle_amount_vnd') AS amount,
                (SELECT json_build_object('id', x.id, 'name', x.name) FROM contribution_plans x
                  WHERE x.fee_type = 'periodic_dues' AND x.status <> 'cancelled'
                    AND x.period_month <= b.end_month AND COALESCE(x.period_end_month, x.period_month) >= b.start_month LIMIT 1) AS existing
           FROM app.fn_dues_cycle_bounds(COALESCE($1::date, app.local_today())) b`,
        [q.startMonth ? `${q.startMonth}-01` : null, q.dueDate ?? null],
      ],
    ]);
    const c = financeCallerFrom(callerR);
    if (!c.planManage) throw forbidden("Bạn không có quyền lập kế hoạch thu quỹ.");
    const cfg = cfgR.rows[0] as { s: string; e: string; due: string; amount: string; existing: { id: string; name: string } | null };
    const n = (await tx.query<{ n: number }>("SELECT app.fn_billable_member_count($1::date) AS n", [cfg.due])).rows[0].n;
    const amount = Number(cfg.amount);
    return {
      kind: "periodic_dues",
      name: `Quỹ kỳ ${monthRangeLabel(cfg.s, cfg.e)}`,
      month: cfg.s,
      endMonth: cfg.e,
      dueDate: cfg.due,
      splitCount: n,
      amountVnd: amount,
      totalVnd: amount * n,
      billTotalVnd: null,
      remainderVnd: 0,
      existing: cfg.existing,
    };
  }
  const [callerR, cfgR] = await batch(tx, [
    [FINANCE_CALLER_SQL],
    [
      `SELECT COALESCE($2::date, ($1::date + interval '1 month')::date + (LEAST(28, GREATEST(1, app.setting_int('finance.utility_due_day')::int)) - 1))::text AS due,
              (SELECT json_build_object('id', x.id, 'name', x.name) FROM contribution_plans x
                WHERE x.fee_type = 'utility' AND x.status <> 'cancelled' AND x.period_month = $1::date LIMIT 1) AS existing`,
      [`${q.month}-01`, q.dueDate ?? null],
    ],
  ]);
  const c = financeCallerFrom(callerR);
  if (!c.planManage) throw forbidden("Bạn không có quyền lập kế hoạch thu tiền điện nước.");
  const cfg = cfgR.rows[0] as { due: string; existing: { id: string; name: string } | null };
  const n = (await tx.query<{ n: number }>("SELECT app.fn_billable_member_count($1::date) AS n", [cfg.due])).rows[0].n;
  const amount = n > 0 && q.billTotalVnd > 0 ? Math.ceil(q.billTotalVnd / n / 1000) * 1000 : 0;
  return {
    kind: "utility",
    name: `Điện nước tháng ${q.month.slice(5, 7)}/${q.month.slice(0, 4)}`,
    month: q.month,
    endMonth: null,
    dueDate: cfg.due,
    splitCount: n,
    amountVnd: amount,
    totalVnd: amount * n,
    billTotalVnd: q.billTotalVnd,
    remainderVnd: Math.max(0, amount * n - q.billTotalVnd),
    existing: cfg.existing,
  };
}

/** Hủy kế hoạch thu chưa có ai nộp tiền (vd. nhập sai tổng hóa đơn) — app.fn_cancel_contribution_plan kiểm quyền + điều kiện. */
export async function cancelPlan(tx: Tx, planId: string, reason: string): Promise<{ cancelled: number }> {
  const n = (await tx.query<{ n: number }>("SELECT app.fn_cancel_contribution_plan($1, $2) AS n", [planId, reason])).rows[0].n;
  return { cancelled: n };
}

// ---------------------------------------------------------------------
// Ghi thu (một phiếu thu phân bổ cho 1..n khoản) / hủy phiếu thu / miễn giảm
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
  // Gộp quyền người gọi + khoản phải thu (chỉ đọc): 1 vòng mạng thay vì 2 — kiểm theo đúng thứ tự cũ
  const [callerR, curR] = await batch(tx, [
    [FINANCE_CALLER_SQL],
    ["SELECT amount_due_vnd AS due, paid_vnd AS paid FROM contributions WHERE id = $1", [id]],
  ]);
  const c = financeCallerFrom(callerR);
  if (!c.waive) throw forbidden("BR-FIN-14: chỉ Trưởng nhà (quyền finance.contribution.waive) được miễn/giảm khoản phải thu.");
  const cur = curR.rows[0] as { due: number; paid: number } | undefined;
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
