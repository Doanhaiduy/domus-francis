"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type { ReminderDto, ReminderInput } from "../types/reminders";

export const REMINDERS_KEY = "/api/v1/reminders";
export const refreshReminders = () => globalMutate(REMINDERS_KEY);

export function useReminders(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<{ reminders: ReminderDto[]; canManage: boolean }>(enabled ? REMINDERS_KEY : null, swrFetcher, { revalidateOnFocus: false });
  return { reminders: data?.reminders ?? [], canManage: !!data?.canManage, loaded: !!data, error, isLoading, mutate };
}

export const remindersApi = {
  create: (b: ReminderInput) => api.post<ReminderDto>(REMINDERS_KEY, b),
  update: (id: string, b: ReminderInput) => api.patch<ReminderDto>(`${REMINDERS_KEY}/${id}`, b),
  remove: (id: string) => api.del(`${REMINDERS_KEY}/${id}`),
};
