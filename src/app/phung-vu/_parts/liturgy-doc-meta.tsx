import type { LucideIcon } from "lucide-react";
import { BookOpen, FileText, Link2, Music, SquarePlay, StickyNote } from "lucide-react";
import { LITURGY_DOC_KIND_LABEL, type LiturgyDocKind } from "@/lib/types/liturgy-documents";

/** Biểu tượng + màu theo loại tài liệu phụng vụ (dùng chung danh sách, chi tiết, biểu mẫu). */
export const KIND_META: Record<LiturgyDocKind, { label: string; short: string; hint: string; icon: LucideIcon; tone: string }> = {
  prayer: { label: LITURGY_DOC_KIND_LABEL.prayer, short: "Kinh", hint: "Lời kinh, giữ nguyên xuống dòng", icon: BookOpen, tone: "bg-purple-100 text-purple-700" },
  song: { label: LITURGY_DOC_KIND_LABEL.song, short: "Bài hát", hint: "Lời bài hát, điệp khúc", icon: Music, tone: "bg-sky-100 text-sky-700" },
  youtube: { label: LITURGY_DOC_KIND_LABEL.youtube, short: "YouTube", hint: "Liên kết youtube.com / youtu.be", icon: SquarePlay, tone: "bg-rose-100 text-rose-600" },
  pdf: { label: LITURGY_DOC_KIND_LABEL.pdf, short: "PDF", hint: "Tải lên tệp PDF (≤ 20 MB)", icon: FileText, tone: "bg-amber-100 text-amber-700" },
  link: { label: LITURGY_DOC_KIND_LABEL.link, short: "Liên kết", hint: "Trang web tham khảo", icon: Link2, tone: "bg-emerald-100 text-emerald-700" },
  note: { label: LITURGY_DOC_KIND_LABEL.note, short: "Ghi chú", hint: "Bài đọc, hướng dẫn, ghi chú", icon: StickyNote, tone: "bg-slate-100 text-slate-600" },
};

/** Chuyên mục gợi ý khi nhập (ghép với các chuyên mục đã có). */
export const SUGGESTED_CATEGORIES = [
  "Kinh hằng ngày",
  "Giờ kinh Phụng vụ",
  "Thánh lễ",
  "Mùa Vọng",
  "Mùa Giáng Sinh",
  "Mùa Chay",
  "Mùa Phục Sinh",
  "Đức Mẹ",
  "Lịch phụng vụ",
  "Hướng dẫn",
];

export const fmtBytes = (n: number | null | undefined) =>
  n == null ? "" : n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
