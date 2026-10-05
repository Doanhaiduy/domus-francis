// Màu phụng vụ (màu áo lễ) và màu ngày đặc biệt của nhà — lớp Tailwind dùng trên lịch tháng và khung chi tiết ngày
import type { LitColor, SpecialDayColor } from "@/lib/types/liturgy";

export interface LitStyle {
  /** vạch màu dưới ô ngày / viền trái thẻ */
  bar: string;
  dot: string;
  chip: string;
  label: string;
}

export const LIT_COLOR: Record<LitColor, LitStyle> = {
  white: { bar: "bg-amber-300", dot: "bg-amber-200 ring-1 ring-amber-400", chip: "bg-amber-50 text-amber-800 border-amber-200", label: "Trắng" },
  red: { bar: "bg-rose-500", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200", label: "Đỏ" },
  green: { bar: "bg-emerald-500", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Xanh lá" },
  violet: { bar: "bg-violet-500", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200", label: "Tím" },
  rose: { bar: "bg-pink-400", dot: "bg-pink-400", chip: "bg-pink-50 text-pink-700 border-pink-200", label: "Hồng" },
  black: { bar: "bg-gray-700", dot: "bg-gray-700", chip: "bg-gray-100 text-gray-700 border-gray-300", label: "Đen" },
};

export const SPECIAL_COLOR: Record<SpecialDayColor, { cell: string; chip: string; label: string }> = {
  gold: { cell: "bg-amber-50 border-amber-400", chip: "bg-amber-100 text-amber-800 border-amber-300", label: "Vàng" },
  purple: { cell: "bg-purple-50 border-purple-400", chip: "bg-purple-100 text-purple-800 border-purple-300", label: "Tím" },
  blue: { cell: "bg-sky-50 border-sky-400", chip: "bg-sky-100 text-sky-800 border-sky-300", label: "Xanh dương" },
  rose: { cell: "bg-pink-50 border-pink-400", chip: "bg-pink-100 text-pink-800 border-pink-300", label: "Hồng" },
  green: { cell: "bg-emerald-50 border-emerald-400", chip: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "Xanh lá" },
  red: { cell: "bg-rose-50 border-rose-400", chip: "bg-rose-100 text-rose-800 border-rose-300", label: "Đỏ" },
};

export const CHECKIN_STATUS_LABEL = {
  submitted: "Đã check-in · chờ duyệt",
  approved: "Đã xác nhận",
  rejected: "Chưa hợp lệ",
} as const;

export const CHECKIN_STATUS_CLASS = {
  submitted: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
} as const;

/** "2026-10-05" → "05/10/2026" */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "2026-10-05" → "5/10" */
export const dm = (iso: string) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
