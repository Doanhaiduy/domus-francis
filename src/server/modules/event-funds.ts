import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { zDate, zUuid } from "../http";
import { badRequest } from "../errors";
import { iso, isoOrNull, permissions } from "./community-shared";
import { listExpenses } from "./finance-expenses";
import type {
  EventFundDetailDto,
  EventFundListDto,
  EventFundListItem,
  EventFundParticipant,
  EventFundReceipt,
  EventFundSettlement,
  EventFundSummary,
  SettlementMode,
} from "@/lib/types/event-funds";
import type { PaymentMethod } from "@/lib/types/finance";

// Quỹ riêng cho chuyến đi / sự kiện (db/app/1054). Mọi thao tác ghi đi qua hàm CSDL app.fn_event_fund_* / fn_fund_* (kiểm quyền, ghi sổ cái,
// thông báo cùng giao dịch); đọc qua hàm SECURITY DEFINER để che SĐT người ngoài và để người phụ trách (không có quyền đọc sổ cái) vẫn xem được quỹ mình.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => Number(v ?? 0);

const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} tối đa ${max} ký tự.`).nullable().optional().transform((v) => (v ? v : null));
const zAmount = z
  .number({ error: "Số tiền phải là số." })
  .int("Số tiền phải là số nguyên (đồng).")
  .min(1, "Số tiền phải lớn hơn 0.")
  .max(1_000_000_000, "Số tiền tối đa 1.000.000.000đ.");
const zDue = z
  .number({ error: "Mức phải đóng phải là số." })
  .int("Mức phải đóng phải là số nguyên (đồng).")
  .min(0, "Mức phải đóng không được âm.")
  .max(100_000_000, "Mức phải đóng tối đa 100.000.000đ.");
const zMethod = z.enum(["cash", "bank_transfer", "e_wallet", "other"], { error: "Hình thức thu không hợp lệ." });

/** Một dòng danh sách tham gia: thành viên (memberId) hoặc người ngoài (guestName + guestPhone tùy chọn). Có id ⇒ sửa/gỡ dòng đó. */
export const ParticipantItemSchema = z
  .object({
    id: zUuid.optional(),
    memberId: zUuid.optional(),
    guestName: optText(120, "Tên người ngoài"),
    guestPhone: optText(20, "Số điện thoại"),
    dueVnd: zDue.optional(),
    note: optText(300, "Ghi chú"),
    remove: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.id && !v.memberId && !v.guestName) ctx.addIssue({ code: "custom", message: "Mỗi dòng phải là thành viên hoặc người ngoài (có tên)." });
    if (!v.id && v.memberId && v.guestName) ctx.addIssue({ code: "custom", message: "Một dòng chỉ là thành viên HOẶC người ngoài." });
  });
export type ParticipantItem = z.infer<typeof ParticipantItemSchema>;

export const CreateEventFundSchema = z.object({
  eventId: zUuid,
  name: z.string().trim().min(3, "Tên quỹ tối thiểu 3 ký tự.").max(120, "Tên quỹ tối đa 120 ký tự."),
  managerIds: z.array(zUuid).min(1, "Chọn ít nhất một người phụ trách quỹ.").max(5, "Tối đa 5 người phụ trách."),
  defaultDueVnd: zDue.default(0),
  participants: z.array(ParticipantItemSchema).max(300, "Tối đa 300 người.").default([]),
  description: optText(500, "Mô tả"),
});
export type CreateEventFundInput = z.infer<typeof CreateEventFundSchema>;

export const ParticipantsSchema = z.object({
  items: z.array(ParticipantItemSchema).min(1, "Chưa có thay đổi nào.").max(300, "Tối đa 300 người mỗi lần."),
  defaultDueVnd: zDue.default(0),
});
export const ManagersSchema = z.object({ managerIds: z.array(zUuid).min(1, "Chọn ít nhất một người phụ trách quỹ.").max(5, "Tối đa 5 người phụ trách.") });

export const ReceiptSchema = z
  .object({
    participantId: zUuid.nullable().optional().transform((v) => v ?? null),
    payerName: optText(120, "Tên người đóng"),
    amountVnd: zAmount,
    method: zMethod.default("cash"),
    paidOn: zDate,
    referenceCode: optText(100, "Mã tham chiếu"),
    note: optText(300, "Ghi chú"),
    clientRequestId: zUuid.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.participantId && (v.payerName ?? "").length < 2) ctx.addIssue({ code: "custom", path: ["payerName"], message: "Chọn người trong danh sách hoặc nhập tên người đóng." });
  });
export const VoidReceiptSchema = z.object({ reason: z.string().trim().min(5, "Lý do hủy tối thiểu 5 ký tự.").max(300, "Lý do tối đa 300 ký tự.") });
export const CloseSchema = z.object({
  mode: z.enum(["refund", "to_house"], { error: "Chọn cách xử lý phần dư." }),
  note: optText(500, "Ghi chú"),
  targetFundId: zUuid.nullable().optional().transform((v) => v ?? null),
});
export const SubsidySchema = z.object({
  amountVnd: z.number({ error: "Số tiền phải là số." }).int("Số tiền phải là số nguyên (đồng).").min(1, "Số tiền phải lớn hơn 0.").max(100_000_000, "Mỗi lần bù tối đa 100.000.000đ."),
  reason: z.string().trim().min(10, "Hãy ghi rõ lý do bù (tối thiểu 10 ký tự).").max(300, "Lý do tối đa 300 ký tự."),
});

// ---------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------
const toListItem = (r: Row): EventFundListItem => ({
  id: r.fund_id,
  code: r.code,
  name: r.name,
  isActive: !!r.is_active,
  eventId: r.event_id ?? null,
  eventTitle: r.event_title ?? null,
  eventStartsAt: isoOrNull(r.event_starts_at),
  relation: r.relation,
  balanceVnd: r.balance_vnd == null ? null : n(r.balance_vnd),
  participantCount: r.participant_count == null ? null : n(r.participant_count),
  dueTotalVnd: r.due_total_vnd == null ? null : n(r.due_total_vnd),
  paidTotalVnd: r.paid_total_vnd == null ? null : n(r.paid_total_vnd),
  myDueVnd: r.my_due_vnd == null ? null : n(r.my_due_vnd),
  myPaidVnd: r.my_paid_vnd == null ? null : n(r.my_paid_vnd),
  createdAt: iso(r.created_at),
});

export async function listEventFunds(tx: Tx): Promise<EventFundListDto> {
  const rows = await tx.query<Row>("SELECT * FROM app.fn_event_fund_list()");
  const p = await permissions(tx, ["finance.fund.manage"] as const);
  return { items: rows.rows.map(toListItem), canCreate: p["finance.fund.manage"] };
}

const toParticipant = (r: Row): EventFundParticipant => ({
  id: r.participant_id,
  memberId: r.member_id ?? null,
  name: r.name,
  isGuest: !!r.is_guest,
  phone: r.guest_phone ?? null,
  dueVnd: n(r.due_vnd),
  paidVnd: n(r.paid_vnd),
  note: r.note ?? null,
  removed: !!r.removed_at,
});

const toReceipt = (r: Row): EventFundReceipt => ({
  id: r.receipt_id,
  participantId: r.participant_id ?? null,
  payerName: r.payer_name,
  amountVnd: n(r.amount_vnd),
  method: r.method as PaymentMethod,
  paidOn: String(r.paid_on instanceof Date ? r.paid_on.toISOString() : r.paid_on).slice(0, 10),
  referenceCode: r.reference_code ?? null,
  note: r.note ?? null,
  receivedByName: r.received_by_name ?? null,
  createdAt: iso(r.created_at),
  voidedAt: isoOrNull(r.voided_at),
  voidReason: r.void_reason ?? null,
});

function toSummary(j: Row): EventFundSummary {
  const f = j.fund as Row;
  const s = j.settlement as Row | null;
  const settlement: EventFundSettlement | null = s
    ? {
        mode: s.mode as SettlementMode,
        balanceVnd: n(s.balance_vnd),
        note: s.note ?? null,
        settledAt: iso(s.settled_at),
        targetFundName: s.target_fund_name ?? null,
        lines: ((s.lines ?? []) as Row[]).map((l) => ({ name: l.name, paidVnd: n(l.paid_vnd), amountVnd: n(l.amount_vnd) })),
      }
    : null;
  return {
    level: j.level,
    fund: {
      id: f.id,
      code: f.code,
      name: f.name,
      isActive: !!f.is_active,
      description: f.description ?? null,
      eventId: f.event_id ?? null,
      eventTitle: f.event_title ?? null,
      eventStartsAt: f.event_starts_at ? iso(f.event_starts_at) : null,
      createdAt: iso(f.created_at),
    },
    balanceVnd: n(j.balance_vnd),
    receiptsVnd: n(j.receipts_vnd),
    spentVnd: n(j.spent_vnd),
    subsidyVnd: n(j.subsidy_vnd),
    refundedVnd: n(j.refunded_vnd),
    participants: { count: n(j.participants?.count), dueVnd: n(j.participants?.due_vnd), paidFull: n(j.participants?.paid_full), paidPartial: n(j.participants?.paid_partial) },
    pendingVouchers: n(j.pending_vouchers),
    managers: ((j.managers ?? []) as Row[]).map((m) => ({ memberId: m.member_id, name: m.name })),
    settlement,
  };
}

/**
 * Chi tiết một quỹ riêng. Người phụ trách / người quản lý quỹ nhà: đầy đủ (tóm tắt, danh sách tham gia kèm SĐT người ngoài, phiếu thu, phiếu chi).
 * Thành viên chỉ có tên trong danh sách: chỉ dòng và phiếu thu của chính mình (summary = null).
 */
export async function getEventFund(tx: Tx, id: string): Promise<EventFundDetailDto> {
  const lvl = await tx.query<{ l: string | null }>("SELECT app.fn_event_fund_level($1) AS l", [id]);
  const perms = await permissions(tx, ["finance.fund.manage", "finance.ledger.adjust"] as const);
  const level = lvl.rows[0]?.l ?? null;
  const roster = await tx.query<Row>("SELECT * FROM app.fn_event_fund_roster($1)", [id]);
  const receipts = await tx.query<Row>("SELECT * FROM app.fn_event_fund_receipts($1)", [id]);
  let summary: EventFundSummary | null = null;
  let expenses: EventFundDetailDto["expenses"] = [];
  if (level) {
    summary = toSummary((await tx.query<{ s: Row }>("SELECT app.fn_event_fund_summary($1) AS s", [id])).rows[0].s);
    expenses = await listExpenses(tx, { fundId: id });
  }
  const base = summary
    ? { id: summary.fund.id, name: summary.fund.name, isActive: summary.fund.isActive, eventTitle: summary.fund.eventTitle }
    : await (async () => {
        const f = (await tx.query<Row>("SELECT * FROM app.fn_event_fund_list() WHERE fund_id = $1", [id])).rows[0];
        if (!f) throw badRequest("Không tìm thấy quỹ này.");
        return { id: f.fund_id as string, name: f.name as string, isActive: !!f.is_active, eventTitle: (f.event_title as string | null) ?? null };
      })();
  const active = base.isActive;
  return {
    summary,
    fund: base,
    roster: roster.rows.map(toParticipant),
    receipts: receipts.rows.map(toReceipt),
    expenses,
    can: {
      operate: !!level && active,
      closeFund: perms["finance.fund.manage"] && active,
      subsidy: perms["finance.ledger.adjust"] && active,
    },
  };
}

// ---------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------
const itemToDb = (i: ParticipantItem) => ({
  id: i.id ?? null,
  member_id: i.memberId ?? null,
  guest_name: i.guestName ?? null,
  guest_phone: i.guestPhone ?? null,
  due_vnd: i.dueVnd ?? null,
  ...(i.note !== undefined ? { note: i.note } : {}),
  ...(i.remove ? { remove: true } : {}),
});

export async function createEventFund(tx: Tx, b: CreateEventFundInput): Promise<{ fundId: string; code: string; name: string }> {
  const r = await tx.query<{ r: Row }>("SELECT app.fn_event_fund_create($1, $2, $3::uuid[], $4, $5::jsonb, $6) AS r", [
    b.eventId,
    b.name,
    b.managerIds,
    b.defaultDueVnd,
    JSON.stringify(b.participants.map(itemToDb)),
    b.description,
  ]);
  const j = r.rows[0].r;
  return { fundId: j.fund_id, code: j.code, name: j.name };
}

export async function setParticipants(tx: Tx, id: string, b: z.infer<typeof ParticipantsSchema>): Promise<number> {
  const r = await tx.query<{ n: number }>("SELECT app.fn_event_fund_set_participants($1, $2::jsonb, $3) AS n", [id, JSON.stringify(b.items.map(itemToDb)), b.defaultDueVnd]);
  return r.rows[0].n;
}

export async function setManagers(tx: Tx, id: string, b: z.infer<typeof ManagersSchema>): Promise<void> {
  await tx.query("SELECT app.fn_event_fund_set_managers($1, $2::uuid[])", [id, b.managerIds]);
}

export async function receive(tx: Tx, id: string, b: z.infer<typeof ReceiptSchema>): Promise<string> {
  const r = await tx.query<{ id: string }>("SELECT app.fn_fund_receive($1, $2, $3, $4, $5::payment_method_t, $6::date, $7, $8, $9) AS id", [
    id,
    b.participantId,
    b.payerName,
    b.amountVnd,
    b.method,
    b.paidOn,
    b.referenceCode,
    b.note,
    b.clientRequestId ?? null,
  ]);
  return r.rows[0].id;
}

export async function voidReceipt(tx: Tx, receiptId: string, b: z.infer<typeof VoidReceiptSchema>): Promise<void> {
  await tx.query("SELECT app.fn_fund_void_receipt($1, $2)", [receiptId, b.reason]);
}

export async function closeEventFund(tx: Tx, id: string, b: z.infer<typeof CloseSchema>) {
  const r = await tx.query<{ c: Row }>("SELECT app.fn_event_fund_close($1, $2, $3, $4) AS c", [id, b.mode, b.note, b.targetFundId]);
  const c = r.rows[0].c;
  return { settlementId: c.settlement_id as string, mode: c.mode as SettlementMode, balanceVnd: n(c.balance_vnd), lines: n(c.lines) };
}

export async function houseSubsidy(tx: Tx, id: string, b: z.infer<typeof SubsidySchema>): Promise<void> {
  await tx.query("SELECT app.fn_event_fund_house_subsidy($1, $2, $3)", [id, b.amountVnd, b.reason]);
}
