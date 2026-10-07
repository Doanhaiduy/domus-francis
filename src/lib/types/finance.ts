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
  vice_head: "Phó nhà (trước đây)",
};

/** Loại khoản thu (fee_type_t). Giao diện chỉ lập mới periodic_dues (quỹ định kỳ) và utility (điện nước); monthly_dues chỉ còn trong lịch sử. */
export type FeeType = "periodic_dues" | "utility" | "monthly_dues" | "event_fee" | "donation" | "deposit" | "other";

export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  periodic_dues: "Quỹ định kỳ",
  utility: "Tiền điện nước",
  monthly_dues: "Quỹ sinh hoạt tháng",
  event_fee: "Phí sự kiện",
  donation: "Quyên góp",
  deposit: "Đặt cọc",
  other: "Khoản thu khác",
};

const mNum = (ym: string) => Number(ym.slice(5, 7));
const yNum = (ym: string) => Number(ym.slice(0, 4));

/** Khoảng tháng: "T7–T12/2026", "T9/2026–T2/2027", "T10/2026" ('YYYY-MM'). */
export function monthRangeLabel(start: string, end: string | null | undefined): string {
  if (!end || end === start) return `T${mNum(start)}/${yNum(start)}`;
  if (yNum(start) === yNum(end)) return `T${mNum(start)}–T${mNum(end)}/${yNum(start)}`;
  return `T${mNum(start)}/${yNum(start)}–T${mNum(end)}/${yNum(end)}`;
}

/** Nhãn ngắn của kế hoạch cho cột ma trận / chip: "Quỹ T7–T12", "ĐN T10", "Quỹ T10" (tháng cũ). */
export function planShortLabel(p: { feeType: FeeType; month: string; endMonth: string | null; name: string }): string {
  if (p.feeType === "periodic_dues") return `Quỹ T${mNum(p.month)}–T${mNum(p.endMonth ?? p.month)}`;
  if (p.feeType === "utility") return `ĐN T${mNum(p.month)}`;
  if (p.feeType === "monthly_dues") return `Quỹ T${mNum(p.month)}`;
  return p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name;
}

/** Thông tin tài khoản ngân hàng nhận tiền (VietQR cần bankBin 6 số + accountNo). */
export interface BankAccountDto {
  /** Mã ngân hàng NAPAS 6 số — null với ví điện tử / ngân hàng ngoài danh sách (khi đó chỉ dùng ảnh QR tải lên) */
  bankBin: string | null;
  bankName: string;
  accountNo: string;
  accountName: string;
  /** Ảnh mã QR tự tải lên (storage_files.id) */
  qrFileId: string | null;
}

/** GET /api/v1/finance/receiving-account — tài khoản nhận quỹ của nhà (thường là của Thủ quỹ). */
export interface ReceivingAccountDto {
  /** null khi chưa khai báo */
  account: BankAccountDto | null;
  /** Chuỗi cũ finance.dues_bank_account (hiển thị khi chưa có tài khoản dạng mới) */
  legacyText: string | null;
  canEdit: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

/** GET /api/v1/members/:id/payment-account — tài khoản nhận tiền của một thành viên. */
export interface MemberPaymentAccountDto {
  memberId: string;
  memberName: string;
  account: (BankAccountDto & { note: string | null; updatedAt: string }) | null;
  canEdit: boolean;
}

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
  /** Cấu hình quỹ định kỳ (finance.dues_cycle_*) */
  dues: { cycleMonths: number; amountVnd: number; graduatedAmountVnd: number; startMonth: number; dueDay: number };
  /** Hạn nộp tiền điện nước: ngày này của tháng sau tháng hóa đơn */
  utilityDueDay: number;
  /** Kỳ quỹ hiện tại và kỳ kế tiếp ('YYYY-MM') */
  currentCycle: { startMonth: string; endMonth: string };
  nextCycle: { startMonth: string; endMonth: string };
}

/** GET /api/v1/finance/contribution-plans/preview — xem trước khi lập kế hoạch (số người chia, mỗi người, phần dư). */
export interface PlanPreviewDto {
  kind: "periodic_dues" | "utility";
  name: string;
  month: string;
  endMonth: string | null;
  dueDate: string;
  splitCount: number;
  amountVnd: number;
  totalVnd: number;
  billTotalVnd: number | null;
  remainderVnd: number;
  /** Kế hoạch còn hiệu lực trùng kỳ/tháng (lập sẽ bị từ chối) */
  existing: { id: string; name: string } | null;
  /** Trần tổng hóa đơn được tự trừ quỹ khi lập kế hoạch điện nước (finance.utility.auto_expense_max_vnd); null nếu không đọc được */
  autoExpenseMaxVnd?: number | null;
  /** Thống kê chi tiết theo phân loại thành viên (quỹ định kỳ) */
  breakdown?: {
    studyingCount: number;
    studyingAmountVnd: number;
    graduatedCount: number;
    graduatedAmountVnd: number;
    customCount: number;
    members?: {
      id: string;
      name: string;
      fullName: string;
      room: string | null;
      status: string;
      duesAmountVnd: number;
      isCustom: boolean;
    }[];
  };
}

