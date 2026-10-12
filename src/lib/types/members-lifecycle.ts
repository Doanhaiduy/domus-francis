// Vào / ra nhà của thành viên: danh sách việc còn treo khi rời nhà, kích hoạt lại, xuất danh sách tạm trú — DTO dùng chung client/server.
import type { LeaveKind } from "./leave";
import type { DisciplinePhase } from "./discipline";

export interface DepartureDuesItem {
  id: string;
  planName: string;
  dueDate: string;
  remainingVnd: number;
}
export interface DepartureDutyItem {
  id: string;
  weekStart: string;
  /** Người trực cùng (không tính người rời) */
  partners: string[];
}
export interface DepartureDisciplineItem {
  id: string;
  ruleTitle: string;
  phase: DisciplinePhase;
  isRed: boolean;
}
export interface DepartureLeaveItem {
  id: string;
  kind: LeaveKind;
  startsAt: string;
  endsAt: string;
}

/** Những việc còn treo của một thành viên trước khi đánh dấu "đã rời" / "cựu thành viên". */
export interface DepartureChecklistDto {
  member: { id: string; fullName: string; status: string };
  isSelf: boolean;
  dues: { items: DepartureDuesItem[]; totalVnd: number; canWaive: boolean };
  dutyWeeks: { items: DepartureDutyItem[]; canEdit: boolean };
  discipline: { items: DepartureDisciplineItem[]; canManage: boolean };
  leaves: { items: DepartureLeaveItem[]; canReview: boolean };
  /** Đã có hồ sơ cựu thành viên (alumni_profiles) */
  hasAlumniProfile: boolean;
}

export interface DepartureResultDto {
  status: "left" | "alumni";
  duesWaived: number;
  duesWaivedVnd: number;
  dutyWeeksUpdated: number;
  disciplineWaived: number;
  leavesRejected: number;
  alumniCreated: boolean;
}

export interface ReactivateResultDto {
  accountEnabled: boolean;
  roomAssigned: boolean;
}

/** Một dòng "Danh sách tạm trú" (khai báo tạm trú với công an): có CCCD đầy đủ ⇒ dữ liệu nhạy cảm, mỗi lần xuất ghi kiểm toán. */
export interface ResidenceRowDto {
  memberId: string;
  fullName: string;
  /** DD/MM/YYYY */
  birthDate: string | null;
  hometown: string | null;
  homeAddress: string | null;
  nationalId: string | null;
  /** DD/MM/YYYY */
  joinedOn: string | null;
  room: string | null;
}

export interface ResidenceExportDto {
  generatedAt: string;
  reason: string;
  rows: ResidenceRowDto[];
  /** Số thành viên chưa lưu CCCD */
  missingNationalId: number;
}
