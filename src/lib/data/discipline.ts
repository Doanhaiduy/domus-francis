"use client";
// Hook dữ liệu + thao tác Vi phạm & kỷ luật (SWR)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { DisciplineListDto, DisciplineQuery, DisciplineRuleDto, PenaltyKind } from "../types/discipline";

export const DISCIPLINE_KEY = "/api/v1/discipline";
const refresh = () => globalMutate((k) => typeof k === "string" && k.startsWith(DISCIPLINE_KEY));

function recordsUrl(q: DisciplineQuery): string {
  const p = new URLSearchParams();
  if (q.mine) p.set("mine", "1");
  if (q.memberId) p.set("memberId", q.memberId);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.phase) p.set("phase", q.phase);
  if (q.q?.trim()) p.set("q", q.q.trim());
  const s = p.toString();
  return `${DISCIPLINE_KEY}/records${s ? `?${s}` : ""}`;
}

export function useDisciplineRecords(q: DisciplineQuery, enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<DisciplineListDto>(enabled ? recordsUrl(q) : null, swrFetcher, { keepPreviousData: true });
  return { data, error, isLoading: isLoading && !data, mutate };
}

export function useDisciplineRules(enabled = true) {
  const { data, error, isLoading } = useSWR<{ canManage: boolean; rules: DisciplineRuleDto[] }>(enabled ? `${DISCIPLINE_KEY}/rules` : null, swrFetcher, { keepPreviousData: true });
  return { canManage: data?.canManage ?? false, rules: data?.rules ?? [], error, isLoading: isLoading && !data };
}

export interface RecordPayload {
  memberId?: string;
  ruleId?: string | null;
  ruleTitle?: string | null;
  occurredOn?: string;
  note?: string | null;
  penaltyKind?: PenaltyKind;
  penaltyQty?: number | null;
  penaltyDetail?: string | null;
  penaltyStartsOn?: string | null;
  penaltyEndsOn?: string | null;
}

export interface RulePayload {
  code: string;
  title: string;
  description?: string | null;
  defaultPenaltyKind: PenaltyKind;
  defaultPenaltyQty?: number | null;
  defaultPenaltyNote?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const disciplineApi = {
  createRecord: async (b: RecordPayload) => {
    const r = await api.post<{ id: string }>(`${DISCIPLINE_KEY}/records`, b);
    await refresh();
    return r;
  },
  updateRecord: async (id: string, b: RecordPayload) => {
    await api.patch(`${DISCIPLINE_KEY}/records/${id}`, b);
    await refresh();
  },
  act: async (id: string, action: "complete" | "waive" | "reopen", reason?: string) => {
    await api.patch(`${DISCIPLINE_KEY}/records/${id}`, { action, reason: reason ?? null });
    await refresh();
  },
  deleteRecord: async (id: string) => {
    await api.del(`${DISCIPLINE_KEY}/records/${id}`);
    await refresh();
  },
  createRule: async (b: RulePayload) => {
    const r = await api.post<{ id: string }>(`${DISCIPLINE_KEY}/rules`, b);
    await refresh();
    return r;
  },
  updateRule: async (id: string, b: Partial<RulePayload>) => {
    await api.patch(`${DISCIPLINE_KEY}/rules/${id}`, b);
    await refresh();
  },
  deleteRule: async (id: string) => {
    await api.del(`${DISCIPLINE_KEY}/rules/${id}`);
    await refresh();
  },
  importRules: async () => {
    const r = await api.post<{ created: number; skipped: number }>(`${DISCIPLINE_KEY}/rules/import`);
    await refresh();
    return r;
  },
};
