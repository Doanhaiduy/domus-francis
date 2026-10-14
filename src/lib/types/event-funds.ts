// Quỹ riêng cho chuyến đi / sự kiện (túi quỹ loại 'event') — DTO dùng chung client/server.
// Quy tắc: số liệu TỔNG của quỹ nhà luôn loại quỹ riêng; mọi con số ở đây chỉ thuộc đúng một quỹ riêng.
import type { ExpenseDto, PaymentMethod } from "./finance";

/** Quan hệ của người xem với quỹ: house = người quản lý quỹ nhà · manager = người phụ trách quỹ này · participant = chỉ là người tham gia */
export type EventFundRelation = "house" | "manager" | "participant";

export interface EventFundListItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  eventId: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  relation: EventFundRelation;
  /** Chỉ người quản lý / người phụ trách mới có số liệu của cả quỹ; người tham gia chỉ thấy phần của mình (myDueVnd / myPaidVnd) */
  balanceVnd: number | null;
  participantCount: number | null;
  dueTotalVnd: number | null;
  paidTotalVnd: number | null;
  myDueVnd: number | null;
  myPaidVnd: number | null;
  createdAt: string;
}

export interface EventFundListDto {
  items: EventFundListItem[];
  /** Có quyền lập quỹ riêng (finance.fund.manage) */
  canCreate: boolean;
}

export interface EventFundParticipant {
  id: string;
  memberId: string | null;
  name: string;
  isGuest: boolean;
  /** SĐT người ngoài — chỉ người quản lý / người phụ trách thấy */
  phone: string | null;
  dueVnd: number;
  paidVnd: number;
  note: string | null;
  removed: boolean;
}

export interface EventFundReceipt {
  id: string;
  participantId: string | null;
  payerName: string;
  amountVnd: number;
  method: PaymentMethod;
  paidOn: string;
  referenceCode: string | null;
  note: string | null;
  receivedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export type SettlementMode = "refund" | "to_house" | "none";

export interface EventFundSettlement {
  mode: SettlementMode;
  balanceVnd: number;
  note: string | null;
  settledAt: string;
  targetFundName: string | null;
  lines: { name: string; paidVnd: number; amountVnd: number }[];
}

export interface EventFundSummary {
  level: "house" | "manager";
  fund: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    description: string | null;
    eventId: string | null;
    eventTitle: string | null;
    eventStartsAt: string | null;
    createdAt: string;
  };
  /** Số dư hiện tại của quỹ riêng (tính từ sổ cái) */
  balanceVnd: number;
  /** Tổng các phiếu thu còn hiệu lực */
  receiptsVnd: number;
  /** Tổng phiếu chi đã chi */
  spentVnd: number;
  /** Tiền quỹ nhà bù vào (ròng) */
  subsidyVnd: number;
  /** Đã hoàn lại người đóng / chuyển về quỹ nhà khi đóng quỹ */
  refundedVnd: number;
  participants: { count: number; dueVnd: number; paidFull: number; paidPartial: number };
  /** Phiếu chi đang chờ duyệt hoặc đã duyệt chưa ghi chi — phải xử lý hết mới đóng quỹ được */
  pendingVouchers: number;
  managers: { memberId: string; name: string }[];
  settlement: EventFundSettlement | null;
}

export interface EventFundCan {
  /** Ghi thu, sửa danh sách tham gia, lập phiếu chi (người phụ trách hoặc người quản lý) */
  operate: boolean;
  /** Đóng quỹ, đổi người phụ trách (finance.fund.manage) */
  closeFund: boolean;
  /** Bù từ quỹ nhà (finance.ledger.adjust — Trưởng nhà) */
  subsidy: boolean;
}

export interface EventFundDetailDto {
  /** null khi người xem chỉ là người tham gia (chỉ thấy dòng và phiếu thu của mình) */
  summary: EventFundSummary | null;
  fund: { id: string; name: string; isActive: boolean; eventTitle: string | null };
  roster: EventFundParticipant[];
  receipts: EventFundReceipt[];
  /** Phiếu chi của quỹ này (rỗng với người chỉ tham gia) */
  expenses: ExpenseDto[];
  can: EventFundCan;
}

export const SETTLEMENT_MODE_LABEL: Record<SettlementMode, string> = {
  refund: "Hoàn lại cho người đã đóng",
  to_house: "Chuyển phần dư về quỹ nhà",
  none: "Không còn tiền dư",
};
