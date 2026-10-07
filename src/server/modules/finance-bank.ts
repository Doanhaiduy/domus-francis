import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../errors";
import { permissions } from "./community-shared";
import { recordPayment } from "./finance-contributions";
import type { BankLineDto, BankLinesDto, BankSuggestionDto } from "@/lib/types/bank";

// Giao dịch ngân hàng tự động: dịch vụ báo biến động số dư (SePay / Casso) gọi webhook khi có giao dịch ⇒ lưu thành dòng sao kê
// (bank_statement_lines, chưa khớp). Hệ thống GỢI Ý khoản phải thu tương ứng (tên + mã kế hoạch + số tiền); Thủ quỹ bấm xác nhận
// thì mới ghi phiếu thu thật (không bao giờ tự ghi sổ từ webhook — tiền là việc của con người xác nhận).

type Row = Record<string, any>;

// ---------------------------------------------------------------------
// Webhook: xác thực + chuẩn hóa dữ liệu
// ---------------------------------------------------------------------
export const webhookEnabled = () => (process.env.BANK_WEBHOOK_SECRET ?? "").length >= 16;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** So khớp bí mật theo thời gian không đổi. Chấp nhận: `Authorization: Apikey <khóa>` (SePay), `secure-token` (Casso), `x-webhook-secret`. */
export function verifyWebhookSecret(headers: Headers): boolean {
  const secret = process.env.BANK_WEBHOOK_SECRET ?? "";
  if (secret.length < 16) return false;
  const auth = headers.get("authorization") ?? "";
  const given = [auth.replace(/^(apikey|bearer)\s+/i, ""), headers.get("secure-token") ?? "", headers.get("x-webhook-secret") ?? ""];
  const want = sha(secret);
  return given.some((g) => g.length > 0 && timingSafeEqual(sha(g), want));
}

