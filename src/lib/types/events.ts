// DTO phân hệ Lịch & Sự kiện (dùng chung client/server)

export type EventStatus = "draft" | "scheduled" | "ongoing" | "completed" | "cancelled";
export type RsvpStatus = "none" | "going" | "maybe" | "not_going";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
/** photo = thành viên chụp ảnh gửi lại (hiện dùng); qr = mã QR cũ (chỉ còn trong dữ liệu đã ghi, không dùng nữa) */
export type AttendanceMethod = "photo" | "qr" | "manual" | "self" | "import";

export interface EventCategoryDto {
  id: string;
  code: string; // EVT_MASS, EVT_MEET, …
  name: string; // tên đầy đủ trong DB
  label: string; // nhãn ngắn trên giao diện: "Phụng vụ", "Họp nhà", …
  color: string; // #hex
  icon: string | null;
}

export interface EventOrganizerDto {
  memberId: string;
  name: string;
  role: "lead" | "member";
}

export interface EventStatsDto {
  going: number;
  maybe: number;
  notGoing: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Số người được kỳ vọng tham dự (null nếu không bật điểm danh) */
  expected: number | null;
}

export interface MyAttendanceDto {
  status: AttendanceStatus;
  method: AttendanceMethod;
  checkedInAt: string | null; // ISO
  time: string | null; // "19:22" giờ VN
}

export interface PollOptionDto {
  id: string;
  label: string;
  /** null khi biểu quyết ẩn danh còn mở (không công bố số phiếu từng phương án) */
  votes: number | null;
  /** Chỉ có với người quản lý biểu quyết và biểu quyết KHÔNG ẩn danh */
  voterNames: string[] | null;
}

export interface PollDto {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  eventDate: string | null; // DD/MM/YYYY
  question: string;
  description: string | null;
  isMultiSelect: boolean;
  maxChoices: number;
  isAnonymous: boolean;
  status: "draft" | "open" | "closed";
  /** Đang nhận phiếu (mở và chưa quá hạn) */
  isOpen: boolean;
  closesAt: string | null; // ISO
  createdAt: string; // ISO
  createdDate: string; // DD/MM/YYYY
  createdByName: string | null;
  options: PollOptionDto[];
  voters: number;
  eligible: number;
  myOptionIds: string[];
  /** Có phiếu nào chưa (khóa sửa/xóa) — suy từ voters */
  hasVotes: boolean;
}

/** Buổi thuộc chuỗi sự kiện định kỳ (event_recurrence_rules) */
export interface EventSeriesRefDto {
  id: string;
  /** Ngày "chỗ" của buổi trong chuỗi (YYYY-MM-DD) — không đổi khi dời giờ riêng buổi đó */
  occurrenceDate: string;
  /** "Thứ Hai, Thứ Tư hằng tuần" */
  label: string;
  isActive: boolean;
}

export interface EventDto {
  id: string;
  title: string;
  categoryId: string;
  categoryCode: string;
  category: string; // nhãn ngắn
  categoryColor: string;
  status: EventStatus;
  startsAt: string; // ISO
  endsAt: string; // ISO
  dateIso: string; // YYYY-MM-DD (giờ VN)
  date: string; // DD/MM/YYYY
  time: string; // "19:30 tối"
  startHm: string; // "19:30"
  endHm: string; // "21:00"
  endDateIso: string;
  location: string;
  organizer: string; // organizer_text hoặc tên người chủ trì
  organizerText: string | null;
  organizers: EventOrganizerDto[];
  description: string | null;
  hasCheckIn: boolean;
  cancelReason: string | null;
  stats: EventStatsDto;
  myRsvp: RsvpStatus;
  myAttendance: MyAttendanceDto | null;
  /** Người xem sửa được (event.manage hoặc thuộc ban tổ chức) */
  canEdit: boolean;
  /** Người xem điểm danh hộ được (event.attendance.record hoặc ban tổ chức) */
  canRecord: boolean;
  polls: PollDto[];
  /** Thuộc chuỗi sự kiện định kỳ (null = sự kiện riêng lẻ) */
  series: EventSeriesRefDto | null;
}

export interface EventsMonthDto {
  events: EventDto[];
  categories: EventCategoryDto[];
}

/** GET /api/v1/events/upcoming — hợp đồng cho trang Tổng quan */
export interface UpcomingEventDto {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  category: string;
  categoryColor: string;
  hasCheckIn: boolean;
  myRsvp: RsvpStatus;
}

export interface AttendanceRowDto {
  memberId: string;
  name: string;
  fullName: string;
  room: string | null;
  status: AttendanceStatus | null;
  method: AttendanceMethod | null;
  checkedInAt: string | null;
  time: string | null; // "19:22"
  note: string | null;
  recordedBy: string | null;
  rsvp: RsvpStatus;
  /** Ảnh điểm danh (method = photo) — người điểm danh hộ/ban tổ chức xem được */
  evidenceFileId: string | null;
}

export interface AttendanceRosterDto {
  eventId: string;
  rows: AttendanceRowDto[];
  canRecord: boolean;
  /** Sự kiện đã kết thúc ⇒ có thể chốt điểm danh */
  ended: boolean;
  status: EventStatus;
}

export interface CheckInResultDto {
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  status: AttendanceStatus;
  time: string | null;
  date: string;
}

