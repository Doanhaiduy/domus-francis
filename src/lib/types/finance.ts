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
  /** Khi hỏi theo kế hoạch (?planId=): thành viên nhận tiền của kế hoạch điện nước đó (null = tài khoản của nhà) */
  payeeMemberId?: string | null;
  payeeName?: string | null;
}

/** GET /api/v1/members/:id/payment-account — tài khoản nhận tiền của một thành viên. */
export interface MemberPaymentAccountDto {
  memberId: string;
  memberName: string;
  account: (BankAccountDto & { note: string | null; updatedAt: string }) | null;
  canEdit: boolean;
}

/** Một thành viên đã khai báo tài khoản nhận tiền (để chọn làm STK nhận tiền điện nước). */
export interface PayeeOptionDto {
  memberId: string;
  name: string;
  fullName: string;
  bankName: string;
  /** 4 số cuối STK */
  accountLast4: string;
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
  /** Thành viên đã khai báo tài khoản nhận tiền — chọn làm nơi nhận tiền điện nước (chỉ trả cho người lập được kế hoạch thu) */
  payees: PayeeOptionDto[];
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
  /** Phiếu chi tự lập (chỉ kế hoạch điện nước cũ lập trước 1.8.1 với "Trừ quỹ ngay"); kế hoạch mới luôn null */
  expenseVoucherNo: string | null;
  expenseVnd: number | null;
  /** Tổng phải thu (khoản thu một lần — có thể có mức riêng từng người); null với loại khác */
  totalVnd?: number | null;
  /** Điện nước: thành viên nhận tiền (null = tài khoản nhận quỹ của nhà) */
  payeeMemberId?: string | null;
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
  /** Admin: sửa người ứng tiền / hình thức chi (phiếu chưa hủy) */
  correct: boolean;
  /** Admin: xóa vĩnh viễn (chỉ phiếu đã hủy) */
  purge: boolean;
}

