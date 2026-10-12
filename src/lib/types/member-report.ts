// Tổng kết theo thành viên + cả nhà (tháng / quý / năm) — DTO dùng chung client/server.

export type MemberReportKind = "month" | "quarter" | "year";
export type MemberReportScope = "all" | "me";

/** Phần số liệu nào người xem được thấy (theo quyền); phần không thấy được thì trả null trong từng dòng. */
export interface MemberReportSections {
  attendance: boolean;
  leave: boolean;
  duty: boolean;
  merit: boolean;
  discipline: boolean;
  finance: boolean;
  donations: boolean;
  academic: boolean;
  /** Đi lễ (check-in đi lễ các ngày bắt buộc) — cả nhà: người có liturgy.calendar.manage */
  mass: boolean;
}

export interface MemberAttendanceStat {
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** (có mặt + trễ) / (có mặt + trễ + vắng không phép); null nếu chưa có buổi nào */
  ratePct: number | null;
}
export interface MemberLeaveStat {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  lateReturn: number;
  overnightOut: number;
  longLeave: number;
  eventAbsence: number;
}
/** Đi lễ trong kỳ: các ngày bắt buộc check-in (Chúa Nhật, lễ trọng, Bổn mạng, ngày đặc biệt) đã đến, trong thời gian ở nhà. */
export interface MemberMassStat {
  /** Số lễ phải tính = đã check-in (xác nhận + chờ duyệt) + vắng. Ngày còn trong hạn check-in mà chưa check-in chưa tính. */
  required: number;
  /** Check-in đã được xác nhận (người duyệt hoặc tự xác nhận) */
  approved: number;
  /** Check-in đang chờ duyệt */
  pending: number;
  /** Vắng: quá hạn chưa check-in hoặc check-in bị đánh dấu chưa hợp lệ */
  missed: number;
  /** (xác nhận + chờ duyệt) / phải tính; null nếu chưa có lễ nào phải tính */
  ratePct: number | null;
}
export interface MemberDutyStat {
  /** Số tuần trực vệ sinh sân */
  weeks: number;
  reviewed: number;
  /** Điểm trung bình các tuần đã chấm (0–10) */
  avgScore: number | null;
  redo: number;
}
export interface MemberDisciplineStat {
  count: number;
  /** Đang xử lý: sắp tới + đang chấp hành + quá hạn */
  active: number;
  overdue: number;
  completed: number;
  waived: number;
  rosary: number;
  mass: number;
  duty: number;
  other: number;
}
export interface MemberFinanceStat {
  dueVnd: number;
  paidVnd: number;
  owedVnd: number;
  overdueVnd: number;
  unpaidCount: number;
}
export interface MemberDonationStat {
  count: number;
  totalVnd: number;
}
export interface MemberAcademicStat {
  semester: string;
  gpa10: number | null;
  gpa4: number | null;
}

export interface MemberReportRow {
  memberId: string;
  name: string;
  fullName: string;
  room: string | null;
  status: string;
  attendance: MemberAttendanceStat | null;
  leave: MemberLeaveStat | null;
  duty: MemberDutyStat | null;
  /** Đi lễ (null nếu không có quyền xem) */
  mass: MemberMassStat | null;
  /** Tổng điểm thi đua cộng/trừ trong kỳ (null nếu không có quyền xem) */
  merit: { points: number; entries: number } | null;
  discipline: MemberDisciplineStat | null;
  finance: MemberFinanceStat | null;
  donations: MemberDonationStat | null;
  academic: MemberAcademicStat | null;
}

export interface MemberReportEventsByCategory {
  code: string;
  name: string;
  count: number;
}

export interface MemberReportDto {
  kind: MemberReportKind;
  scope: MemberReportScope;
  year: number;
  month: number | null;
  quarter: number | null;
  label: string;
  from: string;
  to: string;
  generatedAt: string;
  house: { name: string; orderName: string | null; address: string | null };
  sections: MemberReportSections;
  members: MemberReportRow[];
  /** Số liệu cả nhà trong kỳ */
  house_totals: {
    memberCount: number;
    events: { total: number; completed: number; cancelled: number; pilgrimages: number; rosary: number; byCategory: MemberReportEventsByCategory[] };
    attendance: (MemberAttendanceStat & { records: number }) | null;
    leave: MemberLeaveStat | null;
    duty: { weeks: number; avgScore: number | null } | null;
    /** Đi lễ cả nhà: `days` = số ngày lễ bắt buộc đã đến trong kỳ; các số còn lại cộng từ từng người */
    mass: (MemberMassStat & { days: number }) | null;
    merit: { points: number } | null;
    discipline: (MemberDisciplineStat & { people: number }) | null;
    finance: MemberFinanceStat | null;
    donations: { count: number; totalVnd: number; donors: number; memberDonors: number; pendingCount: number } | null;
  };
  /** Danh sách chi tiết đi kèm (chỉ phạm vi cả nhà, có quyền) — dùng cho các trang tính trong tệp Excel */
  details: {
    discipline: { memberName: string; occurredOn: string; ruleTitle: string; penalty: string; startsOn: string | null; endsOn: string | null; status: string }[] | null;
    donations: { donorName: string; isMember: boolean; donatedOn: string; amountVnd: number; method: string; fundName: string | null }[] | null;
  };
}
