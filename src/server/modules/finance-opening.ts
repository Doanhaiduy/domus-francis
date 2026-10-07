import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { zDate, zUuid } from "../http";
import { forbidden } from "../errors";
import { iso, permissions } from "./community-shared";
import type { OpeningBalanceDto } from "@/lib/types/finance-opening";

// Số dư quỹ khởi đầu: bút toán `opening_balance` của từng túi quỹ (chỉ MỘT lần, là bút toán ĐẦU TIÊN, chiều thu).
// Ghi qua app.fn_post_ledger_entry (kiểm quyền finance.ledger.adjust, lý do ≥ 10 ký tự, ghi kiểm toán, idempotent theo clientRequestId);
// đọc dưới RLS (cần finance.ledger.read).

export const OpeningBalanceSchema = z.object({
  fundId: zUuid,
  amountVnd: z
    .number({ error: "Số tiền phải là số." })
    .int("Số tiền phải là số nguyên (đồng).")
    .min(1, "Số dư đầu kỳ phải lớn hơn 0 (túi quỹ đang trống thì không cần nhập).")
    .max(10_000_000_000, "Số tiền tối đa 10.000.000.000đ."),
  /** Ngày chốt số dư — không ở tương lai, tháng đó phải còn mở */
  entryDate: zDate,
  note: z.string().trim().max(300, "Ghi chú tối đa 300 ký tự.").nullable().optional().transform((v) => (v ? v : null)),
  clientRequestId: zUuid.optional(),
});
export type OpeningBalanceInput = z.infer<typeof OpeningBalanceSchema>;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function getOpeningBalances(tx: Tx): Promise<OpeningBalanceDto> {
  const p = await permissions(tx, ["finance.ledger.read", "finance.ledger.adjust"] as const);
  if (!p["finance.ledger.read"]) throw forbidden("Bạn không có quyền xem sổ quỹ.");
  const rows = (
    await tx.query<Row>(
      `SELECT v.fund_id, v.code, v.name, v.fund_type::text AS type, v.balance_vnd, v.entry_count::int AS entry_count,
              o.amount_vnd AS o_amount, o.entry_date::text AS o_date, o.description AS o_desc, o.posted_at AS o_posted,
              (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = o.created_by LIMIT 1) AS o_by
         FROM v_fund_balances v
         JOIN funds f ON f.id = v.fund_id AND f.is_active
         LEFT JOIN LATERAL (SELECT le.amount_vnd, le.entry_date, le.description, le.posted_at, le.created_by
                              FROM ledger_entries le WHERE le.fund_id = v.fund_id AND le.source_type = 'opening_balance'
                             ORDER BY le.fund_seq LIMIT 1) o ON true
        ORDER BY CASE v.fund_type::text WHEN 'cash' THEN 0 ELSE 1 END, v.code`
    )
  ).rows;
  const today = (await tx.query<{ d: string }>("SELECT app.local_today()::text AS d")).rows[0].d;
  const funds = rows.map((r) => ({
    id: r.fund_id as string,
    code: r.code as string,
    name: r.name as string,
    type: r.type as string,
    balanceVnd: Number(r.balance_vnd),
    entryCount: Number(r.entry_count),
    canOpen: Number(r.entry_count) === 0,
    opening:
      r.o_amount == null
        ? null
        : { amountVnd: Number(r.o_amount), entryDate: String(r.o_date), description: r.o_desc as string, recordedByName: (r.o_by as string | null) ?? null, recordedAt: iso(r.o_posted) },
  }));
  return { canAdjust: p["finance.ledger.adjust"], today, funds, totalVnd: funds.reduce((a, f) => a + f.balanceVnd, 0) };
}

/** Ghi số dư đầu kỳ cho một túi quỹ (túi quỹ chưa có bút toán nào). Trả id bút toán. */
export async function postOpeningBalance(tx: Tx, b: OpeningBalanceInput): Promise<string> {
  const description = `Số dư đầu kỳ — khởi tạo sổ quỹ khi bắt đầu dùng hệ thống${b.note ? `. ${b.note}` : ""}`;
  const r = await tx.query<{ id: string }>(
    "SELECT app.fn_post_ledger_entry($1, $2::date, 'in'::ledger_direction_t, $3, 'opening_balance'::ledger_source_t, $4, $5) AS id",
    [b.fundId, b.entryDate, b.amountVnd, description, b.clientRequestId ?? null]
  );
  return r.rows[0].id;
}
