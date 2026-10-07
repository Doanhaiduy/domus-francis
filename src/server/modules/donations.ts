import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { zDate, zUuid } from "../http";
import { badRequest } from "../errors";
import { iso, isoOrNull, permissions } from "./community-shared";
import type { DonationDto, DonationListDto, DonationQuery, DonationSummary } from "@/lib/types/donations";

// Ủng hộ / quyên góp vào quỹ nhà. Ghi/xác nhận qua hàm CSDL app.fn_donation_* (kiểm quyền + ghi sổ quỹ + thông báo cùng giao dịch);
// đọc dưới RLS: thành viên chỉ thấy khoản của mình, người có finance.contribution.record thấy tất cả.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const zAmount = z
  .number({ error: "Số tiền phải là số." })
  .int("Số tiền phải là số nguyên (đồng).")
  .min(1, "Số tiền phải lớn hơn 0.")
  .max(1_000_000_000, "Số tiền tối đa 1.000.000.000đ.");
const zMethod = z.enum(["cash", "bank_transfer", "e_wallet", "other"], { error: "Hình thức không hợp lệ." });

/** Thủ quỹ / Trưởng nhà / Admin ghi nhận. received = đã nhận tiền (vào sổ quỹ ngay, cần fundId); false = ghi nhận trước, chờ nhận tiền. */
export const DonationRecordSchema = z
  .object({
    donorMemberId: zUuid.nullable().optional().transform((v) => v ?? null),
    donorName: optText(120),
    amountVnd: zAmount,
    donatedOn: zDate,
    method: zMethod.default("bank_transfer"),
    fundId: zUuid.nullable().optional().transform((v) => v ?? null),
    referenceCode: optText(100),
    note: optText(500),
    received: z.boolean(),
    clientRequestId: zUuid.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.donorMemberId && (v.donorName ?? "").length < 2) ctx.addIssue({ code: "custom", path: ["donorName"], message: "Chọn thành viên hoặc nhập tên người ủng hộ (ghi “Ẩn danh” nếu không muốn nêu tên)." });
    if (v.received && !v.fundId) ctx.addIssue({ code: "custom", path: ["fundId"], message: "Chọn túi quỹ nhận tiền." });
    if (v.received && v.method === "bank_transfer" && !v.referenceCode) ctx.addIssue({ code: "custom", path: ["referenceCode"], message: "Chuyển khoản đã nhận nên ghi mã giao dịch ngân hàng để đối chiếu." });
  });
export type DonationRecordInput = z.infer<typeof DonationRecordSchema>;

/** Thành viên tự báo khoản mình đã ủng hộ. */
export const DonationReportSchema = z.object({
  amountVnd: zAmount,
  donatedOn: zDate,
  method: zMethod.default("bank_transfer"),
  referenceCode: optText(100),
  note: optText(500),
});
export type DonationReportInput = z.infer<typeof DonationReportSchema>;

export const DonationActionSchema = z.object({
  action: z.enum(["confirm", "reject", "cancel", "withdraw"]),
  fundId: zUuid.nullable().optional(),
  note: optText(500),
});
export type DonationActionInput = z.infer<typeof DonationActionSchema>;

const SELECT = `
  SELECT d.id, d.donor_member_id, d.donor_name, d.amount_vnd, d.donated_on, d.method::text AS method, d.reference_code, d.note, d.status,
         d.self_reported, d.fund_id, f.name AS fund_name, d.decided_at, d.decision_note, d.created_at,
         (d.donor_member_id IS NOT NULL AND d.donor_member_id = app.current_member_id()) AS is_mine,
         (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = d.recorded_by LIMIT 1) AS recorder_name,
         (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = d.decided_by LIMIT 1) AS decider_name
    FROM donations d LEFT JOIN funds f ON f.id = d.fund_id`;

const toDto = (r: Row): DonationDto => ({
  id: r.id,
  donorMemberId: r.donor_member_id,
  donorName: r.donor_name,
  isMember: !!r.donor_member_id,
  amountVnd: Number(r.amount_vnd),
  donatedOn: iso(r.donated_on).slice(0, 10),
  method: r.method,
  referenceCode: r.reference_code,
  note: r.note,
  status: r.status,
  selfReported: !!r.self_reported,
  fundId: r.fund_id,
  fundName: r.fund_name ?? null,
  recordedByName: r.recorder_name ?? null,
  decidedByName: r.decider_name ?? null,
  decidedAt: isoOrNull(r.decided_at),
  decisionNote: r.decision_note,
  createdAt: iso(r.created_at),
  isMine: !!r.is_mine,
});

