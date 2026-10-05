// DTO phân hệ Thu Chi (Tài chính) — dùng chung client/server.
// Số tiền: VND nguyên (number). Ngày: 'YYYY-MM-DD' (giờ Việt Nam). Tháng: 'YYYY-MM'.

export type ExpenseStatus = "draft" | "pending_approval" | "approved" | "rejected" | "paid" | "cancelled" | "reversed";
export type ContributionStatus = "unpaid" | "partial" | "paid" | "waived" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "e_wallet" | "other";
export type PeriodStatus = "open" | "pending_confirmation" | "closed";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Nháp",
  pending_approval: "Chờ duyệt",
  approved: "Đã duyệt – chờ chi",
  rejected: "Từ chối",
  paid: "Đã chi",
  cancelled: "Đã hủy",
  reversed: "Đã đảo",
};

export const CONTRIBUTION_STATUS_LABEL: Record<ContributionStatus, string> = {
  unpaid: "Chưa đóng",
  partial: "Đóng một phần",
  paid: "Đã đóng",
  waived: "Được miễn",
  cancelled: "Đã hủy",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  e_wallet: "Ví điện tử",
  other: "Khác",
};

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  open: "Đang mở sổ",
  pending_confirmation: "Chờ xác nhận chốt sổ",
  closed: "Đã chốt sổ",
};

export const APPROVER_ROLE_LABEL: Record<string, string> = {
  house_head: "Trưởng nhà",
  treasurer: "Thủ quỹ",
  vice_head: "Phó nhà",
};