/** Một món của phiếu chi (đi chợ nhiều món). Thành tiền = làm tròn(số lượng × đơn giá), do máy chủ tính. */
export interface ExpenseItemDto {
  id: string;
  position: number;
  name: string;
  quantity: number;
  unit: string | null;
  unitPriceVnd: number;
  amountVnd: number;
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
  /** Phiếu của quỹ riêng (chuyến đi / sự kiện), không phải quỹ nhà */
  isEventFund: boolean;
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
  /** Chi tiết từng món (rỗng = phiếu chi một khoản). Có món thì amountVnd = tổng các món. */
  items: ExpenseItemDto[];
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
  /** Phiếu chi tự lập khi kế hoạch điện nước được lập với "Trừ quỹ ngay" (chỉ kế hoạch lập trước 1.8.1; nay không còn tự trừ quỹ) */
  expenseVoucherNo: string | null;
  expenseVnd: number | null;
  /** Điện nước: thành viên nhận tiền (tài khoản trong member_payment_accounts); null = tài khoản nhận quỹ của nhà */
  payeeMemberId: string | null;
  payeeName: string | null;
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

// ---------------------------------------------------------------------
// Liên kết thẳng trong trang /thu-chi (?tab=…&plan=…&pay=…&expense=…&month=…)
// ---------------------------------------------------------------------
/** Tên tab ổn định (không dấu) — dùng trong đường dẫn thông báo, hộp "Việc cần xử lý", liên kết giữa các trang. */
export type FinanceTab = "tong-quan" | "chi" | "dong-quy" | "ung-ho" | "quy-rieng" | "so-quy" | "bao-cao" | "thong-ke";
export const FINANCE_TABS: FinanceTab[] = ["tong-quan", "chi", "dong-quy", "ung-ho", "quy-rieng", "so-quy", "bao-cao", "thong-ke"];
/** Tên cũ / tên gọi khác vẫn mở đúng tab */
export const FINANCE_TAB_ALIASES: Record<string, FinanceTab> = {
  "danh-sach": "chi",
  "phieu-chi": "chi",
  thu: "tong-quan",
  "khoan-thu": "tong-quan",
  "ma-tran": "dong-quy",
  "chot-so": "so-quy",
  "doi-soat": "so-quy",
  "quy-su-kien": "quy-rieng",
  "quy-chuyen-di": "quy-rieng",
};
/** Đường dẫn tới một phiếu chi (mở hộp chi tiết) */
export const expenseLink = (id: string) => `/thu-chi?tab=chi&expense=${id}`;
/** Đường dẫn tới một khoản thu (chọn kế hoạch; `pay` = mở ngay mã QR nộp khoản của chính mình) */
export const planLink = (planId: string, payContributionId?: string | null) =>
  `/thu-chi?tab=tong-quan&plan=${planId}${payContributionId ? `&pay=${payContributionId}` : ""}`;
/** Đường dẫn tới sổ quỹ / chốt sổ của một tháng ('YYYY-MM') */
export const periodLink = (month?: string | null) => `/thu-chi?tab=so-quy${month ? `&month=${month}` : ""}`;

// ---------------------------------------------------------------------
// Chốt sổ tháng hai người + đối soát số dư (GET /api/v1/finance/periods)
// ---------------------------------------------------------------------
export interface PeriodReconciliationDto {
  /** Số dư thực tế: sao kê ngân hàng / kiểm đếm tiền mặt cuối tháng */
  statementVnd: number;
  /** Số dư sổ quỹ tại ngày cuối tháng LÚC đối soát */
  ledgerVnd: number;
  /** = thực tế − sổ quỹ */
  differenceVnd: number;
  explanation: string | null;
  byName: string | null;
  at: string;
  /** Sổ quỹ của tháng đã thay đổi sau khi đối soát ⇒ phải đối soát lại */
  stale: boolean;
}

export interface PeriodFundDto {
  fundId: string;
  code: string;
  name: string;
  type: string;
  openingVnd: number;
  inVnd: number;
  outVnd: number;
  closingVnd: number;
  entryCount: number;
  /** true = ảnh chụp lúc chốt (period_fund_balances); false = tính trực tiếp từ sổ quỹ (kỳ đang mở) */
  snapshot: boolean;
  /** Băm bút toán cuối cùng của kỳ (chỉ có khi đã chốt) — in lên báo cáo để đối chiếu */
  headHash: string | null;
  reconciliation: PeriodReconciliationDto | null;
  /** Cấu hình "Bắt buộc đối soát" đang bật và túi quỹ này phải đối soát trước khi chốt */
  requiresReconciliation: boolean;
}

export interface PeriodDto {
  id: string;
  /** 'YYYY-MM' */
  month: string;
  status: PeriodStatus;
  /** Ngày cuối tháng đã tới (mới chốt / đối soát được) */
  monthEnded: boolean;
  closed: { name: string | null; at: string; note: string | null; byMe: boolean } | null;
  confirmed: { name: string | null; at: string } | null;
  reopenCount: number;
  reopened: { name: string | null; at: string; reason: string | null } | null;
  /** Phiếu chi đang chờ duyệt / chờ chi có ngày chi trong tháng (chỉ người xem mọi phiếu chi) */
  unsettledVouchers: number | null;
  /** Số liệu từng túi quỹ — null khi người xem không có quyền xem sổ quỹ */
  funds: PeriodFundDto[] | null;
  /** Tổng các túi quỹ */
  totals: { openingVnd: number; inVnd: number; outVnd: number; closingVnd: number; entryCount: number } | null;
  can: { close: boolean; confirm: boolean; reopen: boolean; reconcile: boolean };
  /** Vì sao chưa chốt được (chưa hết tháng, kỳ trước chưa chốt, chưa đối soát…) — chỉ với kỳ đang mở */
  blockers: string[];
}

export interface LedgerChainDto {
  fundId: string;
  code: string;
  name: string | null;
  entries: number;
  ok: boolean;
  firstBrokenSeq: number | null;
}

export interface PeriodsDto {
  today: string;
  /** Mới → cũ */
  periods: PeriodDto[];
  /** Cấu hình finance.period.close_requires_reconciliation */
  requireReconciliation: boolean;
  access: { ledger: boolean; close: boolean; confirm: boolean; reopen: boolean; reconcile: boolean };
  /** Kiểm chứng chuỗi băm sổ quỹ (app.fn_verify_ledger_chain) — null khi không có quyền xem sổ quỹ */
  chain: LedgerChainDto[] | null;
}

export interface ClosePeriodResultDto {
  month: string;
  unsettledVouchers: number;
  funds: { fund: string; openingVnd: number; inVnd: number; outVnd: number; closingVnd: number; headHash: string }[];
}

// ---------------------------------------------------------------------
// Sổ quỹ có số dư (GET /api/v1/finance/ledger?from&to&fund)
// ---------------------------------------------------------------------
export type LedgerSourceType = "contribution" | "expense" | "transfer" | "adjustment" | "opening_balance" | "reversal" | "donation" | "refund";

export const LEDGER_SOURCE_LABEL: Record<LedgerSourceType, string> = {
  contribution: "Thu quỹ",
  expense: "Chi",
  transfer: "Chuyển quỹ",
  adjustment: "Điều chỉnh",
  opening_balance: "Số dư đầu kỳ",
  reversal: "Bút toán đảo",
  donation: "Ủng hộ",
  refund: "Hoàn tiền",
};

export interface LedgerBookEntryDto {
  id: string;
  /** Số thứ tự bút toán trong túi quỹ (chuỗi băm) */
  seq: number;
  date: string;
  postedAt: string;
  direction: "in" | "out";
  amountVnd: number;
  sourceType: LedgerSourceType;
  description: string;
  /** Thành viên đối ứng (người nộp / người ứng tiền / người được hoàn) */
  counterparty: string | null;
  /** Chứng từ: số phiếu chi, mã khoản thu, … */
  document: string | null;
  recordedBy: string | null;
  /** Số dư túi quỹ sau bút toán (theo thứ tự ngày hạch toán) */
  balanceAfterVnd: number;
}

export interface LedgerBookFundDto {
  fundId: string;
  code: string;
  name: string;
  type: string | null;
  openingVnd: number;
  inVnd: number;
  outVnd: number;
  closingVnd: number;
  entries: LedgerBookEntryDto[];
}

export interface LedgerBookDto {
  from: string;
  to: string;
  funds: LedgerBookFundDto[];
  houseName: string | null;
  generatedAt: string;
  /** Quá nhiều bút toán — đã cắt bớt (thu hẹp khoảng ngày) */
  truncated: boolean;
}

// ---------------------------------------------------------------------
// Cảnh báo tách phiếu chi (v_expense_split_alerts) — GET /api/v1/finance/split-alerts
// ---------------------------------------------------------------------
export interface SplitAlertDto {
  key: string;
  /** Người ứng tiền / nơi nhận tiền / người lập */
  counterparty: string;
  weekStart: string;
  weekEnd: string;
  totalVnd: number;
  maxSingleVnd: number;
  vouchers: { id: string; voucherNo: string; title: string; amountVnd: number; status: ExpenseStatus; expenseDate: string }[];
}

export interface SplitAlertsDto {
  /** Ngưỡng phiếu cần 2 chữ ký (finance.expense.dual_approval_min_vnd) */
  thresholdVnd: number | null;
  days: number;
  alerts: SplitAlertDto[];
}

// ---------------------------------------------------------------------
// Khoản thu một lần + cập nhật người phải đóng
// ---------------------------------------------------------------------
/** Loại khoản thu một lần (cho những người được chọn) */
export type OneTimeFeeType = "event_fee" | "deposit" | "other";
export const ONE_TIME_FEE_TYPES: OneTimeFeeType[] = ["event_fee", "deposit", "other"];

export interface PlanMemberCandidateDto {
  memberId: string;
  name: string;
  fullName: string;
  room: string | null;
  amountVnd: number;
}

/** GET (xem trước) / POST (thêm) /api/v1/finance/contribution-plans/:id/members */
export interface PlanMembersSyncDto {
  planId: string;
  planName: string;
  feeType: FeeType;
  /** Hạn nộp của người được thêm */
  dueDate: string;
  added: number;
  totalVnd: number;
  members: PlanMemberCandidateDto[];
  dry: boolean;
}

/** Kết quả tự thêm khoản quỹ cho người mới sau khi duyệt đơn vào nhà */
export interface NewMemberDuesDto {
  planId: string;
  planName: string;
  amountVnd: number;
  dueDate: string;
}