export function summarize(items: DonationDto[]): DonationSummary {
  const s: DonationSummary = { confirmedCount: 0, confirmedVnd: 0, donorCount: 0, memberDonorCount: 0, pendingCount: 0, pendingVnd: 0, pledgedCount: 0, pledgedVnd: 0 };
  const donors = new Set<string>();
  const memberDonors = new Set<string>();
  for (const d of items) {
    if (d.status === "confirmed") {
      s.confirmedCount++;
      s.confirmedVnd += d.amountVnd;
      donors.add(d.donorMemberId ? `m:${d.donorMemberId}` : `n:${d.donorName.trim().toLowerCase()}`);
      if (d.donorMemberId) memberDonors.add(d.donorMemberId);
    } else if (d.status === "pending") {
      s.pendingCount++;
      s.pendingVnd += d.amountVnd;
    } else if (d.status === "pledged") {
      s.pledgedCount++;
      s.pledgedVnd += d.amountVnd;
    }
  }
  s.donorCount = donors.size;
  s.memberDonorCount = memberDonors.size;
  return s;
}

export async function listDonations(tx: Tx, q: DonationQuery): Promise<DonationListDto> {
  const p = await permissions(tx, ["finance.contribution.record"] as const);
  const canRecord = p["finance.contribution.record"];
  const canViewAll = canRecord; // danh sách người ủng hộ + số tiền: chỉ người giữ sổ quỹ (Thủ quỹ, Trưởng nhà, Admin)
  const where: string[] = [];
  const vals: unknown[] = [];
  if (q.mine || !canViewAll) where.push("d.donor_member_id = app.current_member_id()");
  if (q.from) {
    vals.push(q.from);
    where.push(`d.donated_on >= $${vals.length}::date`);
  }
  if (q.to) {
    vals.push(q.to);
    where.push(`d.donated_on <= $${vals.length}::date`);
  }
  if (q.status === "open") where.push("d.status IN ('pledged', 'pending')");
  else if (q.status) {
    vals.push(q.status);
    where.push(`d.status = $${vals.length}`);
  }
  if (q.q?.trim()) {
    vals.push(`%${q.q.trim().replace(/[%_\\]/g, "")}%`);
    const n = vals.length;
    where.push(`(d.donor_name ILIKE $${n} OR COALESCE(d.note, '') ILIKE $${n} OR COALESCE(d.reference_code, '') ILIKE $${n})`);
  }
  const rows = (await tx.query(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY d.donated_on DESC, d.created_at DESC LIMIT 1000`, vals)).rows;
  const items = rows.map(toDto);
  return { canRecord, canViewAll, items, summary: summarize(items) };
}

export async function recordDonation(tx: Tx, b: DonationRecordInput): Promise<string> {
  const r = await tx.query<{ id: string }>("SELECT app.fn_donation_record($1, $2, $3, $4::date, $5::payment_method_t, $6, $7, $8, $9, $10) AS id", [
    b.donorMemberId,
    b.donorName,
    b.amountVnd,
    b.donatedOn,
    b.method,
    b.fundId,
    b.referenceCode,
    b.note,
    b.received,
    b.clientRequestId ?? null,
  ]);
  return r.rows[0].id;
}

export async function reportDonation(tx: Tx, b: DonationReportInput): Promise<string> {
  const r = await tx.query<{ id: string }>("SELECT app.fn_donation_report($1, $2::date, $3::payment_method_t, $4, $5) AS id", [b.amountVnd, b.donatedOn, b.method, b.referenceCode, b.note]);
  return r.rows[0].id;
}

export async function actOnDonation(tx: Tx, id: string, b: DonationActionInput): Promise<void> {
  if (b.action === "withdraw") {
    await tx.query("SELECT app.fn_donation_withdraw($1)", [id]);
    return;
  }
  if (b.action === "confirm" && !b.fundId) throw badRequest("Chọn túi quỹ nhận tiền.");
  await tx.query("SELECT app.fn_donation_decide($1, $2, $3, $4)", [id, b.action, b.fundId ?? null, b.note]);
}
