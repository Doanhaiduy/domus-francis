// Kiểu dữ liệu phân hệ Cộng đoàn (Thông báo, Diễn đàn, Ý cầu nguyện, Phụng vụ, Hộp thư) — dùng chung client/server.

/** Người (tác giả, người được phân công…) rút gọn cho hiển thị. */
export interface PersonRef {
  id: string;
  /** Tên gọi (display_name) — "Văn Đức" */
  name: string;
  /** Họ tên đầy đủ — "Trần Văn Đức" */
  fullName: string;
  /** Chức vụ hiện hành hoặc "Thành viên" */
  role: string;
  room: string | null;
  initials: string;
  avatarFileId: string | null;
}

export interface CategoryDto {
  id: string;
  code: string;
  /** Tên đầy đủ trong danh mục ("Quan trọng & Khẩn") */
  name: string;
  /** Nhãn ngắn hiển thị trên chip/bộ lọc ("Quan trọng") */
  label: string;
  color: string;
  icon: string;
}

// ---------------------------------------------------------------------
// Thông báo
// ---------------------------------------------------------------------
export interface AttachmentDto {
  id: string;
  name: string;
  sizeBytes: number;
  mime: string;
  /** Xem trực tiếp */
  url: string;
  /** Tải về (Content-Disposition: attachment) */
  downloadUrl: string;
}

export interface AnnouncementEventDto {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  /** RSVP của chính mình: none | going | maybe | not_going */
  myRsvp: string;
  /** Số người báo sẽ có mặt (null nếu không lấy được) */
  goingCount: number | null;
}

export interface AnnouncementDto {
  id: string;
  title: string;
  preview: string;
  content: string;
  /** Nhãn chuyên mục ngắn ("Quan trọng", "Sự kiện", "Chung", "Bếp & Cơm") */
  category: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryColor: string;
  isPinned: boolean;
  pinnedUntil: string | null;
  /** Chưa đọc (chỉ tính với thông báo gửi tới mình) */
  isUnread: boolean;
  readAt: string | null;
  author: string;
  /** "Trưởng nhà · P.1" */
  authorRole: string;
  authorRef: PersonRef;
  createdAt: string;
  publishedAt: string;
  requiresAck: boolean;
  ackDeadline: string | null;
  acknowledgedAt: string | null;
  event: AnnouncementEventDto | null;
  attachments: AttachmentDto[];
  /** Mô tả đối tượng nhận — chi tiết chỉ người đăng/người quản lý thấy */
  targetLabel: string;
  /** Mình thuộc đối tượng nhận */
  isTarget: boolean;
  stats: {
    /** Số thành viên đang ở thuộc đối tượng nhận */
    targetCount: number;
    /** Số đã đọc / đã xác nhận — null nếu người xem không có quyền xem (chỉ người đăng & người quản lý) */
    readCount: number | null;
    ackCount: number | null;
  };
  isMine: boolean;
  /** Được xóa/ẩn (người đăng hoặc announcement.pin) */
  canManage: boolean;
  canPin: boolean;
}

export interface AnnouncementReaderDto {
  member: PersonRef;
  readAt: string | null;
  acknowledgedAt: string | null;
}

export interface AnnouncementMetaDto {
  categories: CategoryDto[];
  floors: { id: string; name: string }[];
  rooms: { id: string; code: string; name: string }[];
  roles: { id: string; code: string; name: string }[];
  events: { id: string; title: string; startsAt: string }[];
}

export type TargetType = "role" | "floor" | "room" | "member";

// ---------------------------------------------------------------------
// Diễn đàn
// ---------------------------------------------------------------------
export type ContentStatus = "published" | "hidden" | "locked";

export interface ForumPostDto {
  id: string;
  title: string;
  content: string;
  category: string;
  categoryId: string;
  categoryCode: string;
  categoryColor: string;
  author: PersonRef;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  isPinned: boolean;
  status: ContentStatus;
  commentsCount: number;
  reactionsCount: number;
  liked: boolean;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Số báo cáo vi phạm đang mở (chỉ người kiểm duyệt thấy; null nếu không có quyền) */
  openReports: number | null;
  myReported: boolean;
}

export interface ForumCommentDto {
  id: string;
  postId: string;
  parentId: string | null;
  author: PersonRef;
  content: string;
  createdAt: string;
  status: ContentStatus;
  isMine: boolean;
  canDelete: boolean;
  openReports: number | null;
  myReported: boolean;
}