export interface CreatePlanResultDto {
  id: string;
  code: string;
  name: string;
  generated: number;
  amountVnd: number;
  dueDate: string;
  splitCount: number | null;
  billTotalVnd: number | null;
  remainderVnd: number | null;
  /** Phiếu chi tự lập khi chọn "Trừ quỹ ngay" (điện nước); null nếu không trừ quỹ tự động */
  expenseVoucherNo: string | null;
  expenseVnd: number | null;
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
  feeType: FeeType;
  /** Tháng (đầu kỳ) — 'YYYY-MM' */
  month: string;
  /** Tháng cuối kỳ (quỹ định kỳ) — 'YYYY-MM' | null */
  endMonth: string | null;
  /** "Quỹ T7–T12", "ĐN T10" */
  shortLabel: string;
  amountVnd: number;
  dueDate: string;
  status: string;
  fundId: string;
  /** Tiền điện nước: tổng hóa đơn + số người chia (null với loại khác) */
  billTotalVnd: number | null;
  splitCount: number | null;
  note: string | null;
  /** Phiếu chi tự lập khi kế hoạch điện nước được lập với "Trừ quỹ ngay" (số phiếu + số tiền đã trừ quỹ) */
  expenseVoucherNo: string | null;
  expenseVnd: number | null;
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
  planCode: string;
  planName: string;
  feeType: FeeType;
  /** Tháng (đầu kỳ) của kế hoạch — 'YYYY-MM' */
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
  /** Khóa = planId (nhiều kế hoạch có thể cùng tháng đầu: quỹ kỳ + điện nước) */
  cells: Record<string, ContributionCellDto>;
  outstandingVnd: number;
  /** Số khoản quá hạn chưa đóng đủ */
  overdueCount: number;
}

export interface ContributionMatrixDto {
  /** Khoảng tháng đang xem ('YYYY-MM') — các kế hoạch có thời gian giao với khoảng này */
  from: string;
  to: string;
  /** Các cột: kế hoạch thu, sắp theo tháng (đầu kỳ) */
  plans: ContributionPlanDto[];
  rows: ContributionRowDto[];
  canReadAll: boolean;
}

/** GET /api/v1/finance/members/:memberId/contributions (MemberContributionHistory) */
export interface MemberContributionRow {
  planId: string;
  feeType: FeeType;
  periodLabel: string; // "Quỹ kỳ T7–T12/2026", "Điện nước tháng 09/2026"
  amountDueVnd: number;
  amountPaidVnd: number;
  dueDate: string;
  status: "paid" | "partial" | "unpaid" | "waived";
}

/** GET /api/v1/finance/summary (Tổng quan) — trường người gọi không được đọc là null. */
export interface FinanceSummaryDto {
  fundBalanceVnd: number | null;
  funds: { code: string; name: string; balanceVnd: number }[] | null;
  month: { label: string; incomeVnd: number; expenseVnd: number } | null;
  last6Months: { label: string; incomeVnd: number; expenseVnd: number }[] | null;
  expenseByCategory: { name: string; color: string; amountVnd: number }[] | null;
  /** Kỳ quỹ định kỳ hiện tại (null nếu chưa lập / không có quyền) */
  contributions: PlanSummaryDto | null;
  /** Tiền điện nước tháng gần nhất (null nếu chưa có) */
  utility: PlanSummaryDto | null;
  /** Khoản người xem còn phải nộp (mọi kế hoạch chưa hủy) */
  mine: { outstandingVnd: number; items: number; overdue: number } | null;
  pendingApprovals: number;
}

export interface PlanSummaryDto {
  planId: string;
  /** "quỹ kỳ T7–T12/2026" / "điện nước T9/2026" */
  periodLabel: string;
  dueDate: string;
  /** null khi người xem chỉ thấy khoản của mình */
  paidCount: number | null;
  totalCount: number | null;
  collectedVnd: number;
  expectedVnd: number;
}

// ---------------------------------------------------------------------
// Báo "đã đóng" (chờ xác nhận), nhắc nợ và thống kê thu chi theo tháng / quý / năm
// ---------------------------------------------------------------------
export interface ContributionClaimDto {
  id: string;
  contributionId: string;
  memberId: string;
  planId: string;
  method: PaymentMethod;
  referenceCode: string | null;
  note: string | null;
  createdAt: string; // ISO
}

export interface RemindResultDto {
  /** Số người được nhắc trong ứng dụng */
  sent: number;
  /** Số khoản bỏ qua vì vừa được nhắc trong 1 giờ qua */
  skipped: number;
  /** Nội dung tin nhắc nhóm (để sao chép khi không gửi được vào nhóm Zalo) */
  groupText: string | null;
  /** Kết quả gửi nhóm Zalo (null = không yêu cầu) */
  zalo: { sent: boolean; reason?: string } | null;
}

export type StatsGranularity = "month" | "quarter" | "year";

export interface FinanceStatsPeriodDto {
  key: string; // 2026-10 | 2026-Q4 | 2026
  label: string; // "Tháng 10/2026" | "Quý 4/2026" | "Năm 2026"
  from: string;
  to: string;
  openingVnd: number;
  incomeVnd: number;
  expenseVnd: number;
  netVnd: number;
  closingVnd: number;
  duesExpectedVnd: number;
  duesCollectedVnd: number;
  collectionRatePct: number | null;
  expenseByCategory: { code: string; name: string; color: string; amountVnd: number; count: number }[];
  /** Thu theo loại khoản (chỉ người xem được toàn bộ khoản thu); null nếu không có quyền */
  incomeByType: { type: string; label: string; amountVnd: number }[] | null;
}

export interface FinanceStatsDto {
  granularity: StatsGranularity;
  periods: FinanceStatsPeriodDto[];
  /** adjustmentVnd = số dư cuối − số dư đầu − (thu − chi): phần "số dư đầu kỳ nhập tay" nằm giữa các kỳ (không phải thu/chi) */
  totals: { incomeVnd: number; expenseVnd: number; netVnd: number; openingVnd: number; closingVnd: number; adjustmentVnd: number };
  expenseByCategory: { code: string; name: string; color: string; amountVnd: number; count: number }[];
  incomeByType: { type: string; label: string; amountVnd: number }[] | null;
  houseName: string | null;
  generatedAt: string;
}
