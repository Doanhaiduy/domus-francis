import "server-only";
import type { Tx } from "../db";
import type { Ctx } from "../http";
import { recordErrorEvent } from "../ops";
import { formatVND } from "@/lib/utils";
import { expenseLink, PAYMENT_METHOD_LABEL, periodLink, type PaymentMethod } from "@/lib/types/finance";

// =====================================================================
// Thông báo của phân hệ Thu chi (phiếu chi, chốt sổ) — gửi SAU KHI thao tác chính đã ghi xong, trong transaction riêng vai trò
// luuxa_worker (luuxa_app không gọi được app.fn_notify). Gửi lỗi ⇒ chỉ ghi nhật ký lỗi, KHÔNG làm hỏng thao tác chính.
// Không bao giờ báo cho chính người vừa thao tác. Payload luôn có `link` trỏ đúng chỗ xử lý (thông báo đẩy / email dùng link này).
// =====================================================================

type NotifyCtx = Pick<Ctx, "dbAs" | "userId" | "requestId">;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Sự kiện của phiếu chi cần báo:
 *  submitted — vừa gửi duyệt (lập + gửi, sửa + gửi lại, bấm Gửi duyệt) ⇒ những người còn ký được vòng hiện tại
 *  decided   — vừa ký duyệt / từ chối ⇒ (đủ chữ ký) người lập + người ứng tiền + người ghi chi; (mới 1/2) người còn ký được;
 *              (từ chối) người lập + người ứng tiền
 *  withdrawn — người lập rút phiếu về nháp ⇒ người ứng tiền
 *  paid      — Thủ quỹ đã chi / hoàn ứng ⇒ người lập + người ứng tiền
 *  cancelled / reversed — phiếu bị hủy / đảo bút toán ⇒ người lập + người ứng tiền */
export type ExpenseEvent = "submitted" | "decided" | "withdrawn" | "paid" | "cancelled" | "reversed";

async function safely(ctx: NotifyCtx, what: string, fn: (tx: Tx) => Promise<number>): Promise<number> {
  try {
    return await ctx.dbAs("luuxa_worker", fn);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error(`[finance-notify] ${what} lỗi:`, msg);
    await recordErrorEvent({ source: "server", route: `notify:${what}`, code: "NOTIFY_FAILED", message: msg, requestId: ctx.requestId, userId: ctx.userId });
    return 0;
  }
}

/** Gửi một thông báo cho nhiều thành viên (bỏ trùng). Loại thông báo chưa có (CSDL chưa nâng cấp) ⇒ dùng loại dự phòng. */
async function send(
  tx: Tx,
  members: (string | null | undefined)[],
  type: string,
  fallbackType: string,
  title: string,
  body: string,
  link: string,
  entity: { table: string; id: string }
): Promise<number> {
  const ids = [...new Set(members.filter((m): m is string => !!m))];
  if (!ids.length) return 0;
  const has = (await tx.query("SELECT 1 FROM notification_types WHERE code = $1 AND is_active", [type])).rowCount;
  const r = await tx.query(
    `SELECT app.fn_notify(x.m, $2, $3, $4, $5::jsonb, $6, $7::uuid) FROM unnest($1::uuid[]) AS x(m)`,
    [ids, has ? type : fallbackType, title.slice(0, 200), body.slice(0, 1000), JSON.stringify({ link }), entity.table, entity.id]
  );
  return r.rowCount ?? ids.length;
}

