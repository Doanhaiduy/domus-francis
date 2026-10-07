// Ủng hộ / quyên góp vào quỹ nhà — DTO dùng chung client/server.

export type DonationStatus = "pledged" | "pending" | "confirmed" | "rejected" | "cancelled";
export type DonationMethod = "cash" | "bank_transfer" | "e_wallet" | "other";

export const DONATION_STATUS_LABEL: Record<DonationStatus, string> = {
  pledged: "Đã ghi nhận — chờ nhận tiền",
  pending: "Chờ xác nhận",
  confirmed: "Đã nhận (đã vào quỹ)",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
};

export const DONATION_METHOD_LABEL: Record<DonationMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  e_wallet: "Ví điện tử",
  other: "Khác",
};

export interface DonationDto {
  id: string;
  donorMemberId: string | null;
  donorName: string;
  /** Người ủng hộ là thành viên trong nhà (true) hay người ngoài (false) */
  isMember: boolean;
  amountVnd: number;
  donatedOn: string;
  method: DonationMethod;
  referenceCode: string | null;
  note: string | null;
  status: DonationStatus;
  /** Do chính thành viên báo (true) hay Thủ quỹ ghi (false) */
  selfReported: boolean;
  fundId: string | null;
  fundName: string | null;
  recordedByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  isMine: boolean;
}

export interface DonationSummary {
  /** Đã nhận (đã vào quỹ) */
  confirmedCount: number;
  confirmedVnd: number;
  /** Số người ủng hộ khác nhau trong số khoản đã nhận */
  donorCount: number;
  memberDonorCount: number;
  pendingCount: number;
  pendingVnd: number;
  pledgedCount: number;
  pledgedVnd: number;
}

export interface DonationListDto {
  /** Ghi nhận / xác nhận (finance.contribution.record) */
  canRecord: boolean;
  /** Xem được khoản của mọi người */
  canViewAll: boolean;
  items: DonationDto[];
  summary: DonationSummary;
}

export interface DonationQuery {
  from?: string;
  to?: string;
  status?: DonationStatus | "open" | "";
  mine?: boolean;
  q?: string;
}
