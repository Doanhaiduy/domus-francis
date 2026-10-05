// Kiểu dữ liệu dùng chung client/server cho Lịch Phụng vụ trên trang Lịch sự kiện (/lich-su-kien) và trang Phụng vụ.
import type { LitColor, LitRank, LitSeason } from "@/lib/liturgy/engine";

export type { LitColor, LitRank, LitSeason };

/** Loại ngày phải check-in đi lễ: Chúa Nhật (không cần ảnh), lễ trọng, lễ Bổn mạng, ngày đặc biệt của nhà. */
export type MassOccasion = "sunday" | "solemnity" | "patron" | `special:${string}`;
export type MassCheckinStatus = "submitted" | "approved" | "rejected";

export interface ReadingSlotDto {
  kind: "r1" | "psalm" | "r2" | "alleluia" | "gospel";
  label: string;
  ref: string | null;
  headline?: string | null;
  intro?: string | null;
  text?: string | null;
  response?: string | null;
  verses?: string[];
  end?: string | null;
}

export interface ReadingSetDto {
  key: string;
  cycle: string;
  /** "Lễ Đêm", "Bài đọc ngày thường"… khi một ngày có nhiều bộ bài đọc */
  label: string | null;
  slots: ReadingSlotDto[];
}

export interface SpecialDayDto {
  id: string;
  title: string;
  description: string | null;
  month: number;
  day: number;
  /** null = lặp lại hằng năm */
  year: number | null;
  color: SpecialDayColor;
  requiresCheckin: boolean;
  evidenceRequired: boolean;
  notify: boolean;
  isActive: boolean;
  version: number;
}

export const SPECIAL_DAY_COLORS = ["gold", "purple", "blue", "rose", "green", "red"] as const;
export type SpecialDayColor = (typeof SPECIAL_DAY_COLORS)[number];

export interface SpecialDayInput {
  title: string;
  description?: string | null;
  month: number;
  day: number;
  year?: number | null;
  color?: SpecialDayColor;
  requiresCheckin?: boolean;
  evidenceRequired?: boolean;
  notify?: boolean;
  isActive?: boolean;
  version?: number;
}

export interface MassRequirementDto {
  occasion: MassOccasion;
  /** "Chúa Nhật", "Lễ trọng", "Lễ Bổn mạng", tên ngày đặc biệt */
  label: string;
  evidenceRequired: boolean;
  /** Hạn cuối được check-in (YYYY-MM-DD) */
  deadline: string;
}

export interface MassCheckinDto {
  id: string;
  date: string;
  occasion: MassOccasion;
  church: string | null;
  note: string | null;
  evidenceFileId: string | null;
  checkedInAt: string;
  status: MassCheckinStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  version: number;
}

/** Một ngày trên lịch tháng (gọn — không kèm toàn văn bài đọc). */
export interface CalendarDayDto {
  date: string;
  weekday: number;
  title: string;
  rank: LitRank;
  rankLabel: string;
  color: LitColor;
  season: LitSeason;
  seasonLabel: string;
  weekLabel: string | null;
  isSunday: boolean;
  isSolemnity: boolean;
  isObligation: boolean;
  isHighlight: boolean;
  tet: 0 | 1 | 2 | 3;
  lunarLabel: string;
  lunarDay: number;
  lunarMonth: number;
  fasting: "fast_abstinence" | "abstinence" | null;
  /** Ngày Bổn mạng của nhà */
  isPatron: boolean;
  special: { id: string; title: string; color: SpecialDayColor }[];
  /** Trích dẫn Tin Mừng của bộ bài đọc chính (hiển thị nhanh) */
  gospelRef: string | null;
  hasIntention: boolean;
  requirement: MassRequirementDto | null;
  myCheckin: { status: MassCheckinStatus; hasEvidence: boolean } | null;
}

export interface CalendarMonthDto {
  from: string;
  to: string;
  today: string;
  patron: { mmdd: string; label: string; name: string | null } | null;
  lectionaryReady: boolean;
  days: CalendarDayDto[];
}

export interface MassCheckinRowDto {
  memberId: string;
  name: string;
  room: string | null;
  avatarFileId: string | null;
  checkin: MassCheckinDto | null;
  /** Ảnh này trùng (gần giống) ảnh của người khác */
  duplicateOf: string | null;
  /** Cảnh báo cho người duyệt (vd. ảnh chụp không đúng dịp lễ) */
  warning: string | null;
}

/** Chi tiết một ngày: toàn văn Lời Chúa, ý lễ, ghi chú, check-in. */
export interface CalendarDayDetailDto extends CalendarDayDto {
  sundayCycle: string;
  weekdayCycle: string;
  psalterWeek: number | null;
  optional: { title: string; color: LitColor }[];
  notes: string[];
  intentions: string[];
  monthDevotion: string | null;
  houseIntention: string | null;
  houseNote: string | null;
  noteUpdatedBy: string | null;
  noteVersion: number | null;
  readings: ReadingSetDto[];
  altReadings: ReadingSetDto[];
  /** Liên kết bản chính thức (Nhóm Phiên Dịch CGKPV) */
  officialReadingsUrl: string;
  myCheckin: (MassCheckinDto & { hasEvidence: boolean }) | null;
  canCheckin: boolean;
  /** Lý do chưa/không check-in được (quá hạn, chưa tới ngày…) */
  checkinBlockedReason: string | null;
  canManage: boolean;
  /** Thống kê check-in (người quản lý): danh sách thành viên + trạng thái */
  attendance: { expected: number; checkedIn: number; rejected: number; rows: MassCheckinRowDto[] } | null;
  specialDetails: SpecialDayDto[];
}

export interface UpcomingFeastDto {
  date: string;
  title: string;
  kind: "solemnity" | "patron" | "special" | "tet" | "triduum";
  color: string;
  daysLeft: number;
  requiresCheckin: boolean;
  /** Mã ngày đặc biệt (kind = special) */
  specialId?: string;
  /** Ngày đặc biệt có bật nhắc trước */
  notify?: boolean;
}

export interface LectionaryStatusDto {
  entries: number;
  lastImport: { status: "running" | "succeeded" | "failed"; startedAt: string; finishedAt: string | null; error: string | null; stats: Record<string, unknown> } | null;
  source: string;
  canImport: boolean;
}

/** Báo cáo đi lễ của cả nhà trong một khoảng ngày (người quản lý). */
export interface MassReportDto {
  from: string;
  to: string;
  days: { date: string; title: string; label: string; evidenceRequired: boolean; expected: number; checkedIn: number }[];
  members: { memberId: string; name: string; room: string | null; required: number; attended: number; missing: string[] }[];
}