const VOUCHER_SQL = `SELECT ev.id, ev.voucher_no, ev.title, ev.amount_vnd, ev.status::text AS status, ev.required_approvals, ev.approval_round,
        app.fn_fund_is_event(ev.fund_id) AS is_event_fund,
        ev.rejection_reason, ev.cancel_reason, ev.payment_method::text AS payment_method, ev.payee_name,
        rm.id AS requester_mid, COALESCE(rm.display_name, rm.full_name) AS requester_name,
        pm.id AS payee_mid, pm.user_id AS payee_uid, COALESCE(pm.display_name, pm.full_name) AS payee_name_member,
        (SELECT count(*)::int FROM expense_approvals ea WHERE ea.voucher_id = ev.id AND ea.round = ev.approval_round AND ea.decision = 'approved') AS approved_count,
        (SELECT h.reason FROM expense_status_history h WHERE h.voucher_id = ev.id AND h.to_status = 'reversed' ORDER BY h.changed_at DESC LIMIT 1) AS reversal_reason,
        (SELECT le.entry_date::text FROM ledger_entries le WHERE le.id = ev.ledger_entry_id) AS paid_on,
        (SELECT m.id FROM members m WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL LIMIT 1) AS actor_mid,
        (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL LIMIT 1) AS actor_name
   FROM expense_vouchers ev
   LEFT JOIN members rm ON rm.user_id = ev.requested_by AND rm.deleted_at IS NULL AND rm.status IN ('active', 'on_leave')
   LEFT JOIN members pm ON pm.id = ev.paid_by_member_id AND pm.deleted_at IS NULL AND pm.status IN ('active', 'on_leave')
  WHERE ev.id = $1`;

const vnd = (v: unknown) => formatVND(Number(v ?? 0));

/** Người nhận theo quyền / theo luật chữ ký: bỏ người vừa thao tác; ưu tiên người giữ vai trò nghiệp vụ (Trưởng nhà, Thủ quỹ…) —
 *  chỉ báo người có quyền NHỜ vai trò Admin khi không còn ai khác (Admin không bị ngập thông báo nghiệp vụ). */
function preferRoleHolders(rows: { member_id: string; via_admin: boolean }[], actorMid: string | null | undefined): string[] {
  // Chọn nhóm TRƯỚC khi bỏ người thao tác: Thủ quỹ tự duyệt rồi tự chi thì không cần báo ai "chờ chi" (không đẩy sang Admin)
  const own = rows.filter((r) => !r.via_admin);
  const pool = own.length ? own : rows;
  return [...new Set(pool.filter((r) => r.member_id !== actorMid).map((r) => r.member_id))];
}

