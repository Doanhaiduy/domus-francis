"use client";
// Hook dữ liệu + thao tác phân hệ Thu Chi (SWR — làm mới sau mỗi thao tác ghi bằng refreshFinance()).
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher, inBackground } from "../api";
import type { BankLinesDto } from "../types/bank";
import type {
  BankAccountDto,
  ContributionClaimDto,
  ContributionMatrixDto,
  ContributionPlanDto,
  CreatePlanResultDto,
  ExpenseDetailDto,
  ExpenseDto,
  FinanceOptionsDto,
  FinanceOverviewDto,
  FinanceStatsDto,
  LedgerBookDto,
  MemberPaymentAccountDto,
  OneTimeFeeType,
  PaymentMethod,
  PeriodsDto,
  PlanMembersSyncDto,
  PlanPreviewDto,
  ReceivingAccountDto,
  RemindResultDto,
  SplitAlertsDto,
  StatsGranularity,
  ClosePeriodResultDto,
} from "../types/finance";

export const FINANCE_KEY = "/api/v1/finance";

export interface PeriodQuery {
  from?: string;
  to?: string;
  all?: boolean;
}
const qs = (p: PeriodQuery) =>
  p.all ? "all=1" : [p.from && `from=${p.from}`, p.to && `to=${p.to}`].filter(Boolean).join("&");

export function useFinanceOverview(p: PeriodQuery, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<FinanceOverviewDto>(enabled ? `${FINANCE_KEY}/overview?${qs(p)}` : null, swrFetcher, {
    keepPreviousData: true,
  });
  return { overview: data, error, isLoading, mutate };
}

export function useExpenses(from: string | undefined, to: string | undefined, enabled = true) {
  const key = enabled && from && to ? `${FINANCE_KEY}/expenses?from=${from}&to=${to}` : null;
  const { data, error, isLoading, mutate } = useSWR<ExpenseDto[]>(key, swrFetcher, { keepPreviousData: true });
  return { expenses: data ?? [], error, isLoading, mutate };
}

export function useExpenseDetail(id: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ExpenseDetailDto>(id ? `${FINANCE_KEY}/expenses/${id}` : null, swrFetcher);
  return { expense: data, error, isLoading, mutate };
}

export function useFinanceOptions(enabled = true) {
  const { data } = useSWR<FinanceOptionsDto>(enabled ? `${FINANCE_KEY}/options` : null, swrFetcher, { revalidateOnFocus: false });
  return data;
}

export interface MatrixQuery {
  /** Tháng cuối của khoảng xem ('YYYY-MM', mặc định tháng hiện tại) */
  to?: string;
  /** Số tháng của khoảng xem (1–24, mặc định 12) */
  months?: number;
  /** Chỉ một kế hoạch thu */
  plan?: string;
  /** Chỉ một thành viên */
  member?: string;
}

/** Ma trận đóng quỹ thành viên × kế hoạch thu (cột = kế hoạch có thời gian giao với khoảng xem). */
export function useContributionMatrix(q: MatrixQuery, enabled = true) {
  const params = [`months=${q.months ?? 12}`, q.to && `to=${q.to}`, q.plan && `plan=${q.plan}`, q.member && `member=${q.member}`].filter(Boolean).join("&");
  const key = enabled ? `${FINANCE_KEY}/contributions?${params}` : null;
  const { data, error, isLoading, mutate } = useSWR<ContributionMatrixDto>(key, swrFetcher, { keepPreviousData: true });
  return { matrix: data, error, isLoading, mutate };
}