// ---------------------------------------------------------------------
// Trực vệ sinh sân nhà của tuần chứa một ngày (duty_weeks — hiển thị ở panel ngày trên Lịch)
// ---------------------------------------------------------------------
export interface DayDutyMemberDto {
  id: string;
  name: string;
  fullName: string;
  room: string | null;
  isMe: boolean;
}

export interface DayDutyDto {
  /** Ngày đang xem (YYYY-MM-DD) */
  date: string;
  /** null = tuần này chưa xếp người trực */
  weekId: string | null;
  weekStart: string;
  weekEnd: string;
  members: DayDutyMemberDto[];
  note: string | null;
  /** Kết quả đánh giá sau tuần trực (null = chưa đánh giá) */
  review: { score: number; comment: string | null; redoRequired: boolean; redoNote: string | null } | null;
  isMine: boolean;
  /** Tuần đã qua / đang diễn ra / sắp tới (so với hôm nay) */
  phase: "past" | "current" | "upcoming";
}

// ---------------------------------------------------------------------
// Sự kiện định kỳ (lặp hằng tuần)
// ---------------------------------------------------------------------
export interface EventSeriesOccurrenceDto {
  eventId: string;
  date: string; // occurrence_date
  startHm: string;
  endHm: string;
  status: EventStatus;
  /** Giờ/tiêu đề/địa điểm khác với chuỗi (đã sửa riêng buổi này) */
  customized: boolean;
}

export interface EventSeriesSkipDto {
  date: string;
  reason: string | null;
  createdAt: string;
  /** Còn khôi phục được (ngày chưa qua) */
  restorable: boolean;
}

export interface EventSeriesDto {
  id: string;
  title: string;
  categoryId: string;
  categoryCode: string;
  category: string;
  categoryColor: string;
  startHm: string; // "21:00"
  endHm: string; // "21:30" (có thể sang hôm sau)
  durationMinutes: number;
  /** ISO 1 = Thứ Hai … 7 = Chúa Nhật */
  weekdays: number[];
  intervalWeeks: number;
  startsOn: string;
  untilDate: string | null;
  location: string | null;
  organizerText: string | null;
  description: string | null;
  hasCheckIn: boolean;
  organizers: { memberId: string; name: string }[];
  isActive: boolean;
  /** Đã qua ngày kết thúc */
  finished: boolean;
  /** "Thứ Hai, Thứ Tư hằng tuần" */
  patternLabel: string;
  /** "21:00–21:30" */
  timeLabel: string;
  /** Các buổi sắp tới đã có trên lịch (tối đa 12) */
  upcoming: EventSeriesOccurrenceDto[];
  /** Các ngày dự kiến sắp tới theo mẫu lặp (kể cả chưa tạo; không gồm ngày bỏ qua) — tối đa 12 */
  nextDates: string[];
  skips: EventSeriesSkipDto[];
  pastCount: number;
  upcomingCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventSeriesListDto {
  items: EventSeriesDto[];
  canManage: boolean;
  /** Số ngày hệ thống tạo trước các buổi (cron sáng) */
  horizonDays: number;
}

export interface EventSeriesSaveResultDto {
  series: EventSeriesDto;
  /** Số buổi vừa tạo / cập nhật / gỡ / khôi phục */
  generated: number;
  updated: number;
  removed: number;
  restored: number;
  /** Buổi đầu tiên sắp tới (để mở lịch tới đúng ngày) */
  firstDate: string | null;
}

// ---------------------------------------------------------------------
// Đồng bộ lịch (.ics) — đường dẫn đăng ký theo mã bí mật
// ---------------------------------------------------------------------
export interface CalendarFeedTokenDto {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CalendarFeedListDto {
  items: CalendarFeedTokenDto[];
  max: number;
}

export interface CalendarFeedCreatedDto {
  item: CalendarFeedTokenDto;
  /** Đường dẫn đầy đủ — CHỈ hiện một lần (máy chủ chỉ lưu mã băm) */
  url: string;
  /** webcal://… — mở thẳng ứng dụng Lịch (iPhone/macOS/Outlook) */
  webcalUrl: string;
}

// ---------------------------------------------------------------------
// Xuất điểm danh nhiều sự kiện (bảng thành viên × sự kiện)
// ---------------------------------------------------------------------
/** Ô của bảng: trạng thái đã ghi; "none" = thuộc đối tượng nhưng chưa ghi nhận; null = không thuộc đối tượng sự kiện đó */
export type AttendanceCell = AttendanceStatus | "none" | null;

export interface AttendanceReportEventDto {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startHm: string;
  endHm: string;
  category: string;
  status: EventStatus;
  location: string;
  expected: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  unrecorded: number;
}

export interface AttendanceReportMemberDto {
  memberId: string;
  name: string;
  fullName: string;
  room: string | null;
  /** Theo thứ tự `events` */
  cells: AttendanceCell[];
  /** Giờ điểm danh "HH:MM" tương ứng (null nếu không có) */
  times: (string | null)[];
  totals: { expected: number; present: number; late: number; excused: number; absent: number; unrecorded: number; ratePct: number | null };
}

export interface AttendanceReportDto {
  from: string;
  to: string;
  events: AttendanceReportEventDto[];
  members: AttendanceReportMemberDto[];
  /** Có quyền xem toàn bộ (event.attendance.read_all) hay chỉ các sự kiện mình phụ trách */
  scope: "all" | "organizer";
  generatedAt: string;
}