export interface BankTxn {
  provider: "sepay" | "casso";
  reference: string;
  date: string; // YYYY-MM-DD (giờ VN)
  direction: "in" | "out";
  amountVnd: number;
  description: string;
  balanceAfterVnd: number | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** "2026-10-06 14:30:00" (giờ VN, không múi giờ) hoặc ISO có múi giờ ⇒ ngày giờ VN YYYY-MM-DD. */
function vnDate(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s.slice(0, 10);
  const t = s ? Date.parse(s) : NaN;
  const d = Number.isNaN(t) ? new Date() : new Date(t);
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

const fallbackRef = (p: string, parts: unknown[]) => `${p}-${createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 20)}`;

/** Nhận diện và chuẩn hóa payload của SePay hoặc Casso (null nếu không nhận ra). */
export function parseBankWebhook(body: unknown): BankTxn[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Row;
  const out: BankTxn[] = [];

  // SePay: một giao dịch mỗi lần gọi
  if (typeof b.transferType === "string") {
    const amount = num(b.transferAmount);
    if (!amount || amount <= 0) return [];
    const desc = String(b.content ?? b.description ?? "").trim();
    out.push({
      provider: "sepay",
      reference: String(b.referenceCode || (b.id !== undefined ? `sepay-${b.id}` : fallbackRef("sepay", [b.transactionDate, amount, desc, b.accumulated]))),
      date: vnDate(b.transactionDate),
      direction: b.transferType === "out" ? "out" : "in",
      amountVnd: amount,
      description: desc.slice(0, 500),
      balanceAfterVnd: num(b.accumulated),
    });
    return out;
  }

  // Casso: mảng data, số tiền âm = tiền ra
  if (Array.isArray(b.data)) {
    for (const t of b.data as Row[]) {
      const amount = num(t.amount);
      if (!amount) continue;
      const desc = String(t.description ?? "").trim();
      out.push({
        provider: "casso",
        reference: String(t.tid || (t.id !== undefined ? `casso-${t.id}` : fallbackRef("casso", [t.when, amount, desc, t.cusum_balance]))),
        date: vnDate(t.when),
        direction: amount < 0 ? "out" : "in",
        amountVnd: Math.abs(amount),
        description: desc.slice(0, 500),
        balanceAfterVnd: num(t.cusum_balance),
      });
    }
    return out;
  }
  return null;
}

const fmtVnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Lưu các giao dịch (idempotent: gửi lại cùng giao dịch không tạo dòng mới) + báo Thủ quỹ. Trả số dòng mới. */
export async function ingestBankTxns(ctx: Ctx, txns: BankTxn[]): Promise<{ received: number; created: number }> {
  if (!txns.length) return { received: 0, created: 0 };
  const created: BankTxn[] = [];
  await ctx.dbAs("luuxa_worker", async (tx) => {
    const fund = (await tx.query<{ id: string }>("SELECT id FROM funds WHERE fund_type::text IN ('bank', 'cash') AND is_active AND deleted_at IS NULL ORDER BY CASE fund_type::text WHEN 'bank' THEN 0 ELSE 1 END, created_at LIMIT 1")).rows[0];
    if (!fund) throw new ApiError(422, "NO_BANK_FUND", "Chưa có túi quỹ để nhận giao dịch.");
    const batch = (await tx.query<{ id: string }>("SELECT app.uuid_v7() AS id")).rows[0].id;
    for (const t of txns) {
      const r = await tx.query(
        `INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, balance_after_vnd, source)
         VALUES ($1, $2, $3::date, $4::ledger_direction_t, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING RETURNING id`,
        [fund.id, batch, t.date, t.direction, t.amountVnd, t.description || null, t.reference, t.balanceAfterVnd, t.provider]
      );
      if (r.rowCount) created.push(t);
    }
  });
  const incoming = created.filter((t) => t.direction === "in");
  if (incoming.length) {
    try {
      await ctx.dbAs("luuxa_worker", async (tx) => {
        const one = incoming.length === 1 ? incoming[0] : null;
        await tx.query("SELECT app.fn_notify_roles(ARRAY['treasurer', 'house_head', 'admin'], 'finance.bank_incoming', $1, $2, $3::jsonb, NULL, NULL)", [
          one ? `Có ${fmtVnd(one.amountVnd)} chuyển vào tài khoản lưu xá` : `Có ${incoming.length} giao dịch chuyển vào tài khoản lưu xá`,
          one ? (one.description || "Không có nội dung") : `Tổng ${fmtVnd(incoming.reduce((a, t) => a + t.amountVnd, 0))}. Vào Thu chi để ghi thu cho từng người.`,
          JSON.stringify({ link: "/thu-chi" }),
        ]);
      });
    } catch (e) {
      console.error("[bank-webhook] báo Thủ quỹ lỗi:", (e as Error).message);
    }
  }
  return { received: txns.length, created: created.length };
}

// ---------------------------------------------------------------------
// Gợi ý khớp khoản phải thu
// ---------------------------------------------------------------------
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

interface OpenContribution {
  id: string;
  memberId: string;
  fullName: string;
  displayName: string | null;
  planCode: string;
  planName: string;
  remaining: number;
}

export function suggestFor(line: { amountVnd: number; description: string | null }, open: OpenContribution[]): BankSuggestionDto[] {
  const text = ` ${norm(line.description ?? "")} `;
  if (text.trim().length < 3) return [];
  const scored: { c: OpenContribution; score: number; nameHit: boolean }[] = [];
  for (const c of open) {
    const full = norm(c.fullName);
    const short = c.displayName ? norm(c.displayName) : "";
    const nameHit = (full.length >= 4 && text.includes(` ${full} `)) || (short.length >= 5 && text.includes(` ${short} `)) || (full.split(" ").length >= 2 && text.includes(` ${full.split(" ").slice(-2).join(" ")} `));
    const code = norm(c.planCode);
    const codeHit = code.length >= 3 && text.includes(` ${code} `);
    const amountHit = line.amountVnd === c.remaining;
    if (!nameHit && !(codeHit && amountHit)) continue;
    scored.push({ c, nameHit, score: (nameHit ? 3 : 0) + (codeHit ? 2 : 0) + (amountHit ? 2 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(({ c, nameHit, score }) => ({
    contributionId: c.id,
    memberId: c.memberId,
    memberName: c.displayName || c.fullName,
    planCode: c.planCode,
    planName: c.planName,
    remainingVnd: c.remaining,
    confidence: nameHit && line.amountVnd === c.remaining ? "high" : nameHit || score >= 4 ? "medium" : "low",
  }));
}

async function openContributions(tx: Tx): Promise<OpenContribution[]> {
  return (
    await tx.query(
      `SELECT ct.id, ct.member_id, m.full_name, m.display_name, cp.code AS plan_code, cp.name AS plan_name,
              (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd)::bigint AS remaining
         FROM contributions ct
         JOIN members m ON m.id = ct.member_id AND m.deleted_at IS NULL
         JOIN contribution_plans cp ON cp.id = ct.plan_id
        WHERE ct.status IN ('unpaid', 'partial') AND (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) > 0
        ORDER BY ct.due_date NULLS LAST LIMIT 1500`
    )
  ).rows.map((r) => ({ id: r.id, memberId: r.member_id, fullName: r.full_name, displayName: r.display_name, planCode: r.plan_code, planName: r.plan_name, remaining: Number(r.remaining) }));
}

const toLine = (r: Row, suggestions: BankSuggestionDto[]): BankLineDto => ({
  id: r.id,
  txnDate: String(r.txn_date).slice(0, 10),
  direction: r.direction,
  amountVnd: Number(r.amount_vnd),
  description: r.description,
  reference: r.bank_reference,
  balanceAfterVnd: r.balance_after_vnd === null ? null : Number(r.balance_after_vnd),
  status: r.match_status,
  ignoreReason: r.ignore_reason,
  source: r.source,
  importedAt: r.imported_at instanceof Date ? r.imported_at.toISOString() : String(r.imported_at),
  suggestions,
});

export async function listBankLines(tx: Tx): Promise<BankLinesDto> {
  const perm = await permissions(tx, ["finance.reconcile", "finance.contribution.record"] as const);
  if (!perm["finance.reconcile"]) throw forbidden("Chỉ Thủ quỹ (đối soát ngân hàng) xem được các giao dịch ngân hàng.");
  const rows = (
    await tx.query(
      `SELECT id, txn_date, direction::text AS direction, amount_vnd, description, bank_reference, balance_after_vnd, match_status::text AS match_status, ignore_reason, source, imported_at
         FROM bank_statement_lines
        WHERE match_status = 'unmatched' OR imported_at > now() - interval '45 days'
        ORDER BY (match_status = 'unmatched') DESC, txn_date DESC, imported_at DESC LIMIT 200`
    )
  ).rows;
  const needMatch = rows.some((r) => r.match_status === "unmatched" && r.direction === "in");
  const open = needMatch ? await openContributions(tx) : [];
  const lines = rows.map((r) => toLine(r, r.match_status === "unmatched" && r.direction === "in" ? suggestFor({ amountVnd: Number(r.amount_vnd), description: r.description }, open) : []));
  return { webhookEnabled: webhookEnabled(), lines, unmatchedCount: lines.filter((l) => l.status === "unmatched").length, canConfirm: !!perm["finance.contribution.record"] };
}

export const BankLineActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), contributionId: z.string().uuid() }),
  z.object({ action: z.literal("ignore"), reason: z.string().trim().min(5, "Nhập lý do bỏ qua (tối thiểu 5 ký tự.").max(300) }),
  z.object({ action: z.literal("restore") }),
]);
export type BankLineAction = z.infer<typeof BankLineActionSchema>;

/** UUID xác định từ id dòng sao kê ⇒ bấm xác nhận hai lần không ghi thu hai lần (fn_record_contribution_payment idempotent theo client_request_id). */
function requestIdFor(lineId: string): string {
  const h = createHash("sha1").update(`bank-line:${lineId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function actOnBankLine(tx: Tx, id: string, b: BankLineAction): Promise<{ paymentId?: string }> {
  const perm = await permissions(tx, ["finance.reconcile", "finance.contribution.record"] as const);
  if (!perm["finance.reconcile"]) throw forbidden("Chỉ Thủ quỹ (đối soát ngân hàng) xử lý được giao dịch ngân hàng.");
  const line = (
    await tx.query(
      "SELECT id, fund_id, direction::text AS direction, amount_vnd, bank_reference, txn_date, match_status::text AS match_status, app.local_today() AS today FROM bank_statement_lines WHERE id = $1 FOR UPDATE",
      [id]
    )
  ).rows[0];
  if (!line) throw notFound("Không tìm thấy giao dịch.");

  if (b.action === "restore") {
    if (line.match_status !== "ignored") throw conflict("Chỉ khôi phục được giao dịch đã bỏ qua.", "BANK_LINE_STATE");
    await tx.query("UPDATE bank_statement_lines SET match_status = 'unmatched', ignore_reason = NULL WHERE id = $1", [id]);
    return {};
  }
  if (line.match_status !== "unmatched") throw conflict("Giao dịch này đã được xử lý.", "BANK_LINE_STATE");

  if (b.action === "ignore") {
    await tx.query("UPDATE bank_statement_lines SET match_status = 'ignored', ignore_reason = $2 WHERE id = $1", [id, b.reason]);
    return {};
  }

  // confirm: ghi thu cho khoản phải thu được chọn
  if (!perm["finance.contribution.record"]) throw forbidden("Bạn không có quyền ghi nhận thu quỹ.");
  if (line.direction !== "in") throw badRequest("Chỉ ghi thu được cho giao dịch tiền VÀO.");
  const ct = (
    await tx.query(
      `SELECT ct.member_id, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd)::bigint AS remaining, ct.status::text AS status
         FROM contributions ct WHERE ct.id = $1`,
      [b.contributionId]
    )
  ).rows[0];
  if (!ct) throw notFound("Không tìm thấy khoản phải thu.");
  const amount = Number(line.amount_vnd);
  if (!["unpaid", "partial"].includes(ct.status) || Number(ct.remaining) <= 0) throw conflict("Khoản này không còn phải đóng.", "CONTRIBUTION_CLOSED");
  if (amount > Number(ct.remaining)) throw new ApiError(422, "AMOUNT_EXCEEDS", `Giao dịch ${fmtVnd(amount)} lớn hơn số còn phải đóng (${fmtVnd(Number(ct.remaining))}). Hãy ghi thu thủ công ở bảng quỹ.`);
  const paidOn = String(line.txn_date).slice(0, 10) <= String(line.today).slice(0, 10) ? String(line.txn_date).slice(0, 10) : String(line.today).slice(0, 10);
  const paymentId = await recordPayment(tx, {
    memberId: ct.member_id,
    fundId: line.fund_id,
    method: "bank_transfer",
    paidOn,
    referenceCode: line.bank_reference ?? `bank-${id}`,
    note: "Khớp giao dịch ngân hàng",
    allocations: [{ contributionId: b.contributionId, amountVnd: amount }],
    clientRequestId: requestIdFor(id),
  });
  const entry = (await tx.query<{ ledger_entry_id: string }>("SELECT ledger_entry_id FROM contribution_payments WHERE id = $1", [paymentId])).rows[0]?.ledger_entry_id;
  if (entry) await tx.query("UPDATE bank_statement_lines SET match_status = 'matched', matched_ledger_entry_id = $2 WHERE id = $1 AND match_status = 'unmatched'", [id, entry]);
  return { paymentId };
}