export interface FundOptionDto {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface FundDto extends FundOptionDto {
  balanceVnd: number;
}

export interface CategoryDto {
  id: string;
  code: string;
  name: string;
  color: string;
  icon: string | null;
}

/** Dữ liệu cho form lập phiếu / ghi thu (các ngưỡng null khi người dùng không được đọc cấu hình tài chính). */
export interface FinanceOptionsDto {
  today: string;
  funds: FundOptionDto[];
  categories: CategoryDto[];
  receiptRequiredMinVnd: number | null;
  dualApprovalMinVnd: number | null;
  treasurerSoloMaxVnd: number | null;
  monthlyDuesVnd: number | null;
  duesDueDay: number | null;
}

export interface ReceiptDto {
  fileId: string;
  mime: string | null;
  url: string;
}

export interface ExpenseActions {
  edit: boolean;
  submit: boolean;
  withdraw: boolean;
  /** Ký duyệt được (đúng vai trò/ngưỡng BR-FIN-02/17, chưa ký vòng này, không tự duyệt) */
  approve: boolean;
  /** Từ chối được (mọi người có quyền duyệt, trừ người lập/người ứng tiền) */
  reject: boolean;
  pay: boolean;
  cancel: boolean;
  reverse: boolean;
}

export interface ExpenseDto {
  id: string;
  voucherNo: string;
  title: string;
  amountVnd: number;
  category: { id: string; code: string; name: string; color: string };
  expenseDate: string;
  fundId: string;
  fundName: string | null;
  paidBy: { memberId: string; name: string } | null;
  payeeName: string | null;
  invoiceNo: string | null;
  paymentMethod: PaymentMethod | null;
  status: ExpenseStatus;
  note: string | null;
  noReceiptReason: string | null;
  requestedBy: { userId: string; memberId: string | null; name: string };
  requiredApprovals: number;
  approvedCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  receipts: ReceiptDto[];
  /** Thao tác người đang xem được phép (DB vẫn kiểm lại khi thực hiện). */
  can: ExpenseActions;
}

export interface ExpenseApprovalDto {
  approverName: string;
  role: string;
  decision: "approved" | "rejected";
  comment: string | null;
  decidedAt: string;
  round: number;
}

export interface ExpenseDetailDto extends ExpenseDto {
  approvalRound: number;
  approvals: ExpenseApprovalDto[];
  paidRecordedBy: string | null;
  reversal: { reason: string | null; at: string } | null;
}

export interface FinanceMonthDto {
  month: string; // YYYY-MM
  label: string; // T10
  incomeVnd: number;
  expenseVnd: number;
  closingVnd: number;
}

export interface PlanStatsDto {
  /** null khi người xem chỉ thấy khoản của chính mình (RLS) */
  totalCount: number | null;
  paidCount: number | null;
  partialCount: number | null;
  waivedCount: number | null;
  unpaidCount: number | null;
  expectedVnd: number;
  collectedVnd: number;
}

export interface ContributionPlanDto {
  id: string;
  code: string;
  name: string;
  month: string; // YYYY-MM
  amountVnd: number;
  dueDate: string;
  status: string;
  fundId: string;
  stats: PlanStatsDto;
}

export interface PersonRef {
  name: string;
  room: string | null;
}

export interface FinanceOverviewDto {
  from: string;
  to: string;
  today: string;
  openingVnd: number;
  incomeVnd: number;
  expenseVnd: number;
  closingVnd: number;
  duesExpectedVnd: number;
  duesCollectedVnd: number;
  collectionRatePct: number | null;
  expenseByCategory: { code: string; name: string; color: string; amountVnd: number; count: number }[];
  /** Tồn quỹ hiện tại (mọi túi quỹ) */
  fundBalanceVnd: number;
  /** Số dư từng túi quỹ — null nếu không có quyền xem sổ cái */
  funds: FundDto[] | null;
  /** 6 tháng kết thúc ở tháng của `to` */
  months: FinanceMonthDto[];
  periods: { month: string; status: PeriodStatus }[];
  plans: ContributionPlanDto[];
  /** Số phiếu đang chờ duyệt mà người xem nhìn thấy (RLS) */
  pendingApprovals: number;
  signatories: { treasurer: PersonRef | null; houseHead: PersonRef | null };
  org: { houseName: string | null; orderName: string | null };
  access: { ledger: boolean; contributionsAll: boolean };
}

export interface ContributionPaymentRef {
  paymentId: string;
  allocatedVnd: number;
  totalVnd: number;
  paidOn: string;
  method: PaymentMethod;
  monthsCovered: number;
}

export interface ContributionCellDto {
  contributionId: string;
  planId: string;
  month: string;
  status: ContributionStatus;
  amountDueVnd: number;
  discountVnd: number;
  netDueVnd: number;
  paidVnd: number;
  remainingVnd: number;
  dueDate: string;
  overdue: boolean;
  discountReason: string | null;
  payments: ContributionPaymentRef[];
}

export interface ContributionRowDto {
  memberId: string;
  name: string;
  fullName: string;
  room: string | null;
  cells: Record<string, ContributionCellDto>;
  outstandingVnd: number;
  overdueMonths: number;
}

export interface ContributionMatrixDto {
  months: string[];
  plans: ContributionPlanDto[];
  rows: ContributionRowDto[];
  canReadAll: boolean;
}

/** GET /api/v1/finance/members/:memberId/contributions (MemberContributionHistory) */
export interface MemberContributionRow {
  periodLabel: string; // "Tháng 10 / 2026"
  amountDueVnd: number;
  amountPaidVnd: number;
  status: "paid" | "partial" | "unpaid" | "waived";
}

/** GET /api/v1/finance/summary (Tổng quan) — trường người gọi không được đọc là null. */
export interface FinanceSummaryDto {
  fundBalanceVnd: number | null;
  funds: { code: string; name: string; balanceVnd: number }[] | null;
  month: { label: string; incomeVnd: number; expenseVnd: number } | null;
  last6Months: { label: string; incomeVnd: number; expenseVnd: number }[] | null;
  expenseByCategory: { name: string; color: string; amountVnd: number }[] | null;
  contributions: {
    periodLabel: string;
    paidCount: number | null;
    totalCount: number | null;
    collectedVnd: number | null;
    expectedVnd: number | null;
  } | null;
  pendingApprovals: number;
}
