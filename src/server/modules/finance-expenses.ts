import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { financeCaller, type FinanceCaller } from "./finance";
import type { CreateExpenseInput, UpdateExpenseInput } from "./finance-schema";
import type { ExpenseDetailDto, ExpenseDto, ExpenseStatus, PaymentMethod } from "@/lib/types/finance";

// ---------------------------------------------------------------------
// Phiếu chi: đọc (RLS quyết định phiếu nào nhìn thấy) — người thường thấy phiếu mình lập/mình ứng tiền,
// cán bộ có finance.expense.read_all thấy toàn bộ.
// ---------------------------------------------------------------------
const EXPENSE_SELECT = `
  SELECT ev.id, ev.voucher_no, ev.title, ev.amount_vnd, ev.expense_date::text AS expense_date, ev.fund_id,
         c.id AS category_id, c.code AS category_code, c.name AS category_name, c.color AS category_color,
         ev.paid_by_member_id, pm.display_name AS paid_by_name,
         ev.payee_name, ev.invoice_no, ev.payment_method::text AS payment_method, ev.status::text AS status, ev.note, ev.no_receipt_reason,
         ev.requested_by, rm.id AS requester_member_id, rm.display_name AS requester_name,
         ev.required_approvals, ev.approval_round,
         ev.submitted_at, ev.approved_at, ev.rejected_at, ev.rejection_reason, ev.paid_at, ev.cancelled_at, ev.cancel_reason, ev.created_at,
         ev.paid_recorded_by,
         (SELECT count(*)::int FROM expense_approvals ea
           WHERE ea.voucher_id = ev.id AND ea.round = ev.approval_round AND ea.decision = 'approved') AS approved_count,
         EXISTS (SELECT 1 FROM expense_approvals ea
                  WHERE ea.voucher_id = ev.id AND ea.round = ev.approval_round AND ea.approver_user_id = app.current_user_id()) AS i_signed,
         ARRAY(SELECT ea.approver_role FROM expense_approvals ea
                WHERE ea.voucher_id = ev.id AND ea.round = ev.approval_round AND ea.decision = 'approved') AS used_roles,
         COALESCE((SELECT json_agg(json_build_object('fileId', ma.file_id, 'mime', sf.detected_mime) ORDER BY ma.position, ma.created_at)
                     FROM media_attachments ma LEFT JOIN storage_files sf ON sf.id = ma.file_id
                    WHERE ma.entity_type = 'expense_voucher' AND ma.entity_id = ev.id AND ma.purpose = 'receipt'), '[]'::json) AS receipts
    FROM expense_vouchers ev
    JOIN categories c ON c.id = ev.category_id
    LEFT JOIN members pm ON pm.id = ev.paid_by_member_id
    LEFT JOIN members rm ON rm.user_id = ev.requested_by`;

type Row = Record<string, any>;
const ts = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const OWNER_EDITABLE: ExpenseStatus[] = ["draft", "rejected", "pending_approval"];

