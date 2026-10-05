// Màu danh mục sự kiện theo mã (giữ bảng màu Tailwind của giao diện cũ)
export interface CatStyle {
  bg: string;
  dot: string;
  text: string;
  border: string;
}

export const CATEGORY_STYLES: Record<string, CatStyle> = {
  EVT_MASS: { bg: "bg-purple-100", dot: "bg-purple-600", text: "text-purple-800", border: "border-purple-200" },
  EVT_MEET: { bg: "bg-blue-100", dot: "bg-blue-600", text: "text-blue-800", border: "border-blue-200" },
  EVT_PATRON: { bg: "bg-rose-100", dot: "bg-rose-600", text: "text-rose-800", border: "border-rose-200" },
  EVT_TRIP: { bg: "bg-emerald-100", dot: "bg-emerald-600", text: "text-emerald-800", border: "border-emerald-200" },
  EVT_SOCIAL: { bg: "bg-amber-100", dot: "bg-amber-600", text: "text-amber-800", border: "border-amber-200" },
  EVT_CLEAN: { bg: "bg-cyan-100", dot: "bg-cyan-600", text: "text-cyan-800", border: "border-cyan-200" },
};

const FALLBACK: CatStyle = { bg: "bg-purple-50", dot: "bg-primary", text: "text-primary", border: "border-purple-200" };

export const catStyle = (code: string | undefined | null): CatStyle => (code && CATEGORY_STYLES[code]) || FALLBACK;
