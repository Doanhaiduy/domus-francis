// DTO phân hệ Bếp & Cơm (thực đơn, đăng ký suất, kho bếp, yêu cầu mua thêm, danh sách cần mua, khảo sát món, góp ý)

export type MealType = "lunch" | "dinner";
export type MenuStatus = "draft" | "open" | "closed" | "served" | "cancelled";
export type CookRole = "lead" | "assistant" | "shopper";

export interface MealCookDto {
  memberId: string;
  name: string;
  role: CookRole;
}

/** Trạng thái đăng ký của một người cho một bữa (null = chưa đăng ký). */
export interface RegStateDto {
  willEat: boolean;
  guests: number;
  note: string | null;
  registeredBy: string | null; // tên người ghi (khi Ban Ẩm thực chốt hộ)
}

export interface MealSlotDto {
  menuId: string | null; // null = Ban Ẩm thực chưa mở bữa này (đăng ký lần đầu sẽ tự mở)
  date: string; // YYYY-MM-DD
  meal: MealType;
  title: string | null;
  dishes: string[];
  status: MenuStatus | null;
  cutoffAt: string; // ISO — hạn chốt suất
  pastCutoff: boolean;
  /** Thành viên thường không còn tự sửa được (quá giờ chốt / bữa không mở / phân hệ tắt) */
  locked: boolean;
  costPerServing: number | null; // VND — chi phí riêng của bữa (không bắt buộc)
  cooks: MealCookDto[];
  eaters: number;
  guests: number;
  mine: RegStateDto | null;
  rating: { avg: number; count: number } | null;
  myFeedback: { rating: number; comment: string | null } | null;
}

export interface MealDayDto {
  date: string;
  weekday: string; // T2 … CN
  weekdayLong: string; // Thứ Hai … Chúa Nhật
  isToday: boolean;
  isPast: boolean;
  liturgy: string | null;
  lunch: MealSlotDto;
  dinner: MealSlotDto;
}

export interface MealRosterRowDto {
  memberId: string;
  name: string;
  fullName: string;
  room: string;
  avatarText: string;
  avatarFileId: string | null;
  onLeave: boolean;
  lunch: RegStateDto | null;
  dinner: RegStateDto | null;
}

export interface MealSettingsDto {
  lunchCutoff: string; // HH:mm
  dinnerCutoff: string;
}

export interface MealsWeekDto {
  enabled: boolean;
  today: string;
  now: string;
  selectedDate: string;
  weekStart: string;
  weekEnd: string;
  weekNo: number;
  academicYear: string | null;
  settings: MealSettingsDto;
  days: MealDayDto[];
  /** Ban Ẩm thực: mọi thành viên đang ở; thành viên thường: chỉ chính mình (RLS meal_registrations) */
  roster: MealRosterRowDto[];
  activeMembers: number;
  meId: string | null;
  canManage: boolean;
  canRegister: boolean;
  canToggleFeature: boolean;
}

export interface MealFeedbackItemDto {
  id: string;
  memberId: string;
  memberName: string;
  rating: number;
  comment: string | null;
  updatedAt: string;
  mine: boolean;
}

export interface MealFeedbackDto {
  menuId: string;
  date: string;
  meal: MealType;
  summary: { avg: number; count: number } | null;
  items: MealFeedbackItemDto[]; // Ban Ẩm thực: tất cả; thành viên: của mình
}

export interface MealSurveyOptionDto {
  id: string;
  label: string;
  votes: number;
  suggestedBy: string | null;
  mine: boolean;
}

export interface MealSurveyDto {
  id: string;
  title: string;
  description: string | null;
  maxChoices: number;
  allowSuggestions: boolean;
  targetWeek: string | null;
  status: "open" | "closed";
  closesAt: string | null;
  createdBy: string | null;
  createdAt: string;
  voters: number;
  options: MealSurveyOptionDto[];
}

export interface MealsSummaryDto {
  enabled: boolean;
  date: string;
  activeMembers: number;
  lunch: { eaters: number; guests: number; cutoffAt: string; pastCutoff: boolean; dishes: string[]; cooks: string[] };
  dinner: { eaters: number; guests: number; cutoffAt: string; pastCutoff: boolean; dishes: string[]; cooks: string[] };
  mine: { lunch: boolean | null; dinner: boolean | null };
  pantryUrgent: number;
  pantryLow: number;
  openRestockRequests: number;
  shoppingPending: number;
  openSurvey: { id: string; title: string } | null;
}

// ---- Kho bếp ----
export type StockStatus = "ok" | "low" | "urgent";

export interface PantryItemDto {
  id: string;
  name: string;
  unit: string;
  qty: number;
  par: number;
  icon: string | null;
  status: StockStatus;
  lastRestockedOn: string | null;
  openRequestId: string | null;
  onShoppingList: boolean;
}

export type RestockStatus = "open" | "approved" | "bought" | "rejected" | "cancelled";

export interface RestockRequestDto {
  id: string;
  pantryItemId: string | null;
  itemName: string;
  qty: number | null;
  unit: string | null;
  note: string | null;
  status: RestockStatus;
  requestedById: string;
  requestedBy: string;
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  mine: boolean;
}

export interface ShoppingItemDto {
  id: string;
  name: string;
  qty: number | null;
  unit: string | null;
  note: string | null;
  pantryItemId: string | null;
  restockRequestId: string | null;
  neededOn: string | null;
  estCostVnd: number | null;
  isPurchased: boolean;
  purchasedAt: string | null;
  purchasedBy: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PantryDto {
  items: PantryItemDto[];
  requests: RestockRequestDto[];
  shopping: ShoppingItemDto[];
  canManage: boolean;
  canRequest: boolean;
  today: string;
}