/** Báo tin về một phiếu chi sau khi thao tác đã ghi xong. Trả số thông báo đã tạo (0 nếu lỗi / không có ai cần báo). */
export function notifyExpense(ctx: NotifyCtx, voucherId: string, event: ExpenseEvent): Promise<number> {
  return safely(ctx, `expense:${event}`, async (tx) => {
    const v = (await tx.query<Row>(VOUCHER_SQL, [voucherId])).rows[0];
    if (!v) return 0;
    const link = expenseLink(v.id);
    const entity = { table: "expense_vouchers", id: v.id as string };
    const not = (ids: (string | null | undefined)[]) => ids.filter((m) => m && m !== v.actor_mid);
    const owners = not([v.requester_mid, v.payee_mid]);
    const amount = vnd(v.amount_vnd);
    const payee = v.payee_name_member ?? null;
    const signers = async () =>
      preferRoleHolders((await tx.query<{ member_id: string; via_admin: boolean }>("SELECT member_id, via_admin FROM app.fn_expense_signers($1)", [v.id])).rows, v.actor_mid);

    switch (event) {
      case "submitted": {
        if (v.status !== "pending_approval") return 0;
        const who = v.requester_name ?? "Một thành viên";
        return send(
          tx,
          await signers(),
          "finance.expense_pending",
          "finance.expense_pending",
          `Phiếu chi ${v.voucher_no} chờ bạn duyệt`,
          `${who} đề xuất chi “${v.title}” — ${amount}${Number(v.required_approvals) === 2 ? " (cần 2 chữ ký)" : ""}${payee ? ` · người ứng tiền: ${payee}` : ""}.`,
          link,
          entity
        );
      }
      case "decided": {
        if (v.status === "pending_approval") {
          // Mới đủ 1/2 chữ ký ⇒ báo người còn ký được (chữ ký thứ hai)
          return send(
            tx,
            await signers(),
            "finance.expense_pending",
            "finance.expense_pending",
            `Phiếu chi ${v.voucher_no} cần chữ ký thứ hai`,
            `${v.actor_name ?? "Người duyệt"} đã ký ${v.approved_count}/${v.required_approvals} — “${v.title}” ${amount}.`,
            link,
            entity
          );
        }
        if (v.status === "rejected") {
          return send(
            tx,
            owners,
            "finance.expense_decided",
            "finance.expense_decided",
            `Phiếu chi ${v.voucher_no} bị từ chối`,
            `“${v.title}” ${amount}. Lý do: ${v.rejection_reason ?? "—"}. Sửa rồi gửi lại nếu cần.`,
            link,
            entity
          );
        }
        if (v.status === "approved") {
          let sent = await send(
            tx,
            owners,
            "finance.expense_decided",
            "finance.expense_decided",
            `Phiếu chi ${v.voucher_no} đã được duyệt`,
            v.is_event_fund
              ? `“${v.title}” ${amount} đã đủ chữ ký — người phụ trách quỹ ghi nhận đã chi khi giao tiền.`
              : `“${v.title}” ${amount} đã đủ chữ ký — chờ Thủ quỹ ${payee ? "hoàn ứng" : "chi"}.`,
            link,
            entity
          );
          // Quỹ riêng: người phụ trách (người lập phiếu) tự ghi chi — không báo Thủ quỹ "chờ chi"
          if (v.is_event_fund) return sent;
          // Người ghi chi (Thủ quỹ…) — trừ người vừa duyệt và người đã được báo ở trên
          const payers = preferRoleHolders(
            (await tx.query<{ member_id: string; via_admin: boolean }>("SELECT member_id, via_admin FROM app.fn_members_with_permission('finance.expense.pay')")).rows,
            v.actor_mid
          ).filter((m) => !owners.includes(m));
          sent += await send(
            tx,
            payers,
            "finance.expense_decided",
            "finance.expense_decided",
            `Phiếu chi ${v.voucher_no} đã đủ chữ ký — chờ chi`,
            `“${v.title}” ${amount}${payee ? ` · hoàn ứng cho ${payee}` : ""}. Ghi nhận đã chi khi giao tiền.`,
            link,
            entity
          );
          return sent;
        }
        return 0;
      }
      case "withdrawn":
        if (v.status !== "draft") return 0;
        return send(
          tx,
          not([v.payee_mid]),
          "finance.expense_decided",
          "finance.expense_decided",
          `Phiếu chi ${v.voucher_no} được rút về nháp để sửa`,
          `${v.requester_name ?? "Người lập"} đã rút phiếu “${v.title}” (${amount}) về nháp — phiếu sẽ được gửi duyệt lại sau khi sửa.`,
          link,
          entity
        );
      case "paid": {
        if (v.status !== "paid") return 0;
        const method = v.payment_method ? PAYMENT_METHOD_LABEL[v.payment_method as PaymentMethod]?.toLowerCase() : null;
        const on = v.paid_on ? ` ngày ${String(v.paid_on).split("-").reverse().join("/")}` : "";
        let sent = 0;
        // Người ứng tiền: được hoàn ứng
        if (v.payee_mid && v.payee_mid !== v.actor_mid)
          sent += await send(
            tx,
            [v.payee_mid],
            "finance.expense_paid",
            "finance.expense_decided",
            `Đã hoàn ứng ${amount} cho bạn`,
            `Phiếu chi ${v.voucher_no} “${v.title}” đã chi${method ? ` (${method})` : ""}${on}. Kiểm tra lại số tiền đã nhận nhé.`,
            link,
            entity
          );
        // Người lập phiếu (nếu khác người ứng tiền)
        if (v.requester_mid && v.requester_mid !== v.payee_mid && v.requester_mid !== v.actor_mid)
          sent += await send(
            tx,
            [v.requester_mid],
            "finance.expense_paid",
            "finance.expense_decided",
            `Phiếu chi ${v.voucher_no} đã chi ${amount}`,
            `“${v.title}” đã được ${payee ? `hoàn ứng cho ${payee}` : "chi"}${method ? ` (${method})` : ""}${on}.`,
            link,
            entity
          );
        return sent;
      }
      case "cancelled":
        if (v.status !== "cancelled") return 0;
        return send(
          tx,
          owners,
          "finance.expense_decided",
          "finance.expense_decided",
          `Phiếu chi ${v.voucher_no} đã bị hủy`,
          `“${v.title}” ${amount}. Lý do: ${v.cancel_reason ?? "—"}.`,
          link,
          entity
        );
      case "reversed":
        if (v.status !== "reversed") return 0;
        return send(
          tx,
          owners,
          "finance.expense_decided",
          "finance.expense_decided",
          `Phiếu chi ${v.voucher_no} đã được đảo bút toán`,
          `“${v.title}” ${amount} — sổ quỹ đã ghi bút toán đảo (tiền về lại quỹ). Lý do: ${v.reversal_reason ?? "—"}.`,
          link,
          entity
        );
    }
    return 0;
  });
}

