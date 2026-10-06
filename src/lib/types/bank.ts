// Giao dịch ngân hàng tự động (webhook) + đối soát với khoản phải thu — DTO dùng chung client/server.

export type BankLineStatus = "unmatched" | "matched" | "ignored";

export interface BankSuggestionDto {
  contributionId: string;
  memberId: string;
  memberName: string;
  planCode: string;
  planName: string;
  remainingVnd: number;
  /** high: khớp tên + đúng số tiền · medium: khớp tên/mã nhưng lệch số tiền · low: chỉ đúng số tiền + mã kế hoạch */
  confidence: "high" | "medium" | "low";
}

export interface BankLineDto {
  id: string;
  txnDate: string;
  direction: "in" | "out";
  amountVnd: number;
  description: string | null;
  reference: string | null;
  balanceAfterVnd: number | null;
  status: BankLineStatus;
  ignoreReason: string | null;
  source: string;
  importedAt: string;
  suggestions: BankSuggestionDto[];
}

export interface BankLinesDto {
  /** Đã đặt BANK_WEBHOOK_SECRET trên máy chủ? */
  webhookEnabled: boolean;
  lines: BankLineDto[];
  unmatchedCount: number;
  canConfirm: boolean;
}
