import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { zDate, zUuid } from "../http";
import { ApiError, forbidden } from "../errors";
import { iso, permissions } from "./community-shared";
import type { AdjustmentsDto, ManualEntryDto } from "@/lib/types/finance-adjust";

// Bút toán ĐIỀU CHỈNH sổ quỹ: sửa số liệu khi số dư đầu kỳ nhập sai, hoặc khi tiền thực tế lệch sổ (thừa/thiếu, khoản chi/thu ngoài hệ thống).
// Sổ cái bất biến nên không sửa/xóa bút toán cũ — ghi thêm một bút toán (thu hoặc chi) kèm lý do bắt buộc.
// Ghi qua app.fn_post_ledger_entry (nguồn adjustment; kiểm quyền finance.ledger.adjust, lý do ≥ 10 ký tự, ghi kiểm toán, chặn âm quỹ, idempotent).

export const AdjustmentSchema = z.object({
  fundId: zUuid,
  direction: z.enum(["in", "out"], { error: "Chọn cộng vào quỹ hoặc trừ khỏi quỹ." }),
  amountVnd: z
    .number({ error: "Số tiền phải là số." })
    .int("Số tiền phải là số nguyên (đồng).")
    .min(1, "Số tiền phải lớn hơn 0.")
    .max(10_000_000_000, "Số tiền tối đa 10.000.000.000đ."),
  /** Ngày hạch toán — không ở tương lai, tháng đó phải còn mở */
  entryDate: zDate,
  reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự (ghi rõ vì sao điều chỉnh).").max(400, "Lý do tối đa 400 ký tự."),
  clientRequestId: zUuid.optional(),
});
export type AdjustmentInput = z.infer<typeof AdjustmentSchema>;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function listManualEntries(tx: Tx): Promise<AdjustmentsDto> {
  const p = await permissions(tx, ["finance.ledger.read", "finance.ledger.adjust"] as const);
  if (!p["finance.ledger.read"]) throw forbidden("Bạn không có quyền xem sổ quỹ.");
  const rows = (
    await tx.query<Row>(
      `SELECT le.id, le.source_type::text AS kind, le.direction::text AS direction, le.amount_vnd, le.entry_date::text AS entry_date,
              le.description, le.fund_id, f.name AS fund_name, le.posted_at,
              (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = le.created_by LIMIT 1) AS by_name
         FROM ledger_entries le JOIN funds f ON f.id = le.fund_id
        WHERE le.source_type IN ('opening_balance', 'adjustment')
        ORDER BY le.posted_at DESC, le.fund_seq DESC
        LIMIT 100`
    )
  ).rows;
  const today = (await tx.query<{ d: string }>("SELECT app.local_today()::text AS d")).rows[0].d;
  const entries: ManualEntryDto[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    direction: r.direction,
    amountVnd: Number(r.amount_vnd),
    entryDate: String(r.entry_date),
    description: r.description,
    fundId: r.fund_id,
    fundName: r.fund_name,
    recordedByName: r.by_name ?? null,
    recordedAt: iso(r.posted_at),
  }));
  return { canAdjust: p["finance.ledger.adjust"], today, entries };
}

/** Ghi bút toán điều chỉnh (thu hoặc chi) cho một túi quỹ. Trả id bút toán. */
export async function postAdjustment(tx: Tx, b: AdjustmentInput): Promise<string> {
  // Túi quỹ chưa có bút toán nào: phải nhập SỐ DƯ ĐẦU KỲ trước (nó chỉ ghi được khi là bút toán đầu tiên của túi quỹ)
  const f = (await tx.query<{ last_seq: string }>("SELECT last_seq FROM funds WHERE id = $1", [b.fundId])).rows[0];
  if (f && Number(f.last_seq) === 0)
    throw new ApiError(422, "OPENING_FIRST", "Quỹ này chưa có số dư đầu kỳ — hãy nhập “Số dư đầu kỳ” trước, rồi mới điều chỉnh.");
  const r = await tx.query<{ id: string }>(
    "SELECT app.fn_post_ledger_entry($1, $2::date, $3::ledger_direction_t, $4, 'adjustment'::ledger_source_t, $5, $6) AS id",
    [b.fundId, b.entryDate, b.direction, b.amountVnd, `Điều chỉnh sổ quỹ: ${b.reason}`, b.clientRequestId ?? null]
  );
  return r.rows[0].id;
}
