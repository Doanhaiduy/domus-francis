import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { financeCaller, type FinanceCaller } from "./finance";
import type { CreateExpenseInput, ExpenseItemInput, UpdateExpenseInput } from "./finance-schema";
import type { ExpenseDetailDto, ExpenseDto, ExpenseStatus, PaymentMethod, SplitAlertsDto } from "@/lib/types/finance";

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
         -- Ký được theo đúng luật của trigger tg_expense_approval_rules (gồm chế độ ký chéo, Admin ký như Trưởng nhà/Thủ quỹ) — cùng hàm
         -- với hộp "Việc cần xử lý" (db/app/1044) nên nút Duyệt luôn khớp số việc
         CASE WHEN ev.status = 'pending_approval' THEN app.fn_expense_can_sign(ev.id) ELSE false END AS can_sign,
         COALESCE((SELECT json_agg(json_build_object('fileId', ma.file_id, 'mime', sf.detected_mime) ORDER BY ma.position, ma.created_at)
                     FROM media_attachments ma LEFT JOIN storage_files sf ON sf.id = ma.file_id
                    WHERE ma.entity_type = 'expense_voucher' AND ma.entity_id = ev.id AND ma.purpose = 'receipt'), '[]'::json) AS receipts,
         COALESCE((SELECT json_agg(json_build_object('id', i.id, 'position', i.position, 'name', i.name, 'quantity', i.quantity, 'unit', i.unit,
                                                     'unitPriceVnd', i.unit_price_vnd, 'amountVnd', i.amount_vnd) ORDER BY i.position)
                     FROM expense_voucher_items i WHERE i.voucher_id = ev.id), '[]'::json) AS items
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
    items: (r.items as ExpenseDto["items"]).map((i) => ({ ...i, quantity: Number(i.quantity), unitPriceVnd: Number(i.unitPriceVnd), amountVnd: Number(i.amountVnd) })),
    can: {
      edit: mine && OWNER_EDITABLE.includes(status),
      submit: mine && status === "draft",
      withdraw: mine && (status === "pending_approval" || status === "rejected"),
      // Ký duyệt được: hàm CSDL app.fn_expense_can_sign (BR-FIN-01/02/17 + ký chéo) — trước đây tự tính ở đây nên bỏ sót chế độ ký chéo
      approve: mayDecide && !!r.can_sign,
      reject: mayDecide,
      pay: c.pay && status === "approved",
      cancel: (mine && OWNER_EDITABLE.includes(status)) || (c.approve && (status === "pending_approval" || status === "approved")),
      reverse: c.reverse && status === "paid",
      correct: c.correct && status !== "cancelled",
      purge: c.purge && status === "cancelled",
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

/** Thành tiền một món (làm tròn nửa lên) — CHỈ để ước tính số tiền ban đầu của phiếu; số chính thức là tổng amount_vnd do CSDL tính. */
const estimateItem = (it: ExpenseItemInput) => Math.round((Math.round(it.quantity * 1000) * it.unitPriceVnd) / 1000);

/** Thay toàn bộ các món của phiếu (đang nháp) rồi đồng bộ số tiền phiếu = tổng các món. items rỗng ⇒ chỉ xóa món. */
async function replaceItems(tx: Tx, voucherId: string, items: ExpenseItemInput[]) {
  await tx.query("DELETE FROM expense_voucher_items WHERE voucher_id = $1", [voucherId]);
  if (!items.length) return;
  await tx.query(
    `INSERT INTO expense_voucher_items (voucher_id, position, name, quantity, unit, unit_price_vnd)
     SELECT $1, t.ord::smallint, t.name, t.qty, t.unit, t.price
       FROM unnest($2::text[], $3::numeric[], $4::text[], $5::bigint[]) WITH ORDINALITY AS t(name, qty, unit, price, ord)`,
    [voucherId, items.map((i) => i.name), items.map((i) => i.quantity), items.map((i) => i.unit ?? null), items.map((i) => i.unitPriceVnd)]
  );
  // Số tiền phiếu = tổng thành tiền các món (CSDL là nguồn chính thức, không phụ thuộc cách làm tròn ở trình duyệt)
  await tx.query(
    `UPDATE expense_vouchers SET amount_vnd = s.total
       FROM (SELECT sum(amount_vnd)::bigint AS total FROM expense_voucher_items WHERE voucher_id = $1) s
      WHERE id = $1 AND amount_vnd IS DISTINCT FROM s.total`,
    [voucherId]
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
        b.items?.length ? b.items.reduce((sum, i) => sum + estimateItem(i), 0) : b.amountVnd,
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
  if (b.items?.length) await replaceItems(tx, id, b.items);
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
  if (!OWNER_EDITABLE.includes(cur.status)) throw new ApiError(422, "BR-FIN-05", "Phiếu đã duyệt/đã chi không được sửa nội dung.");
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
  if (b.items !== undefined) await replaceItems(tx, id, b.items);
  if (b.receiptFileId !== undefined) await setReceipt(tx, id, b.receiptFileId);
  if (b.submit) await tx.query("SELECT app.fn_submit_expense($1)", [id]);
}

export type ExpenseAction = "submit" | "withdraw" | "decision" | "pay" | "cancel" | "reverse" | "correct";

export async function expenseAction(
  tx: Tx,
  id: string,
  action: ExpenseAction,
  b: { decision?: "approved" | "rejected"; comment?: string | null; method?: string; paidOn?: string; reference?: string | null; proofFileId?: string | null; reason?: string; changePaidBy?: boolean; paidByMemberId?: string | null }
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
    case "correct":
      // Admin sửa người ứng tiền / hình thức chi; sổ quỹ bất biến nên không đổi (kiểm quyền + ghi kiểm toán trong hàm DB)
      await tx.query("SELECT app.fn_admin_fix_expense($1, $2, $3, $4, $5::payment_method_t)", [
        id,
        b.reason,
        !!b.changePaidBy,
        b.changePaidBy ? b.paidByMemberId ?? null : null,
        b.method ?? null,
      ]);
      return;
  }
}

// ---------------------------------------------------------------------
// Cảnh báo tách phiếu chi (view v_expense_split_alerts): ≥ 2 phiếu MỘT chữ ký cho cùng đối tượng trong một tuần có tổng ≥ ngưỡng
// 2 chữ ký (nghi chia nhỏ để né duyệt 2 người). Chỉ người duyệt chi / xem mọi phiếu chi. View thiếu (CSDL chưa vá) ⇒ danh sách rỗng.
// ---------------------------------------------------------------------
export async function listSplitAlerts(tx: Tx, days: number): Promise<SplitAlertsDto> {
  const c = await financeCaller(tx);
  if (!c.approve && !c.readAll) throw forbidden("Chỉ người duyệt chi xem được cảnh báo tách phiếu.");
  const span = Math.min(365, Math.max(7, Math.round(days) || 60));
  const threshold = (
    await tx.query<{ v: string | null }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'finance.expense.dual_approval_min_vnd'")
  ).rows[0]?.v;
  await tx.query("SAVEPOINT split_alerts");
  let alerts: Row[] = [];
  try {
    alerts = (
      await tx.query(
        `SELECT a.counterparty, a.week_start::text AS week_start, (a.week_start + 6)::text AS week_end, a.total_vnd, a.max_single_vnd, a.voucher_nos
           FROM v_expense_split_alerts a
          WHERE a.week_start >= app.local_today() - $1::int
          ORDER BY a.week_start DESC, a.total_vnd DESC
          LIMIT 50`,
        [span]
      )
    ).rows;
    await tx.query("RELEASE SAVEPOINT split_alerts");
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT split_alerts");
    if ((e as { code?: string }).code !== "42P01") throw e; // view chưa có
  }
  const nos = [...new Set(alerts.flatMap((a) => a.voucher_nos as string[]))];
  const vouchers = nos.length
    ? (
        await tx.query(
          `SELECT ev.id, ev.voucher_no, ev.title, ev.amount_vnd, ev.status::text AS status, ev.expense_date::text AS expense_date,
                  ev.paid_by_member_id, ev.payee_name,
                  (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.id = ev.paid_by_member_id) AS payee_member,
                  (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = ev.requested_by LIMIT 1) AS requester
             FROM expense_vouchers ev WHERE ev.voucher_no = ANY ($1::text[])`,
          [nos]
        )
      ).rows
    : [];
  const byNo = new Map(vouchers.map((v) => [v.voucher_no as string, v]));
  return {
    thresholdVnd: threshold === null || threshold === undefined ? null : Number(threshold),
    days: span,
    alerts: alerts.map((a) => {
      const vs = (a.voucher_nos as string[]).map((no) => byNo.get(no)).filter(Boolean) as Row[];
      const first = vs[0];
      const who = first?.payee_member ?? first?.payee_name ?? first?.requester ?? "Không rõ";
      return {
        key: `${a.counterparty}:${a.week_start}`,
        counterparty: String(who),
        weekStart: a.week_start,
        weekEnd: a.week_end,
        totalVnd: Number(a.total_vnd),
        maxSingleVnd: Number(a.max_single_vnd),
        vouchers: vs.map((v) => ({
          id: v.id,
          voucherNo: v.voucher_no,
          title: v.title,
          amountVnd: Number(v.amount_vnd),
          status: v.status as ExpenseStatus,
          expenseDate: v.expense_date,
        })),
      };
    }),
  };
}