/** Kế hoạch thu gần đây (mặc định 12 tháng qua + 6 tháng tới) kèm thống kê đã thu / phải thu. */
export function useContributionPlans(from?: string, to?: string, enabled = true) {
  const params = [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&");
  const { data, error, isLoading, mutate } = useSWR<ContributionPlanDto[]>(
    enabled ? `${FINANCE_KEY}/contribution-plans${params ? `?${params}` : ""}` : null,
    swrFetcher,
    { keepPreviousData: true }
  );
  return { plans: data, error, isLoading, mutate };
}

export type PlanPreviewQuery =
  | { kind: "periodic_dues"; startMonth?: string; dueDate?: string }
  | { kind: "utility"; month: string; billTotalVnd?: number; perPersonVnd?: number; dueDate?: string };

/** Xem trước kế hoạch thu (số người chia, mỗi người, phần dư) — null để tắt. */
export function usePlanPreview(q: PlanPreviewQuery | null) {
  const key = q
    ? `${FINANCE_KEY}/contribution-plans/preview?${Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&")}`
    : null;
  const { data, error, isLoading } = useSWR<PlanPreviewDto>(key, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { preview: data, error, isLoading };
}

/** Yêu cầu "đã đóng" đang chờ xác nhận (của một kế hoạch, hoặc tất cả). Người thường chỉ thấy yêu cầu của mình. */
export function usePendingClaims(planId: string | null | undefined, enabled = true) {
  const key = enabled ? `${FINANCE_KEY}/claims${planId ? `?plan=${planId}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR<ContributionClaimDto[]>(key, swrFetcher, { keepPreviousData: true, shouldRetryOnError: false });
  return { claims: data ?? [], error, isLoading, mutate };
}

/** Thống kê thu chi theo tháng / quý / năm. */
export function useFinanceStats(granularity: StatsGranularity, count: number | undefined, enabled = true) {
  const key = enabled ? `${FINANCE_KEY}/stats?granularity=${granularity}${count ? `&count=${count}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR<FinanceStatsDto>(key, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  return { stats: data, error, isLoading, mutate };
}

/** Tài khoản nhận quỹ của nhà (STK + ảnh QR của Thủ quỹ). */
export function useReceivingAccount(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<ReceivingAccountDto>(enabled ? `${FINANCE_KEY}/receiving-account` : null, swrFetcher, {
    revalidateOnFocus: false,
  });
  return { receiving: data, error, isLoading, mutate };
}

export const paymentAccountKey = (memberId: string) => `/api/v1/members/${memberId}/payment-account`;

/** Tài khoản nhận tiền của một thành viên. */
export function useMemberPaymentAccount(memberId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<MemberPaymentAccountDto>(memberId ? paymentAccountKey(memberId) : null, swrFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { paymentAccount: data, error, isLoading, mutate };
}

/** Giao dịch ngân hàng nhận tự động (webhook) + gợi ý khớp — chỉ người có finance.reconcile. */
export function useBankLines(enabled = true) {
  const { data, error, isLoading } = useSWR<BankLinesDto>(enabled ? `${FINANCE_KEY}/bank-lines` : null, swrFetcher, {
    keepPreviousData: true,
    refreshInterval: 120_000,
    shouldRetryOnError: false,
  });
  return { data, error, isLoading: isLoading && !data };
}

export const bankLinesApi = {
  confirm: (id: string, contributionId: string) => api.post(`${FINANCE_KEY}/bank-lines/${id}`, { action: "confirm", contributionId }),
  ignore: (id: string, reason: string) => api.post(`${FINANCE_KEY}/bank-lines/${id}`, { action: "ignore", reason }),
  restore: (id: string) => api.post(`${FINANCE_KEY}/bank-lines/${id}`, { action: "restore" }),
};

/** Sổ quỹ theo tháng + chốt sổ hai người + đối soát + kiểm chứng chuỗi băm (người xem sổ quỹ / người chốt, xác nhận, đối soát). */
export function usePeriods(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<PeriodsDto>(enabled ? `${FINANCE_KEY}/periods` : null, swrFetcher, {
    keepPreviousData: true,
    shouldRetryOnError: false,
  });
  return { periods: data, error, isLoading: isLoading && !data, mutate };
}

/** Sổ quỹ có số dư theo khoảng ngày (cần finance.ledger.read). */
export function useLedgerBook(from: string | null, to: string | null, fund?: string | null, enabled = true) {
  const key = enabled && from && to ? `${FINANCE_KEY}/ledger?from=${from}&to=${to}${fund ? `&fund=${fund}` : ""}` : null;
  const { data, error, isLoading } = useSWR<LedgerBookDto>(key, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false });
  return { book: data, error, isLoading: isLoading && !data };
}

/** Cảnh báo nghi tách phiếu chi (người duyệt chi). */
export function useSplitAlerts(enabled = true, days = 60) {
  const { data, error } = useSWR<SplitAlertsDto>(enabled ? `${FINANCE_KEY}/split-alerts?days=${days}` : null, swrFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { split: data, error };
}

/** Xem trước "Cập nhật người phải đóng" của một kế hoạch (null = tắt). */
export function usePlanMembersPreview(planId: string | null, memberIds?: string[] | null) {
  const key = planId ? `${FINANCE_KEY}/contribution-plans/${planId}/members${memberIds?.length ? `?members=${memberIds.join(",")}` : ""}` : null;
  const { data, error, isLoading } = useSWR<PlanMembersSyncDto>(key, swrFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  return { preview: data, error, isLoading: isLoading && !data };
}

/** Làm mới mọi dữ liệu tài chính đang hiển thị (tổng quan, danh sách phiếu, ma trận, chi tiết). */
export const refreshFinance = (): Promise<void> =>
  inBackground(globalMutate((key) => typeof key === "string" && key.startsWith(FINANCE_KEY)));

/** Một món gửi lên khi lập/sửa phiếu chi */
export interface ExpenseItemInput {
  name: string;
  quantity: number;
  unit?: string | null;
  unitPriceVnd: number;
}

export interface ExpenseInput {
  title: string;
  /** Bỏ trống khi có `items` — số tiền phiếu = tổng các món (máy chủ tự tính) */
  amountVnd?: number;
  /** Chi tiết từng món; [] khi sửa = bỏ chi tiết, quay về một khoản */
  items?: ExpenseItemInput[];
  categoryId: string;
  expenseDate: string;
  fundId: string;
  paidByMemberId: string | null;
  payeeName?: string | null;
  invoiceNo?: string | null;
  note?: string | null;
  receiptFileId?: string | null;
  noReceiptReason?: string | null;
  submit?: boolean;
  clientRequestId?: string;
}

export const financeApi = {
  createExpense: (body: ExpenseInput) => api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses`, body),
  updateExpense: (id: string, body: Partial<ExpenseInput>) => api.patch<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}`, body),
  submit: (id: string) => api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/submit`),
  withdraw: (id: string) => api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/withdraw`),
  decide: (id: string, decision: "approved" | "rejected", comment?: string | null) =>
    api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/decision`, { decision, comment: comment ?? null }),
  pay: (id: string, body: { method: PaymentMethod; paidOn: string; reference?: string | null; proofFileId?: string | null }) =>
    api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/pay`, body),
  cancel: (id: string, reason: string) => api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/cancel`, { reason }),
  reverse: (id: string, reason: string) => api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/reverse`, { reason }),
  /** Admin: sửa người ứng tiền (paidByMemberId null = quỹ chi trực tiếp) và/hoặc hình thức chi của phiếu */
  correctExpense: (id: string, body: { reason: string; changePaidBy?: boolean; paidByMemberId?: string | null; method?: PaymentMethod }) =>
    api.post<ExpenseDetailDto>(`${FINANCE_KEY}/expenses/${id}/correct`, body),
  createPlan: (
    body:
      | { kind: "periodic_dues"; startMonth?: string; dueDate?: string; fundId?: string }
      | {
          kind: "utility";
          month: string;
          /** Nhập MỘT trong hai: tổng hóa đơn HOẶC số tiền mỗi người */
          billTotalVnd?: number;
          perPersonVnd?: number;
          /** Trừ quỹ ngay: tự lập phiếu chi đã chi bằng tổng; anh em đóng thì cộng lại */
          autoExpense?: boolean;
          payMethod?: PaymentMethod;
          dueDate?: string;
          fundId?: string;
          note?: string | null;
        }
      | {
          /** Khoản thu MỘT LẦN cho những người được chọn */
          kind: "onetime";
          feeType: OneTimeFeeType;
          name: string;
          /** Mức chung mỗi người */
          amountVnd: number;
          dueDate: string;
          /** amountVnd của từng người: bỏ trống = mức chung */
          members: { memberId: string; amountVnd?: number | null }[];
          fundId?: string;
          note?: string | null;
        }
  ) => api.post<CreatePlanResultDto>(`${FINANCE_KEY}/contribution-plans`, body),
  /** "Cập nhật người phải đóng": quỹ định kỳ — mọi người đang ở còn thiếu; khoản một lần — những người chọn (memberIds) */
  syncPlanMembers: (planId: string, memberIds?: string[] | null) =>
    api.post<PlanMembersSyncDto>(`${FINANCE_KEY}/contribution-plans/${planId}/members`, memberIds?.length ? { memberIds } : {}),
  closePeriod: (month: string, note?: string | null) => api.post<ClosePeriodResultDto>(`${FINANCE_KEY}/periods/${month}/close`, { note: note ?? null }),
  confirmPeriod: (month: string) => api.post(`${FINANCE_KEY}/periods/${month}/confirm`, {}),
  reopenPeriod: (month: string, reason: string) => api.post(`${FINANCE_KEY}/periods/${month}/reopen`, { reason }),
  reconcilePeriod: (month: string, body: { fundId: string; statementVnd: number; explanation?: string | null }) =>
    api.post<{ statementVnd: number; ledgerVnd: number; differenceVnd: number }>(`${FINANCE_KEY}/periods/${month}/reconcile`, body),
  ledgerBook: (from: string, to: string, fund?: string | null) =>
    api.get<LedgerBookDto>(`${FINANCE_KEY}/ledger?from=${from}&to=${to}${fund ? `&fund=${fund}` : ""}`),
  matrix: (q: MatrixQuery) =>
    api.get<ContributionMatrixDto>(
      `${FINANCE_KEY}/contributions?${[`months=${q.months ?? 12}`, q.to && `to=${q.to}`, q.plan && `plan=${q.plan}`, q.member && `member=${q.member}`].filter(Boolean).join("&")}`
    ),
  cancelPlan: (planId: string, reason: string) => api.post<{ cancelled: number }>(`${FINANCE_KEY}/contribution-plans/${planId}/cancel`, { reason }),
  saveReceivingAccount: (body: BankAccountDto) => api.put<ReceivingAccountDto>(`${FINANCE_KEY}/receiving-account`, body),
  recordPayment: (body: {
    memberId: string;
    fundId: string;
    method: PaymentMethod;
    paidOn: string;
    referenceCode?: string | null;
    note?: string | null;
    allocations: { contributionId: string; amountVnd: number }[];
    clientRequestId?: string;
  }) => api.post<{ id: string }>(`${FINANCE_KEY}/payments`, body),
  /** Ghi thu hàng loạt (khoản đã đóng trước khi dùng hệ thống) — một giao dịch, tất cả hoặc không gì cả. */
  recordPaymentsBulk: (body: {
    fundId: string;
    method: PaymentMethod;
    paidOn: string;
    note?: string | null;
    items: { memberId: string; contributionId: string; amountVnd: number; referenceCode?: string | null }[];
    clientRequestId: string;
  }) => api.post<{ count: number; totalVnd: number; paymentIds: string[] }>(`${FINANCE_KEY}/payments/bulk`, body),
  claimPaid: (body: { contributionId: string; method: PaymentMethod; referenceCode?: string | null; note?: string | null }) =>
    api.post<{ id: string }>(`${FINANCE_KEY}/claims`, body),
  cancelClaim: (claimId: string) => api.post(`${FINANCE_KEY}/claims/${claimId}/cancel`),
  decideClaim: (claimId: string, approve: boolean, note?: string | null) =>
    api.post<{ paymentId: string | null }>(`${FINANCE_KEY}/claims/${claimId}/decide`, { approve, note: note ?? null }),
  remind: (planId: string, body: { contributionIds?: string[] | null; app: boolean; zalo: boolean; message?: string | null }) =>
    api.post<RemindResultDto>(`${FINANCE_KEY}/contribution-plans/${planId}/remind`, body),
  voidPayment: (paymentId: string, reason: string) => api.post(`${FINANCE_KEY}/payments/${paymentId}/void`, { reason }),
  waive: (contributionId: string, discountVnd: number, reason?: string | null) =>
    api.post(`${FINANCE_KEY}/contributions/${contributionId}/waive`, { discountVnd, reason: reason ?? null }),
  adjustContribution: (contributionId: string, amountDueVnd: number, reason: string) =>
    api.post<{ id: string; amountDueVnd: number; note: string }>(`${FINANCE_KEY}/contributions/${contributionId}/adjust`, {
      amountDueVnd,
      reason,
    }),
};

/** Tài khoản nhận tiền của thành viên: khai báo / sửa / xóa (chính chủ hoặc người có quyền sửa hồ sơ). */
export const paymentAccountApi = {
  save: (memberId: string, body: BankAccountDto & { note?: string | null }) =>
    api.put<MemberPaymentAccountDto>(paymentAccountKey(memberId), body),
  remove: (memberId: string) => api.del<{ ok: true }>(paymentAccountKey(memberId)),
};

/** Mã yêu cầu chống ghi trùng khi bấm đúp / thử lại. */
export const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (ch) =>
        (Number(ch) ^ (Math.random() * 16) >> (Number(ch) / 4)).toString(16)
      );
