// DTO + hằng số + tiện ích thuần cho Cài đặt → "Danh mục học tập" (/api/v1/academic/config/**):
// trường đại học, năm học (kèm học kỳ), nhiệm kỳ người quản lý. Dùng chung client/server.

export const SEMESTER_CODES = ["HK1", "HK2", "HE"] as const;
export type SemesterCode = (typeof SEMESTER_CODES)[number];
export const SEMESTER_LABEL: Record<SemesterCode, string> = { HK1: "Học kỳ 1", HK2: "Học kỳ 2", HE: "Học kỳ hè" };

export const TERM_STATUSES = ["planned", "active", "closed"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];
export const TERM_STATUS_LABEL: Record<TermStatus, string> = { planned: "Sắp tới", active: "Đang hiệu lực", closed: "Đã bàn giao" };

export const UNIVERSITY_CODE_RE = /^[A-Z0-9_]+$/;
export const ACADEMIC_YEAR_CODE_RE = /^(\d{4})-(\d{4})$/;

export interface UniversityDto {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  city: string | null;
  isActive: boolean;
  /** Đã xóa mềm (chỉ người quản lý thấy). */
  deletedAt: string | null;
  /** Số bản ghi đang dùng (hồ sơ sinh viên, bảng điểm, môn học, thang điểm) — null nếu không có quyền xem. */
  usage: number | null;
}

export interface ConfigSemesterDto {
  id: string;
  academicYearId: string;
  code: SemesterCode;
  codeLabel: string;
  name: string;
  ordinal: number;
  startsOn: string;
  endsOn: string;
  /** Hôm nay nằm trong học kỳ. */
  isOngoing: boolean;
  usage: number | null;
}

export interface AcademicYearDto {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  /** Cờ "năm học hiện hành" (duy nhất) — dùng cho phân phòng, lịch trực, … */
  isCurrent: boolean;
  isOngoing: boolean;
  semesters: ConfigSemesterDto[];
  usage: number | null;
}

export interface BoardTermDto {
  id: string;
  academicYearId: string | null;
  academicYearName: string | null;
  name: string;
  startsOn: string;
  endsOn: string;
  status: TermStatus;
  statusLabel: string;
  closedAt: string | null;
  handoverNotes: string | null;
  usage: number | null;
}

export interface AcademicConfigPermissions {
  /** academic.university.manage hoặc academic.scale.manage */
  universities: boolean;
  /** term.manage — năm học, học kỳ, nhiệm kỳ */
  terms: boolean;
  /** term.handover — đóng nhiệm kỳ / mở lại nhiệm kỳ đã bàn giao */
  handover: boolean;
}

export interface AcademicConfigDto {
  universities: UniversityDto[];
  years: AcademicYearDto[];
  boardTerms: BoardTermDto[];
  today: string;
  permissions: AcademicConfigPermissions;
}

export interface UniversityInput {
  code: string;
  name: string;
  shortName?: string | null;
  city?: string | null;
  isActive?: boolean;
}
export interface UniversityPatch extends Partial<UniversityInput> {
  /** Khôi phục trường đã xóa mềm. */
  restore?: boolean;
}

export interface SemesterDraft {
  code: SemesterCode;
  name?: string | null;
  startsOn: string;
  endsOn: string;
}
export interface SemesterInput extends SemesterDraft {
  academicYearId: string;
}
export type SemesterPatch = Partial<SemesterDraft>;

export interface AcademicYearInput {
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent?: boolean;
  /** Học kỳ tạo kèm (gợi ý HK1/HK2/HE — bỏ chọn được). */
  semesters?: SemesterDraft[];
}
export interface AcademicYearPatch {
  code?: string;
  name?: string;
  startsOn?: string;
  endsOn?: string;
  /** Chỉ nhận true: đặt làm năm học hiện hành (bỏ cờ năm khác trong cùng giao dịch). */
  isCurrent?: true;
}

export interface BoardTermInput {
  name: string;
  academicYearId?: string | null;
  startsOn: string;
  endsOn: string;
  status?: "planned" | "active";
  handoverNotes?: string | null;
}
export interface BoardTermPatch extends Partial<Omit<BoardTermInput, "status">> {
  status?: TermStatus;
}

// ---------------------------------------------------------------------
// Gợi ý nhanh khi tạo năm học: 01/09 → 31/08 năm sau; HK1 09–01, HK2 02–06, HE 07–08
// ---------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12

export interface AcademicYearSuggestion {
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  semesters: { code: SemesterCode; name: string; startsOn: string; endsOn: string }[];
}

export function suggestYearFor(startYear: number): AcademicYearSuggestion {
  const y = startYear;
  const n = y + 1;
  return {
    code: `${y}-${n}`,
    name: `Năm học ${y} – ${n}`,
    startsOn: `${y}-09-01`,
    endsOn: `${n}-08-31`,
    semesters: [
      { code: "HK1", name: SEMESTER_LABEL.HK1, startsOn: `${y}-09-01`, endsOn: `${n}-01-${pad(lastDay(n, 1))}` },
      { code: "HK2", name: SEMESTER_LABEL.HK2, startsOn: `${n}-02-01`, endsOn: `${n}-06-30` },
      { code: "HE", name: SEMESTER_LABEL.HE, startsOn: `${n}-07-01`, endsOn: `${n}-08-31` },
    ],
  };
}

/** Năm học tiếp theo chưa có: sau năm học kết thúc muộn nhất (hoặc theo hôm nay nếu chưa có năm nào). */
export function suggestNextAcademicYear(years: { code: string; endsOn: string }[], today: string): AcademicYearSuggestion {
  if (!years.length) {
    const [ty, tm] = today.split("-").map(Number);
    return suggestYearFor(tm >= 8 ? ty : ty - 1);
  }
  const ends = years.map((y) => y.endsOn).sort();
  const latestEnd = ends[ends.length - 1];
  const endYear = Number(latestEnd.slice(0, 4));
  let start = latestEnd < `${endYear}-09-01` ? endYear : endYear + 1;
  // không trùng mã đã có
  const codes = new Set(years.map((y) => y.code));
  while (codes.has(`${start}-${start + 1}`)) start++;
  return suggestYearFor(start);
}

/** "15/08/2026" */
export const fmtDmy = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split("-").reverse().join("/") : "");

/** "01/09/2026 – 31/08/2027" */
export const fmtRange = (a: string, b: string) => `${fmtDmy(a)} – ${fmtDmy(b)}`;
