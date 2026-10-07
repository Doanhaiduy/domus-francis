// Số dư quỹ khởi đầu (bút toán "số dư đầu kỳ" của từng túi quỹ) — DTO dùng chung client/server.

export interface OpeningEntryDto {
  amountVnd: number;
  /** Ngày chốt số dư (YYYY-MM-DD) */
  entryDate: string;
  description: string;
  recordedByName: string | null;
  recordedAt: string;
}

export interface OpeningFundDto {
  id: string;
  code: string;
  name: string;
  /** cash | bank | event … */
  type: string;
  balanceVnd: number;
  /** Số bút toán đã có trong sổ của túi quỹ này */
  entryCount: number;
  /** Chưa có bút toán nào ⇒ còn nhập được số dư đầu kỳ (chỉ ghi được MỘT lần, là bút toán đầu tiên) */
  canOpen: boolean;
  opening: OpeningEntryDto | null;
}

export interface OpeningBalanceDto {
  /** Có quyền ghi số dư đầu kỳ (finance.ledger.adjust — Trưởng nhà, Admin) */
  canAdjust: boolean;
  today: string;
  funds: OpeningFundDto[];
  /** Tổng số dư các túi quỹ hiện có */
  totalVnd: number;
}
