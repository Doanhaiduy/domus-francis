// Định dạng & thống kê phân hệ Học tập (dùng chung trang /hoc-tap) — không gọi mạng.
import type { AcademicRecordDto, AcademicStatus, GoalsVisibility, SemesterDto } from "./types/academic";

export const RANK_ORDER = ["Xuất sắc", "Giỏi", "Khá", "Trung bình", "Cần cố gắng"] as const;

export const RANK_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  "Xuất sắc": { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" },
  "Giỏi": { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  "Khá": { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  "Trung bình": { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  "Cần cố gắng": { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200" },
};
export const NO_RANK_BADGE = { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" };
export const rankBadge = (rank: string | null) => (rank ? RANK_BADGES[rank] ?? NO_RANK_BADGE : NO_RANK_BADGE);

export const STATUS_META: Record<AcademicStatus, { label: string; cls: string }> = {
  draft: { label: "Bản nháp", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  submitted: { label: "Chờ xác minh", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  verified: { label: "Đã xác minh", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Bị trả lại", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const VISIBILITY_LABEL: Record<GoalsVisibility, string> = {
  private: "Chỉ mình tôi",
  leadership: "Ban điều hành",
  community: "Cả cộng đoàn",
};

export const semesterLabel = (s: Pick<SemesterDto, "name" | "yearCode">) => `${s.name} • ${s.yearCode}`;

/** Điểm: bỏ số 0 thừa (8.50 → 8.5), trống ⇒ "—" */
export function fmtScore(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return String(Number(v.toFixed(digits)));
}
/** GPA luôn 2 chữ số thập phân */
export const fmtGpa = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toFixed(2));

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

export interface AcademicStats {
  /** Số bảng điểm trong phạm vi lọc */
  total: number;
  /** Số bảng điểm đã có GPA (đủ điểm tổng kết ít nhất một môn) */
  ranked: number;
  /** Số thành viên khác nhau */
  students: number;
  avgGpa4: number | null;
  avgGpa10: number | null;
  excellentOrGood: number;
  byRank: Record<string, number>;
  /** Số thành viên (khác nhau) có bảng điểm đạt học bổng */
  scholarship: number;
  needSupport: number;
  pending: number;
  verified: number;
}

/** Thống kê tính từ chính các bảng điểm người xem nhìn thấy được (RLS đã lọc). Trung bình không trọng số theo bảng điểm. */
export function computeStats(records: AcademicRecordDto[]): AcademicStats {
  const withGpa = records.filter((r) => r.gpa4 !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null);
  const byRank: Record<string, number> = {};
  for (const r of withGpa) if (r.rank) byRank[r.rank] = (byRank[r.rank] ?? 0) + 1;
  return {
    total: records.length,
    ranked: withGpa.length,
    students: new Set(records.map((r) => r.memberId)).size,
    avgGpa4: avg(withGpa.map((r) => r.gpa4 as number)),
    avgGpa10: avg(withGpa.filter((r) => r.gpa10 !== null).map((r) => r.gpa10 as number)),
    excellentOrGood: withGpa.filter((r) => r.rank === "Xuất sắc" || r.rank === "Giỏi").length,
    byRank,
    scholarship: new Set(records.filter((r) => r.hasScholarship).map((r) => r.memberId)).size,
    needSupport: new Set(records.filter((r) => r.support).map((r) => r.memberId)).size,
    pending: records.filter((r) => r.status === "submitted").length,
    verified: records.filter((r) => r.status === "verified").length,
  };
}

/**
 * Tin nhắn Zalo tổng hợp học lực (sao chép clipboard). Chỉ dùng dữ liệu người xem đang thấy.
 * Danh sách tuyên dương chỉ gồm bảng điểm ĐÃ XÁC MINH xếp loại Giỏi/Xuất sắc và không ghi điểm số chi tiết —
 * điểm cá nhân là dữ liệu nhạy cảm, tin nhắn nhóm thì cả cộng đoàn đọc được.
 */
export function formatAcademicZalo(opts: {
  records: AcademicRecordDto[];
  scopeLabel: string;
  personal: boolean;
}): string {
  const { records, scopeLabel, personal } = opts;
  const s = computeStats(records);
  let text = `🎓 BÁO CÁO HỌC LỰC & ĐIỂM SỐ LƯU XÁ PHANXICÔ\n`;
  text += `Phạm vi: ${scopeLabel}\n\n`;
  if (personal) {
    text += `📘 Kết quả học tập của tôi:\n`;
    if (!records.length) text += `• Chưa có bảng điểm nào trong phạm vi này.\n`;
    for (const r of records) {
      text += `• ${semesterLabel(r.semester)} — ${r.university.shortName ?? r.university.name}: `;
      text += r.gpa4 !== null ? `GPA ${fmtGpa(r.gpa4)}/4 (${fmtGpa(r.gpa10)}/10)${r.rank ? ` – ${r.rank}` : ""}` : "chưa đủ điểm tổng kết";
      text += ` [${STATUS_META[r.status].label}${r.gpaPreview && r.gpa4 !== null ? ", tạm tính" : ""}]\n`;
    }
  } else {
    text += `📊 Thống kê chung (${s.total} bảng điểm, ${s.students} anh em):\n`;
    text += `• GPA trung bình: ${s.avgGpa4 !== null ? fmtGpa(s.avgGpa4) : "—"} / 4.0\n`;
    text += `• Giỏi & Xuất sắc: ${s.excellentOrGood}/${s.ranked}\n`;
    text += `• Đạt học bổng: ${s.scholarship} anh em\n`;
    text += `• Cần hỗ trợ phụ đạo: ${s.needSupport} anh em\n`;
    text += `• Đã xác minh: ${s.verified} • Chờ xác minh: ${s.pending}\n`;
    // Mỗi anh em một dòng: bảng điểm đã xác minh của học kỳ gần nhất trong phạm vi
    const latest = new Map<string, AcademicRecordDto>();
    for (const r of records) {
      if (r.status !== "verified") continue;
      const cur = latest.get(r.memberId);
      if (!cur || r.semester.startsOn > cur.semester.startsOn) latest.set(r.memberId, r);
    }
    const multiSemester = new Set(records.map((r) => r.semester.id)).size > 1;
    const honor = Array.from(latest.values())
      .filter((r) => r.rank === "Xuất sắc" || r.rank === "Giỏi")
      .sort((a, b) => RANK_ORDER.indexOf(a.rank as (typeof RANK_ORDER)[number]) - RANK_ORDER.indexOf(b.rank as (typeof RANK_ORDER)[number]) || a.memberName.localeCompare(b.memberName, "vi"));
    if (honor.length) {
      text += `\n🏆 Tuyên dương (đã xác minh):\n`;
      honor.slice(0, 10).forEach((r, i) => {
        const where = [r.room, r.university.shortName ?? r.university.name, multiSemester ? semesterLabel(r.semester) : null].filter(Boolean).join(" – ");
        text += `${i + 1}. ${r.memberName} (${where}): ${r.rank}${r.hasScholarship ? " ⭐ học bổng" : ""}\n`;
      });
    }
  }
  text += `\nPax et Bonum - Ban Học Tập Lưu Xá Sinh Viên Phanxicô`;
  return text;
}
