// Bút toán điều chỉnh sổ quỹ (ghi tay) — DTO dùng chung client/server.

export type ManualEntryKind = "opening_balance" | "adjustment";
export type AdjustDirection = "in" | "out";

export const MANUAL_ENTRY_LABEL: Record<ManualEntryKind, string> = {
  opening_balance: "Số dư đầu kỳ",
  adjustment: "Điều chỉnh",
};

export interface ManualEntryDto {
  id: string;
  kind: ManualEntryKind;
  direction: AdjustDirection;
  amountVnd: number;
  /** Ngày hạch toán (YYYY-MM-DD) */
  entryDate: string;
  description: string;
  fundId: string;
  fundName: string;
  recordedByName: string | null;
  recordedAt: string;
}

export interface AdjustmentsDto {
  /** Có quyền ghi bút toán (finance.ledger.adjust — Trưởng nhà, Admin) */
  canAdjust: boolean;
  today: string;
  /** Bút toán ghi tay gần nhất (số dư đầu kỳ + điều chỉnh), mới nhất trước */
  entries: ManualEntryDto[];
}