// ---------------------------------------------------------------------
// Chốt sổ tháng
// ---------------------------------------------------------------------
export type PeriodEvent = "closed" | "confirmed" | "reopened";

const mmYYYY = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

/** Báo tin chốt sổ: chốt (bước 1) ⇒ người xác nhận được; xác nhận ⇒ người đã chốt + người ghi sổ; mở lại ⇒ người chốt + xác nhận + người ghi sổ. */
export function notifyPeriod(ctx: NotifyCtx, month: string, event: PeriodEvent, extra: { reason?: string | null; closingVnd?: number | null } = {}): Promise<number> {
  return safely(ctx, `period:${event}`, async (tx) => {
    const p = (
      await tx.query<Row>(
        `SELECT fp.id, fp.status::text AS status,
                (SELECT m.id FROM members m WHERE m.user_id = fp.closed_by AND m.deleted_at IS NULL LIMIT 1) AS closer_mid,
                (SELECT m.id FROM members m WHERE m.user_id = fp.confirmed_by AND m.deleted_at IS NULL LIMIT 1) AS confirmer_mid,
                (SELECT m.id FROM members m WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL LIMIT 1) AS actor_mid,
                (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL LIMIT 1) AS actor_name
           FROM financial_periods fp WHERE fp.period_month = $1::date`,
        [`${month}-01`]
      )
    ).rows[0];
    if (!p) return 0;
    const link = periodLink(month);
    const entity = { table: "financial_periods", id: p.id as string };
    const who = p.actor_name ?? "Người quản lý";
    const withPerm = async (perm: string) =>
      preferRoleHolders((await tx.query<{ member_id: string; via_admin: boolean }>("SELECT member_id, via_admin FROM app.fn_members_with_permission($1)", [perm])).rows, p.actor_mid);
    const not = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((m): m is string => !!m && m !== p.actor_mid))];

    if (event === "closed") {
      if (p.status !== "pending_confirmation") return 0;
      return send(
        tx,
        not(await withPerm("finance.period.confirm")),
        "finance.period_pending",
        "finance.period_pending",
        `Sổ quỹ tháng ${mmYYYY(month)} chờ bạn xác nhận chốt`,
        `${who} đã chốt sổ${extra.closingVnd !== null && extra.closingVnd !== undefined ? ` — tồn cuối tháng ${formatVND(extra.closingVnd)}` : ""}. Kiểm tra số liệu rồi bấm “Xác nhận chốt” (người xác nhận phải khác người chốt).`,
        link,
        entity
      );
    }
    if (event === "confirmed") {
      if (p.status !== "closed") return 0;
      return send(
        tx,
        not([p.closer_mid, ...(await withPerm("finance.period.close"))]),
        "finance.period_closed",
        "finance.period_pending",
        `Sổ quỹ tháng ${mmYYYY(month)} đã chốt`,
        `${who} đã xác nhận chốt sổ. Từ nay không ghi thêm hay ghi lùi ngày vào tháng này (sai sót ghi điều chỉnh ở tháng đang mở).`,
        link,
        entity
      );
    }
    if (p.status !== "open") return 0;
    return send(
      tx,
      not([p.closer_mid, p.confirmer_mid, ...(await withPerm("finance.period.close"))]),
      "finance.period_closed",
      "finance.period_pending",
      `Sổ quỹ tháng ${mmYYYY(month)} đã được mở lại`,
      `${who} mở lại sổ${extra.reason ? `. Lý do: ${extra.reason}` : ""}. Sửa xong cần chốt và xác nhận lại.`,
      link,
      entity
    );
  });
}
