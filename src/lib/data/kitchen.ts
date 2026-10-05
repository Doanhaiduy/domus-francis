"use client";
// Hook dữ liệu + thao tác phân hệ Bếp & Cơm (SWR — làm mới sau mỗi thao tác ghi, khi quay lại tab)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  MealFeedbackDto,
  MealSettingsDto,
  MealSurveyDto,
  MealsSummaryDto,
  MealsWeekDto,
  MealType,
  CookRole,
  MenuStatus,
  PantryDto,
} from "../types/kitchen";

export const MEALS_KEY = "/api/v1/meals";
export const SURVEYS_KEY = "/api/v1/meals/surveys";
export const PANTRY_KEY = "/api/v1/pantry";

export function useMealsWeek(date: string | null) {
  const key = date ? `${MEALS_KEY}?date=${date}` : MEALS_KEY;
  const { data, error, isLoading, mutate } = useSWR<MealsWeekDto>(key, swrFetcher, { keepPreviousData: true, refreshInterval: 60_000 });
  return { week: data, error, isLoading, mutate };
}

export function useMealSurveys() {
  const { data, error, isLoading, mutate } = useSWR<MealSurveyDto[]>(SURVEYS_KEY, swrFetcher, { keepPreviousData: true });
  return { surveys: data ?? [], error, isLoading, mutate };
}

export function usePantry() {
  const { data, error, isLoading, mutate } = useSWR<PantryDto>(PANTRY_KEY, swrFetcher, { keepPreviousData: true });
  return { pantry: data, error, isLoading, mutate };
}

export function useMealFeedback(menuId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<MealFeedbackDto>(menuId ? `${MEALS_KEY}/menus/${menuId}/feedback` : null, swrFetcher);
  return { feedback: data, error, isLoading, mutate };
}

export function useMealsSummary(enabled = true) {
  const { data } = useSWR<MealsSummaryDto>(enabled ? `${MEALS_KEY}/summary` : null, swrFetcher, { refreshInterval: 120_000 });
  return data;
}

/** Làm mới mọi dữ liệu bữa ăn (mọi tuần đã tải, tóm tắt, khảo sát). */
export const refreshMeals = () => globalMutate((key) => typeof key === "string" && key.startsWith(MEALS_KEY));
export const refreshPantry = () => globalMutate((key) => typeof key === "string" && key.startsWith(PANTRY_KEY));

export interface MenuMealInput {
  title?: string | null;
  dishes: string[];
  status?: MenuStatus;
  costPerServing?: number | null;
  cutoffTime?: string | null;
}

export const mealsApi = {
  register: (b: { date: string; meal: MealType; willEat: boolean; memberId?: string; guests?: number; note?: string | null }) =>
    api.put<{ menuId: string }>(`${MEALS_KEY}/registrations`, b),
  registerWeek: (date: string) =>
    api.post<{ registered: number; skipped: number; message: string }>(`${MEALS_KEY}/registrations/bulk`, { scope: "self-week", date }),
  registerAll: (date: string, meals?: MealType[]) =>
    api.post<{ registered: number; skipped: number; message: string }>(`${MEALS_KEY}/registrations/bulk`, { scope: "all-members", date, meals }),
  saveMenuDay: (b: { date: string; lunch?: MenuMealInput; dinner?: MenuMealInput; cooks?: { memberId: string; role: CookRole }[] }) =>
    api.put(`${MEALS_KEY}/menus`, b),
  putFeedback: (menuId: string, rating: number, comment: string | null) =>
    api.put<MealFeedbackDto>(`${MEALS_KEY}/menus/${menuId}/feedback`, { rating, comment }),
  deleteFeedback: (menuId: string, feedbackId?: string) =>
    api.del<MealFeedbackDto>(`${MEALS_KEY}/menus/${menuId}/feedback${feedbackId ? `?feedbackId=${feedbackId}` : ""}`),
  createSurvey: (b: { title: string; description?: string | null; maxChoices: number; allowSuggestions: boolean; targetWeek?: string | null; closesOn?: string | null; options: string[] }) =>
    api.post<{ id: string; surveys: MealSurveyDto[] }>(SURVEYS_KEY, b),
  setSurveyStatus: (id: string, status: "open" | "closed") => api.patch<MealSurveyDto[]>(`${SURVEYS_KEY}/${id}`, { status }),
  deleteSurvey: (id: string) => api.del<MealSurveyDto[]>(`${SURVEYS_KEY}/${id}`),
  vote: (id: string, optionIds: string[]) => api.put<MealSurveyDto[]>(`${SURVEYS_KEY}/${id}/votes`, { optionIds }),
  suggest: (id: string, label: string) => api.post<MealSurveyDto[]>(`${SURVEYS_KEY}/${id}/options`, { label }),
  updateSettings: (b: { enabled?: boolean; pricePerServing?: number; lunchCutoff?: string; dinnerCutoff?: string }) =>
    api.patch<MealSettingsDto>(`${MEALS_KEY}/settings`, b),
};

export const pantryApi = {
  createItem: (b: { name: string; unit: string; qtyOnHand: number; parLevel: number; icon?: string | null }) =>
    api.post<{ id: string; pantry: PantryDto }>(`${PANTRY_KEY}/items`, b),
  updateItem: (id: string, b: { name?: string; unit?: string; qtyOnHand?: number; parLevel?: number; icon?: string | null; delta?: number }) =>
    api.patch<PantryDto>(`${PANTRY_KEY}/items/${id}`, b),
  archiveItem: (id: string) => api.del<PantryDto>(`${PANTRY_KEY}/items/${id}`),
  request: (b: { pantryItemId?: string | null; itemName?: string | null; qty?: number | null; unit?: string | null; note?: string | null }) =>
    api.post<{ id: string; pantry: PantryDto }>(`${PANTRY_KEY}/restock-requests`, b),
  actOnRequest: (id: string, action: "approve" | "reject" | "cancel", note?: string | null) =>
    api.patch<PantryDto>(`${PANTRY_KEY}/restock-requests/${id}`, { action, note: note ?? null }),
  addShopping: (b: { name?: string | null; qty?: number | null; unit?: string | null; note?: string | null; pantryItemId?: string | null; neededOn?: string | null; estCostVnd?: number | null }) =>
    api.post<{ id: string; pantry: PantryDto }>(`${PANTRY_KEY}/shopping`, b),
  updateShopping: (id: string, b: { isPurchased?: boolean; name?: string; qty?: number | null; unit?: string | null; note?: string | null; neededOn?: string | null; estCostVnd?: number | null }) =>
    api.patch<PantryDto>(`${PANTRY_KEY}/shopping/${id}`, b),
  deleteShopping: (id: string) => api.del<PantryDto>(`${PANTRY_KEY}/shopping/${id}`),
};