export interface ForumStatsDto {
  totalPosts: number;
  newThisWeek: number;
  totalComments: number;
  commentsThisWeek: number;
  /** % chủ đề đã có phản hồi */
  responseRate: number;
  hot: { id: string; title: string; interactions: number; participants: number; category: string } | null;
}

export interface ForumListDto {
  posts: ForumPostDto[];
  categories: CategoryDto[];
  stats: ForumStatsDto;
}

export interface ForumPostDetailDto extends ForumPostDto {
  comments: ForumCommentDto[];
}

// ---------------------------------------------------------------------
// Ý cầu nguyện
// ---------------------------------------------------------------------
export interface PrayerDto {
  id: string;
  text: string;
  isAnonymous: boolean;
  /** Tên tác giả hoặc "Ẩn danh" */
  author: string;
  /** null với ý ẩn danh (kể cả với người quản lý — chỉ xem qua quy trình báo cáo vi phạm) */
  authorId: string | null;
  isMine: boolean;
  createdAt: string;
  expiresAt: string;
  prayingCount: number;
  hasPrayed: boolean;
  status: "open" | "answered" | "closed";
  visibility: ContentStatus;
  /** Số báo cáo đang mở (người kiểm duyệt) — null nếu không có quyền */
  openReports: number | null;
  myReported: boolean;
  /** Có báo cáo mở do người khác lập ⇒ người có prayer.reveal_author được xem tác giả (D-007) */
  revealable: boolean;
}

export interface PrayerListDto {
  items: PrayerDto[];
  stats: { total: number; monthCount: number; weekNew: number; prayingMembers: number };
}

// ---------------------------------------------------------------------
// Phụng vụ
// ---------------------------------------------------------------------
export interface LiturgyRoleTypeDto {
  id: string;
  code: string;
  name: string;
}

export interface LiturgyAssignmentDto {
  id: string;
  eventId: string;
  roleCode: string;
  roleName: string;
  member: PersonRef;
  status: "assigned" | "confirmed" | "declined" | "served";
  note: string | null;
  isMine: boolean;
}

export interface LiturgySessionDto {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  date: string;
  /** "20:30" */
  time: string;
  /** "20:30 TỐI" */
  timeLabel: string;
  location: string | null;
  description: string | null;
  categoryCode: string;
  isMass: boolean;
  isPatron: boolean;
  assignments: LiturgyAssignmentDto[];
}

export interface LiturgicalDayDto {
  title: string;
  rankLabel: string | null;
  color: string | null;
  isAbstinence: boolean;
  note: string | null;
}

export interface LiturgyDayDto {
  date: string;
  weekday: string;
  dateLabel: string;
  isToday: boolean;
  isSunday: boolean;
  liturgical: LiturgicalDayDto | null;
  sessions: LiturgySessionDto[];
}

export interface LiturgyHighlightDto {
  sessionId: string;
  title: string;
  date: string;
  time: string;
  timeLabel: string;
  /** "Tối nay" | "Hôm nay" | "Ngày mai" | "Thứ Sáu 09/10" */
  whenLabel: string;
  weekday: string;
  location: string | null;
  presider: string | null;
}

export interface ReflectionDto {
  id: string;
  scriptureRef: string | null;
  quote: string | null;
  body: string;
  weekOf: string | null;
  author: PersonRef;
  createdAt: string;
  isMine: boolean;
  canDelete: boolean;
}

export interface LiturgyWeekDto {
  from: string;
  to: string;
  today: string;
  monthLabel: string;
  weekLabel: string | null;
  rangeLabel: string;
  days: LiturgyDayDto[];
  roleTypes: LiturgyRoleTypeDto[];
  tonight: LiturgyHighlightDto | null;
  nextMass: LiturgyHighlightDto | null;
  defaultNightPrayerTime: string;
}

// ---------------------------------------------------------------------
// Hộp thư trong ứng dụng
// ---------------------------------------------------------------------
export interface NotificationDto {
  id: string;
  type: string;
  typeName: string;
  category: string;
  title: string;
  body: string | null;
  priority: string;
  createdAt: string;
  isRead: boolean;
  link: string | null;
}

export interface UnreadCountDto {
  announcementsUnread: number;
  notificationsUnread: number;
}

export interface NotificationsDto {
  items: NotificationDto[];
  announcements: AnnouncementDto[];
  unread: UnreadCountDto;
}