async function fundNames(tx: Tx, c: FinanceCaller): Promise<Map<string, string>> {
  if (!c.fundOptions) return new Map();
  const rows = (await tx.query<{ id: string; name: string }>("SELECT id, name FROM app.fn_fund_options()")).rows;
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Có thể ký duyệt theo luật chữ ký (trigger tg_expense_approval_rules): phiếu 1 chữ ký do Trưởng nhà, hoặc Thủ quỹ với khoản
 *  ≤ hạn mức tự duyệt (BR-FIN-17); phiếu 2 chữ ký: vai trò của người ký chưa được dùng trong vòng này (BR-FIN-02). */
function canSign(r: Row, c: FinanceCaller): boolean {
  const roles = c.approverRoles;
  if (Number(r.required_approvals) === 1) {
    if (roles.includes("house_head")) return true;
    return roles.includes("treasurer") && (c.treasurerSoloMaxVnd === null || Number(r.amount_vnd) <= c.treasurerSoloMaxVnd);
  }
  const used: string[] = r.used_roles ?? [];
  return roles.some((x) => !used.includes(x));
}

function toDto(r: Row, c: FinanceCaller, funds: Map<string, string>): ExpenseDto {
  const status = r.status as ExpenseStatus;
  const mine = r.requested_by === c.uid;
  const iAmPayee = !!c.mid && r.paid_by_member_id === c.mid;
  const mayDecide = c.approve && status === "pending_approval" && !mine && !iAmPayee && !r.i_signed;
  return {
    id: r.id,
    voucherNo: r.voucher_no,
    title: r.title,
    amountVnd: Number(r.amount_vnd),
    category: { id: r.category_id, code: r.category_code, name: r.category_name, color: r.category_color },
    expenseDate: r.expense_date,
    fundId: r.fund_id,
    fundName: funds.get(r.fund_id) ?? null,
    paidBy: r.paid_by_member_id ? { memberId: r.paid_by_member_id, name: r.paid_by_name ?? "—" } : null,
    payeeName: r.payee_name,
    invoiceNo: r.invoice_no,
    paymentMethod: (r.payment_method as PaymentMethod) ?? null,
    status,
    note: r.note,
    noReceiptReason: r.no_receipt_reason,
    requestedBy: { userId: r.requested_by, memberId: r.requester_member_id ?? null, name: r.requester_name ?? "Không rõ" },
    requiredApprovals: r.required_approvals,
    approvedCount: r.approved_count,
    submittedAt: ts(r.submitted_at),
    approvedAt: ts(r.approved_at),
    rejectedAt: ts(r.rejected_at),
    rejectionReason: r.rejection_reason,
    paidAt: ts(r.paid_at),
    cancelledAt: ts(r.cancelled_at),
    cancelReason: r.cancel_reason,
    createdAt: ts(r.created_at)!,
    receipts: (r.receipts as { fileId: string; mime: string | null }[]).map((f) => ({ ...f, url: `/api/v1/files/${f.fileId}` })),
    can: {
      edit: mine && OWNER_EDITABLE.includes(status),
      submit: mine && status === "draft",
      withdraw: mine && (status === "pending_approval" || status === "rejected"),
      approve: mayDecide && canSign(r, c),
      reject: mayDecide,
      pay: c.pay && status === "approved",
      cancel: (mine && OWNER_EDITABLE.includes(status)) || (c.approve && (status === "pending_approval" || status === "approved")),
      reverse: c.reverse && status === "paid",
    },
  };
}

export async function listExpenses(tx: Tx, q: { from?: string; to?: string }): Promise<ExpenseDto[]> {
  const c = await financeCaller(tx);
  const funds = await fundNames(tx, c);
  const rows = (
    await tx.query(
      `${EXPENSE_SELECT}
        WHERE ($1::date IS NULL OR ev.expense_date >= $1::date) AND ($2::date IS NULL OR ev.expense_date <= $2::date)
        ORDER BY ev.expense_date DESC, ev.created_at DESC
        LIMIT 1000`,
      [q.from ?? null, q.to ?? null]
    )
  ).rows;
  return rows.map((r) => toDto(r, c, funds));
}

export async function getExpense(tx: Tx, id: string): Promise<ExpenseDetailDto> {
  const c = await financeCaller(tx);
  const r = (await tx.query(`${EXPENSE_SELECT} WHERE ev.id = $1`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy phiếu chi (hoặc bạn không có quyền xem).");
  const funds = await fundNames(tx, c);
  const approvals = (
    await tx.query(
      `SELECT COALESCE(m.display_name, 'Không rõ') AS name, ea.approver_role, ea.decision::text AS decision, ea.comment, ea.decided_at, ea.round
         FROM expense_approvals ea LEFT JOIN members m ON m.user_id = ea.approver_user_id
        WHERE ea.voucher_id = $1
        ORDER BY ea.round DESC, ea.decided_at`,
      [id]
    )
  ).rows;
  const payer = r.paid_recorded_by
    ? (await tx.query<{ n: string }>("SELECT display_name AS n FROM members WHERE user_id = $1", [r.paid_recorded_by])).rows[0]?.n ?? null
    : null;
  const rev =
    r.status === "reversed"
      ? (
          await tx.query<{ reason: string | null; changed_at: Date }>(
            "SELECT reason, changed_at FROM expense_status_history WHERE voucher_id = $1 AND to_status = 'reversed' ORDER BY changed_at DESC LIMIT 1",
            [id]
          )
        ).rows[0]
      : undefined;
  return {
    ...toDto(r, c, funds),
    reversal: rev ? { reason: rev.reason, at: ts(rev.changed_at)! } : null,
    approvalRound: r.approval_round,
    approvals: approvals.map((a) => ({
      approverName: a.name,
      role: a.approver_role,
      decision: a.decision,
      comment: a.comment,
      decidedAt: ts(a.decided_at)!,
      round: a.round,
    })),
    paidRecordedBy: payer,
  };
}

// ---------------------------------------------------------------------
// Ghi: lập / sửa / gắn hóa đơn / chuyển trạng thái (mọi chuyển trạng thái qua app.fn_* — BR-FIN-15)
// ---------------------------------------------------------------------
async function assertNotFuture(tx: Tx, date: string, label: string) {
  const ok = (await tx.query<{ ok: boolean }>("SELECT $1::date <= app.local_today() AS ok", [date])).rows[0].ok;
  if (!ok) throw new ApiError(422, "FUTURE_DATE", `${label} không được ở tương lai.`);
}

async function setReceipt(tx: Tx, voucherId: string, fileId: string | null) {
  const cur = (
    await tx.query<{ file_id: string }>(
      "SELECT file_id FROM media_attachments WHERE entity_type = 'expense_voucher' AND entity_id = $1 AND purpose = 'receipt'",
      [voucherId]
    )
  ).rows.map((r) => r.file_id);
  if (fileId && cur.length === 1 && cur[0] === fileId) return;
  if (cur.length) {
    const del = await tx.query(
      "DELETE FROM media_attachments WHERE entity_type = 'expense_voucher' AND entity_id = $1 AND purpose = 'receipt' AND ($2::uuid IS NULL OR file_id <> $2::uuid)",
      [voucherId, fileId]
    );
    if (del.rowCount !== cur.filter((f) => f !== fileId).length) throw forbidden("Bạn không được gỡ hóa đơn của phiếu này.");
  }
  if (fileId && !cur.includes(fileId)) await attachReceipt(tx, voucherId, fileId);
}

async function attachReceipt(tx: Tx, voucherId: string, fileId: string) {
  await tx.query(
    `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by)
     VALUES ($1, 'expense_voucher', $2, 'receipt', app.current_user_id())
     ON CONFLICT (entity_type, entity_id, file_id) DO NOTHING`,
    [fileId, voucherId]
  );
}

export async function createExpense(tx: Tx, b: CreateExpenseInput): Promise<string> {
  const c = await financeCaller(tx);
  if (!c.create) throw forbidden("Bạn không có quyền lập phiếu chi.");
  await assertNotFuture(tx, b.expenseDate, "Ngày chi");
  if (b.clientRequestId) {
    const dup = (
      await tx.query<{ id: string }>("SELECT id FROM expense_vouchers WHERE requested_by = app.current_user_id() AND client_request_id = $1", [
        b.clientRequestId,
      ])
    ).rows[0];
    if (dup) return dup.id;
  }
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO expense_vouchers (title, amount_vnd, category_id, expense_date, fund_id, paid_by_member_id, payee_name, invoice_no,
                                     note, no_receipt_reason, requested_by, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, app.current_user_id(), $11) RETURNING id`,
      [
        b.title,
        b.amountVnd,
        b.categoryId,
        b.expenseDate,
        b.fundId,
        b.paidByMemberId ?? null,
        b.payeeName ?? null,
        b.invoiceNo ?? null,
        b.note ?? null,
        b.receiptFileId ? null : b.noReceiptReason ?? null,
        b.clientRequestId ?? null,
      ]
    )
  ).rows[0].id;
  if (b.receiptFileId) await attachReceipt(tx, id, b.receiptFileId);
  if (b.submit) await tx.query("SELECT app.fn_submit_expense($1)", [id]);
  return id;
}

export async function updateExpense(tx: Tx, id: string, b: UpdateExpenseInput) {
  const c = await financeCaller(tx);
  const cur = (await tx.query<{ status: ExpenseStatus; requested_by: string }>("SELECT status::text AS status, requested_by FROM expense_vouchers WHERE id = $1", [id]))
    .rows[0];
  if (!cur) throw notFound("Không tìm thấy phiếu chi.");
  if (cur.requested_by !== c.uid) throw forbidden("Chỉ người lập phiếu mới được sửa phiếu chi.");
  if (!OWNER_EDITABLE.includes(cur.status)) throw new ApiError(422, "BR-FIN-05", "BR-FIN-05: phiếu đã duyệt/đã chi không được sửa nội dung.");
  // Phiếu đang chờ duyệt / bị từ chối: rút về nháp trước (chữ ký vòng cũ được giữ, nộp lại sang vòng mới)
  if (cur.status !== "draft") await tx.query("SELECT app.fn_return_expense_to_draft($1)", [id]);
  if (b.expenseDate) await assertNotFuture(tx, b.expenseDate, "Ngày chi");

  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.title !== undefined) set("title", b.title);
  if (b.amountVnd !== undefined) set("amount_vnd", b.amountVnd);
  if (b.categoryId !== undefined) set("category_id", b.categoryId);
  if (b.expenseDate !== undefined) set("expense_date", b.expenseDate);
  if (b.fundId !== undefined) set("fund_id", b.fundId);
  if (b.paidByMemberId !== undefined) set("paid_by_member_id", b.paidByMemberId);
  if (b.payeeName !== undefined) set("payee_name", b.payeeName);
  if (b.invoiceNo !== undefined) set("invoice_no", b.invoiceNo);
  if (b.note !== undefined) set("note", b.note);
  if (b.receiptFileId) set("no_receipt_reason", null);
  else if (b.noReceiptReason !== undefined) set("no_receipt_reason", b.noReceiptReason);
  if (sets.length) {
    const r = await tx.query(`UPDATE expense_vouchers SET ${sets.join(", ")} WHERE id = $1`, vals);
    if (!r.rowCount) throw forbidden("Bạn không được sửa phiếu chi này.");
  }
  if (b.receiptFileId !== undefined) await setReceipt(tx, id, b.receiptFileId);
  if (b.submit) await tx.query("SELECT app.fn_submit_expense($1)", [id]);
}

export type ExpenseAction = "submit" | "withdraw" | "decision" | "pay" | "cancel" | "reverse";

export async function expenseAction(
  tx: Tx,
  id: string,
  action: ExpenseAction,
  b: { decision?: "approved" | "rejected"; comment?: string | null; method?: string; paidOn?: string; reference?: string | null; proofFileId?: string | null; reason?: string }
) {
  const exists = (await tx.query("SELECT 1 FROM expense_vouchers WHERE id = $1", [id])).rowCount;
  if (!exists) throw notFound("Không tìm thấy phiếu chi (hoặc bạn không có quyền xem).");
  switch (action) {
    case "submit":
      await tx.query("SELECT app.fn_submit_expense($1)", [id]);
      return;
    case "withdraw":
      await tx.query("SELECT app.fn_return_expense_to_draft($1)", [id]);
      return;
    case "decision":
      await tx.query("SELECT app.fn_decide_expense($1, $2::approval_decision_t, $3)", [id, b.decision, b.comment ?? null]);
      return;
    case "pay":
      if (!b.paidOn || !b.method) throw badRequest("Thiếu ngày chi hoặc phương thức.");
      await assertNotFuture(tx, b.paidOn, "Ngày ghi chi");
      await tx.query("SELECT app.fn_pay_expense($1, $2::payment_method_t, $3::date, $4)", [id, b.method, b.paidOn, b.reference ?? null]);
      if (b.proofFileId) await attachReceipt(tx, id, b.proofFileId);
      return;
    case "cancel":
      await tx.query("SELECT app.fn_cancel_expense($1, $2)", [id, b.reason]);
      return;
    case "reverse":
      await tx.query("SELECT app.fn_reverse_expense($1, $2)", [id, b.reason]);
      return;
  }
}
