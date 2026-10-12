// Trang mở khi bấm một thông báo — dùng chung cho hộp thư trong ứng dụng (notifications.ts), thông báo đẩy (push.ts) và email.
// Thứ tự: liên kết do nơi gửi đặt (payload.link) → theo LOẠI thông báo (type_code) → theo bảng nguồn (entity_table) → theo nhóm (category).
// Loại thông báo mới: nên gửi kèm payload {"link": "/duong-dan?…"}; nếu không, thêm một dòng vào LINK_BY_TYPE dưới đây.

/** Liên kết trong ứng dụng hợp lệ: đường dẫn tương đối, không trỏ ra ngoài (chặn "//host", "/\host"), tối đa 500 ký tự. */
export function safeLink(link: unknown): string | null {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\") && link.length <= 500 ? link : null;
}

const LINK_BY_TYPE: Record<string, string> = {
  "announcement.published": "/thong-bao",
  "announcement.important": "/thong-bao",
  "event.created": "/lich-su-kien",
  "event.reminder": "/lich-su-kien",
  "event.attendance_open": "/lich-su-kien",
  "event.liturgy_assigned": "/phung-vu",
  "finance.expense_pending": "/thu-chi?tab=chi",
  "finance.expense_decided": "/thu-chi?tab=chi",
  "finance.expense_paid": "/thu-chi?tab=chi",
  "finance.period_pending": "/thu-chi?tab=so-quy",
  "finance.period_closed": "/thu-chi?tab=so-quy",
  "finance.donation_pending": "/thu-chi?tab=ung-ho",
  "finance.donation_decided": "/thu-chi?tab=ung-ho",
  "finance.claim_pending": "/thu-chi?tab=tong-quan",
  "finance.bank_incoming": "/thu-chi?tab=tong-quan",
  "member.application_new": "/thanh-vien?tab=applications",
  "member.admission_inquiry": "/bai-viet?tab=inquiries",
  "system.application_decided": "/",
  "system.consent_update": "/cai-dat?tab=profile",
  "system.discipline_recorded": "/ky-luat",
  "system.feedback_new": "/gop-y?tab=all",
  "system.feedback_reply": "/gop-y",
  "system.room_changed": "/so-do-nha",
  "system.reminder": "/lich-su-kien",
  "system.storage_alert": "/cai-dat?tab=storage",
  "system.ops_alert": "/cai-dat?tab=system",
  "system.error_digest": "/cai-dat?tab=system",
  "system.manager_digest": "/",
  "social.forum_reply": "/dien-dan",
  "academic.record_returned": "/hoc-tap",
  "academic.tutoring_match": "/hoc-tap",
};

/** Theo tiền tố loại (sau LINK_BY_TYPE). */
const LINK_BY_TYPE_PREFIX: [prefix: string, link: string][] = [
  ["security.", "/cai-dat?tab=security"],
  ["event.leave_", "/xin-phep"],
  ["duty.", "/hau-can?tab=truc-nhat"],
  ["facility.", "/hau-can?tab=bao-hong"],
  ["liturgy.", "/lich-su-kien"],
  ["meal.", "/bep-com"],
  ["laundry.", "/hau-can"],
  ["finance.", "/thu-chi"],
];

const LINK_BY_TABLE: Record<string, string> = {
  announcements: "/thong-bao",
  forum_posts: "/dien-dan",
  prayer_intentions: "/phung-vu",
  liturgy_assignments: "/phung-vu",
  events: "/lich-su-kien",
  mass_checkins: "/lich-su-kien",
  expense_vouchers: "/thu-chi?tab=chi",
  contributions: "/thu-chi",
  contribution_claims: "/thu-chi",
  donations: "/thu-chi?tab=ung-ho",
  duty_weeks: "/hau-can?tab=truc-nhat",
  duty_assignments: "/hau-can",
  duty_swap_requests: "/hau-can",
  duty_checkins: "/hau-can",
  maintenance_issues: "/hau-can?tab=bao-hong",
  academic_records: "/hoc-tap",
  albums: "/khoanh-khac",
  leave_requests: "/xin-phep",
  admission_inquiries: "/bai-viet?tab=inquiries",
  member_applications: "/thanh-vien?tab=applications",
  discipline_records: "/ky-luat",
  app_feedback: "/gop-y",
};

/** Bảng nguồn chưa có trong LINK_BY_TABLE: đoán theo tên (giữ quy tắc cũ của thông báo đẩy). */
const LINK_BY_TABLE_PATTERN: [re: RegExp, link: string][] = [
  [/announcement/, "/thong-bao"],
  [/leave/, "/xin-phep"],
  [/admission_inquir/, "/bai-viet?tab=inquiries"],
  [/event|poll|attendance/, "/lich-su-kien"],
  [/duty/, "/hau-can"],
  [/expense|contribution|ledger|fund|due|donation/, "/thu-chi"],
  [/forum/, "/dien-dan"],
  [/maintenance|issue/, "/hau-can?tab=bao-hong"],
  [/academic|grade/, "/hoc-tap"],
  [/meal|menu/, "/bep-com"],
  [/liturgy|prayer/, "/phung-vu"],
  [/application/, "/thanh-vien"],
  [/discipline/, "/ky-luat"],
];

const LINK_BY_CATEGORY: Record<string, string> = {
  announcement: "/thong-bao",
  finance: "/thu-chi",
  duty: "/hau-can",
  event: "/lich-su-kien",
  academic: "/hoc-tap",
  facility: "/hau-can?tab=bao-hong",
  laundry: "/hau-can",
  meal: "/bep-com",
  social: "/dien-dan",
  security: "/cai-dat?tab=security",
  system: "/cai-dat",
};

export interface NotificationLinkInput {
  typeCode: string;
  entityTable?: string | null;
  category?: string | null;
  payload?: Record<string, unknown> | null;
}

/** Đường dẫn mở khi bấm thông báo; null = không suy được (hộp thư không điều hướng, thông báo đẩy mở Tổng quan). */
export function notificationLink(n: NotificationLinkInput): string | null {
  const own = safeLink(n.payload?.link);
  if (own) return own;
  const byType = LINK_BY_TYPE[n.typeCode] ?? LINK_BY_TYPE_PREFIX.find(([p]) => n.typeCode.startsWith(p))?.[1];
  if (byType) return byType;
  const t = n.entityTable ?? "";
  if (t) {
    const byTable = LINK_BY_TABLE[t] ?? LINK_BY_TABLE_PATTERN.find(([re]) => re.test(t))?.[1];
    if (byTable) return byTable;
  }
  return (n.category && LINK_BY_CATEGORY[n.category]) || null;
}
