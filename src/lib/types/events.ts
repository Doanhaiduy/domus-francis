// DTO phân hệ Lịch & Sự kiện (dùng chung client/server)

export type EventStatus = "draft" | "scheduled" | "ongoing" | "completed" | "cancelled";
export type RsvpStatus = "none" | "going" | "maybe" | "not_going";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type AttendanceMethod = "qr" | "manual" | "self" | "import";

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

export interface QrSessionDto {
  id: string;
  opensAt: string;
  closesAt: string;
  rotationSeconds: number;
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
  /** Người xem mở/đóng phiên QR được (event.qr.manage hoặc ban tổ chức) */
  canQr: boolean;
  /** Phiên QR đang mở (chỉ trả cho người điểm danh được) */
  qrSession: QrSessionDto | null;
  polls: PollDto[];
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
}

export interface AttendanceRosterDto {
  eventId: string;
  rows: AttendanceRowDto[];
  canRecord: boolean;
  /** Sự kiện đã kết thúc ⇒ có thể chốt điểm danh */
  ended: boolean;
  status: EventStatus;
}

export interface QrDisplayDto {
  session: QrSessionDto;
  token: string;
  /** Mã 6 số để nhập tay */
  code: string;
  url: string;
  svg: string;
  /** Số mili giây tới lần đổi mã kế tiếp */
  refreshInMs: number;
}

export interface CheckInResultDto {
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  status: AttendanceStatus;
  time: string | null;
  date: string;
}

export interface DayDutyDto {
  id: string;
  shift: string;
  area: string;
  members: string[];
  status: string;
}
