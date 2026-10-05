"use client";
// Hook dữ liệu + thao tác phân hệ Thu Chi (SWR — làm mới sau mỗi thao tác ghi bằng refreshFinance()).
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  ContributionMatrixDto,
  ExpenseDetailDto,
  ExpenseDto,
  FinanceOptionsDto,
  FinanceOverviewDto,
  PaymentMethod,
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

export function useContributionMatrix(toMonth: string | undefined, months = 12, enabled = true) {
  const key = enabled ? `${FINANCE_KEY}/contributions?months=${months}${toMonth ? `&to=${toMonth}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR<ContributionMatrixDto>(key, swrFetcher, { keepPreviousData: true });
  return { matrix: data, error, isLoading, mutate };
}

/** Làm mới mọi dữ liệu tài chính đang hiển thị (tổng quan, danh sách phiếu, ma trận, chi tiết). */
export const refreshFinance = () => globalMutate((key) => typeof key === "string" && key.startsWith(FINANCE_KEY));

export interface ExpenseInput {
  title: string;
  amountVnd: number;
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
  createPlan: (body: { month: string; amountVnd: number; dueDate: string; fundId?: string }) =>
    api.post<{ id: string; generated: number; label: string }>(`${FINANCE_KEY}/contribution-plans`, body),
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
  voidPayment: (paymentId: string, reason: string) => api.post(`${FINANCE_KEY}/payments/${paymentId}/void`, { reason }),
  waive: (contributionId: string, discountVnd: number, reason?: string | null) =>
    api.post(`${FINANCE_KEY}/contributions/${contributionId}/waive`, { discountVnd, reason: reason ?? null }),
};

/** Mã yêu cầu chống ghi trùng khi bấm đúp / thử lại. */
export const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (ch) =>
        (Number(ch) ^ (Math.random() * 16) >> (Number(ch) / 4)).toString(16)
      );
