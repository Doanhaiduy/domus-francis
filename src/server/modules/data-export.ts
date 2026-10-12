import "server-only";
import { batch, type BatchItem, type Tx } from "../db";
import { ApiError, forbidden } from "../errors";
import { hashKey, rateLimit } from "../ops";
import { LEGAL_VERSION, legalVersionLabel } from "@/content/legal";
import { LEAVE_KIND_LABEL, LEAVE_STATUS_LABEL, type LeaveKind, type LeaveStatus } from "@/lib/types/leave";
import { CONTRIBUTION_STATUS_LABEL, FEE_TYPE_LABEL, PAYMENT_METHOD_LABEL, type FeeType, type PaymentMethod } from "@/lib/types/finance";
import { PENALTY_LABEL, type PenaltyKind } from "@/lib/types/discipline";
import { DONATION_STATUS_LABEL, type DonationStatus } from "@/lib/types/donations";
import { DATA_REQUEST_STATUS_LABEL, DATA_REQUEST_TYPE_LABEL, type DataRequestStatus, type DataRequestType } from "@/lib/types/data-requests";

// =====================================================================
// "Tải dữ liệu của tôi" (quyền được biết / truy cập / nhận bản sao + mang theo dữ liệu — Luật BVDLCN 91/2025/QH15):
// một tệp JSON gồm dữ liệu của CHÍNH người đang đăng nhập. Mọi truy vấn chạy dưới RLS của người đó (ctx.db) ⇒ không bao giờ lẫn dữ liệu của
// người khác; chỉ lọc thêm theo app.current_member_id()/current_user_id(). Số CCCD và SĐT phụ huynh được mã hóa ⇒ chỉ ghi 4 số cuối.
// Ghi nhật ký kiểm toán EXPORT; tối đa 10 lần/giờ/người. Thêm bảng dữ liệu cá nhân mới ⇒ thêm một mục ở SECTIONS bên dưới.
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ME = "app.current_member_id()";
const ME_USER = "app.current_user_id()";

interface Section {
  key: string;
  /** Tên mục tiếng Việt (ghi trong meta.sections) */
  title: string;
  sql: string;
  params?: unknown[];
}

const SECTIONS: Section[] = [
  {
    key: "account",
    title: "Tài khoản đăng nhập",
    sql: `SELECT u.email::text AS email, u.phone_e164, u.status::text AS status, u.created_at, u.last_login_at, u.password_changed_at,
                 EXISTS (SELECT 1 FROM user_mfa_factors f WHERE f.user_id = u.id AND f.confirmed_at IS NOT NULL) AS mfa_enabled
            FROM users u WHERE u.id = ${ME_USER}`,
  },
  {
    key: "roles",
    title: "Vai trò đang giữ",
    sql: `SELECT r.name_vi AS role, ur.valid_from, ur.valid_to
            FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = ${ME_USER} AND ur.revoked_at IS NULL ORDER BY r.rank`,
  },
  {
    key: "profile",
    title: "Hồ sơ thành viên",
    sql: `SELECT m.member_no, m.full_name, m.display_name, m.gender::text AS gender, m.contact_phone_e164, m.contact_email::text AS contact_email,
                 m.hide_phone, m.status::text AS status, m.joined_on, m.left_on, m.left_reason, m.custom_dues_vnd, (m.avatar_file_id IS NOT NULL) AS has_avatar,
                 m.created_at, m.updated_at
            FROM members m WHERE m.id = ${ME}`,
  },
  {
    key: "privateDetails",
    title: "Thông tin riêng tư",
    sql: `SELECT birth_date, hometown, home_address, national_id_last4 FROM member_private_details WHERE member_id = ${ME}`,
  },
  {
    key: "guardians",
    title: "Cha mẹ / người giám hộ / liên lạc khẩn cấp",
    sql: `SELECT relation::text AS relation, full_name, phone_last4, is_emergency_contact, is_legal_guardian
            FROM member_guardians WHERE member_id = ${ME} AND deleted_at IS NULL ORDER BY created_at`,
  },
  {
    key: "catholicProfile",
    title: "Hồ sơ Công giáo",
    sql: `SELECT cp.holy_name, d.name AS diocese, cp.parish_name, cp.pastor_name, cp.updated_at
            FROM catholic_profiles cp LEFT JOIN dioceses d ON d.id = cp.diocese_id WHERE cp.member_id = ${ME}`,
  },
  {
    key: "sacraments",
    title: "Bí tích đã lãnh nhận",
    sql: `SELECT sacrament::text AS sacrament, received_on, place FROM member_sacraments WHERE member_id = ${ME} ORDER BY received_on NULLS LAST`,
  },
  {
    key: "study",
    title: "Học vụ (trường, ngành, khóa)",
    sql: `SELECT un.name AS university, sp.major, sp.cohort_label, sp.enrollment_year, sp.expected_graduation_year, sp.student_code,
                 sp.status::text AS status, sp.is_current
            FROM student_profiles sp LEFT JOIN universities un ON un.id = sp.university_id
           WHERE sp.member_id = ${ME} AND sp.deleted_at IS NULL ORDER BY sp.is_current DESC, sp.created_at DESC`,
  },
  {
    key: "alumniProfile",
    title: "Hồ sơ cựu thành viên",
    sql: `SELECT graduation_year, occupation, workplace, city, keeps_contact, note, updated_at FROM alumni_profiles WHERE member_id = ${ME}`,
  },
  {
    key: "paymentAccount",
    title: "Tài khoản nhận tiền",
    sql: `SELECT bank_name, account_no, account_name, (qr_file_id IS NOT NULL) AS has_qr_image, note, updated_at
            FROM member_payment_accounts WHERE member_id = ${ME}`,
  },
  {
    key: "consents",
    title: "Đồng ý về dữ liệu cá nhân (bằng chứng)",
    sql: `SELECT c.purpose_code, cp.name_vi AS purpose_name, c.policy_version, c.granted_at, c.withdrawn_at, c.method, c.evidence_note
            FROM consents c LEFT JOIN consent_purposes cp ON cp.code = c.purpose_code
           WHERE c.member_id = ${ME} ORDER BY c.granted_at`,
  },
  {
    key: "rooms",
    title: "Phòng ở (cả lịch sử)",
    sql: `SELECT r.code AS room_code, r.name AS room_name, ra.bed_label, ra.starts_on, ra.ends_on
            FROM room_assignments ra LEFT JOIN rooms r ON r.id = ra.room_id
           WHERE ra.member_id = ${ME} ORDER BY ra.starts_on DESC`,
  },
  {
    key: "contributions",
    title: "Khoản phải đóng (quỹ, điện nước…)",
    sql: `SELECT p.name AS plan_name, p.fee_type::text AS fee_type, p.period_month, c.amount_due_vnd, c.discount_vnd, c.discount_reason, c.paid_vnd,
                 c.status::text AS status, c.due_date, c.note
            FROM contributions c LEFT JOIN contribution_plans p ON p.id = c.plan_id
           WHERE c.member_id = ${ME} ORDER BY c.due_date DESC NULLS LAST, c.created_at DESC LIMIT 1000`,
  },
  {
    key: "payments",
    title: "Phiếu thu đã ghi cho bạn",
    sql: `SELECT amount_vnd, method::text AS method, paid_on, reference_code, note, voided_at, void_reason, created_at
            FROM contribution_payments WHERE member_id = ${ME} ORDER BY paid_on DESC, created_at DESC LIMIT 1000`,
  },
  {
    key: "paymentClaims",
    title: "Báo “Tôi đã đóng”",
    sql: `SELECT method::text AS method, reference_code, note, status, created_at, decided_at, decision_note
            FROM contribution_claims WHERE member_id = ${ME} ORDER BY created_at DESC LIMIT 500`,
  },
  {
    key: "donations",
    title: "Ủng hộ quỹ",
    sql: `SELECT amount_vnd, donated_on, method::text AS method, reference_code, note, status, decided_at, decision_note
            FROM donations WHERE donor_member_id = ${ME} ORDER BY donated_on DESC LIMIT 500`,
  },
  {
    key: "leaveRequests",
    title: "Đơn xin phép (kèm các lần xin thêm giờ)",
    sql: `SELECT l.kind::text AS kind, e.title AS event_title, l.starts_at, l.ends_at, l.reason, l.destination, l.contact_phone_e164,
                 l.status::text AS status, l.decided_at, l.decision_note, l.created_at,
                 (SELECT COALESCE(dm.display_name, dm.full_name) FROM members dm WHERE dm.id = l.door_member_id) AS door_member,
                 COALESCE((SELECT json_agg(json_build_object('newEndsAt', x.new_ends_at, 'reason', x.reason, 'createdAt', x.created_at) ORDER BY x.created_at)
                             FROM leave_extensions x WHERE x.leave_request_id = l.id), '[]'::json) AS extensions
            FROM leave_requests l LEFT JOIN events e ON e.id = l.event_id
           WHERE l.member_id = ${ME} ORDER BY l.starts_at DESC LIMIT 1000`,
  },
  {
    key: "attendance",
    title: "Điểm danh sự kiện",
    sql: `SELECT e.title AS event_title, e.starts_at AS event_starts_at, a.status::text AS status, a.method::text AS method, a.checked_in_at, a.note,
                 (a.evidence_file_id IS NOT NULL) AS has_photo
            FROM attendance_records a LEFT JOIN events e ON e.id = a.event_id
           WHERE a.member_id = ${ME} ORDER BY e.starts_at DESC NULLS LAST LIMIT 2000`,
  },
  {
    key: "massCheckins",
    title: "Check-in đi lễ",
    sql: `SELECT day_date, occasion, church, note, status, checked_in_at, reviewed_at, review_note, (evidence_file_id IS NOT NULL) AS has_photo
            FROM mass_checkins WHERE member_id = ${ME} ORDER BY day_date DESC LIMIT 2000`,
  },
  {
    key: "dutyWeeks",
    title: "Trực tuần",
    sql: `SELECT w.week_start, w.score, w.review_comment, w.redo_required, w.redo_note
            FROM duty_week_members dm JOIN duty_weeks w ON w.id = dm.week_id
           WHERE dm.member_id = ${ME} ORDER BY w.week_start DESC LIMIT 500`,
  },
  {
    key: "liturgyAssignments",
    title: "Phân công phụng vụ",
    sql: `SELECT e.title AS event_title, e.starts_at AS event_starts_at, la.status, la.note
            FROM liturgy_assignments la LEFT JOIN events e ON e.id = la.event_id
           WHERE la.member_id = ${ME} ORDER BY e.starts_at DESC NULLS LAST LIMIT 500`,
  },
  {
    key: "discipline",
    title: "Vi phạm & hình phạt",
    sql: `SELECT rule_code, rule_title, occurred_on, note, penalty_kind, penalty_qty, penalty_detail, penalty_starts_on, penalty_ends_on,
                 status, completed_at, waived_at, waive_reason
            FROM discipline_records WHERE member_id = ${ME} ORDER BY occurred_on DESC LIMIT 500`,
  },
  {
    key: "merit",
    title: "Điểm thi đua / đóng góp",
    sql: `SELECT rule_code, points, occurred_on, note FROM merit_entries WHERE member_id = ${ME} ORDER BY occurred_on DESC LIMIT 1000`,
  },
  {
    key: "academicRecords",
    title: "Bảng điểm học tập",
    sql: `SELECT s.name AS semester, un.name AS university, r.major_snapshot, r.student_code_snapshot, r.status::text AS status,
                 r.has_scholarship, r.scholarship_note, r.submitted_at, r.verified_at, r.reject_reason,
                 COALESCE((SELECT json_agg(json_build_object('course', co.name, 'courseCode', co.code, 'credits', g.credits,
                                                            'processScore', g.process_score, 'finalScore', g.final_score,
                                                            'totalScore', COALESCE(g.official_total_score, g.total_score), 'letter', g.letter_grade,
                                                            'gpaPoints', g.gpa_points, 'pass', g.is_pass, 'retake', g.is_retake, 'note', g.note)
                                           ORDER BY co.name)
                             FROM grade_records g LEFT JOIN courses co ON co.id = g.course_id WHERE g.record_id = r.id), '[]'::json) AS grades
            FROM academic_records r
            LEFT JOIN semesters s ON s.id = r.semester_id
            LEFT JOIN universities un ON un.id = r.university_id
           WHERE r.member_id = ${ME} ORDER BY s.starts_on DESC NULLS LAST, r.created_at DESC`,
  },
  {
    key: "studyGoals",
    title: "Mục tiêu học tập",
    sql: `SELECT s.name AS semester, g.goals, g.difficulties, g.visibility, g.updated_at
            FROM study_goals g LEFT JOIN semesters s ON s.id = g.semester_id WHERE g.member_id = ${ME} ORDER BY g.created_at DESC`,
  },
  {
    key: "mealRegistrations",
    title: "Đăng ký cơm",
    sql: `SELECT mm.menu_date, mm.meal_type::text AS meal_type, mr.will_eat, mr.guests, mr.note, mr.registered_at
            FROM meal_registrations mr JOIN meal_menus mm ON mm.id = mr.menu_id
           WHERE mr.member_id = ${ME} ORDER BY mm.menu_date DESC LIMIT 1000`,
  },
  {
    key: "prayerIntentions",
    title: "Ý cầu nguyện bạn đã gửi",
    sql: `SELECT content, is_anonymous, status, visibility::text AS visibility, created_at
            FROM prayer_intentions WHERE author_member_id = ${ME} ORDER BY created_at DESC LIMIT 500`,
  },
  {
    key: "forumPosts",
    title: "Bài đăng diễn đàn",
    sql: `SELECT title, content, status::text AS status, created_at, deleted_at
            FROM forum_posts WHERE author_member_id = ${ME} ORDER BY created_at DESC LIMIT 500`,
  },
  {
    key: "albumPhotos",
    title: "Ảnh Khoảnh khắc bạn đã đăng",
    sql: `SELECT a.title AS album, p.caption, p.created_at, p.deleted_at
            FROM album_photos p LEFT JOIN albums a ON a.id = p.album_id
           WHERE p.uploaded_by_member_id = ${ME} ORDER BY p.created_at DESC LIMIT 1000`,
  },
  {
    key: "feedback",
    title: "Góp ý về ứng dụng",
    sql: `SELECT category, content, page_path, is_anonymous, status, response, responded_at, created_at
            FROM app_feedback WHERE member_id = ${ME} ORDER BY created_at DESC LIMIT 500`,
  },
  {
    key: "dataRequests",
    title: "Yêu cầu về dữ liệu cá nhân",
    sql: `SELECT request_type::text AS type, status::text AS status, details, received_at, due_at, completed_at, resolution_note
            FROM data_subject_requests WHERE member_id = ${ME} ORDER BY received_at DESC`,
  },
  {
    key: "notificationPreferences",
    title: "Tùy chọn thông báo",
    sql: `SELECT category, channel::text AS channel, enabled, quiet_start::text AS quiet_start, quiet_end::text AS quiet_end
            FROM notification_preferences WHERE member_id = ${ME} ORDER BY category, channel`,
  },
  {
    key: "devices",
    title: "Thiết bị / phiên đăng nhập gần đây",
    sql: `SELECT device_label, user_agent, host(ip) AS ip, created_at, last_seen_at, expires_at, revoked_at, revoked_reason
            FROM auth_sessions WHERE user_id = ${ME_USER} ORDER BY created_at DESC LIMIT 100`,
  },
];

const RELATION: Record<string, string> = { father: "Cha", mother: "Mẹ", guardian: "Người giám hộ", sibling: "Anh/chị/em", other: "Khác" };
const SACRAMENT: Record<string, string> = {
  baptism: "Rửa tội",
  eucharist: "Thánh Thể",
  confirmation: "Thêm sức",
  penance: "Hòa giải",
  anointing: "Xức dầu",
  holy_orders: "Truyền chức",
  matrimony: "Hôn phối",
};
const METHOD_CONSENT: Record<string, string> = { in_app: "Trong ứng dụng", paper: "Giấy tờ", verbal_recorded: "Lời nói có ghi nhận", import: "Nhập từ dữ liệu cũ" };

const d = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
/** Ngày (cột date) giữ dạng YYYY-MM-DD theo giờ Việt Nam */
const day = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  return String(v).slice(0, 10);
};
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const masked = (last4: string | null | undefined, groups = 2) => (last4 ? `${"•••• ".repeat(groups)}${last4}` : null);

export interface MyDataExport {
  fileName: string;
  json: string;
}

/** Chạy mọi mục trong MỘT vòng mạng; mục nào lỗi (vd. bảng chưa có ở môi trường cũ) ⇒ chạy lại từng mục trong SAVEPOINT, mục lỗi ghi chú thay vì làm hỏng cả tệp. */
async function runSections(tx: Tx): Promise<{ rows: Record<string, Row[]>; failed: string[] }> {
  const items: BatchItem[] = SECTIONS.map((s) => [s.sql, s.params ?? []] as const);
  await tx.query("SAVEPOINT my_export_all");
  try {
    const res = await batch(tx, items);
    await tx.query("RELEASE SAVEPOINT my_export_all");
    return { rows: Object.fromEntries(SECTIONS.map((s, i) => [s.key, res[i].rows as Row[]])), failed: [] };
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT my_export_all");
    console.error("[me/export] chạy gộp lỗi, chạy lại từng mục:", (e as Error).message);
  }
  const rows: Record<string, Row[]> = {};
  const failed: string[] = [];
  for (const s of SECTIONS) {
    await tx.query("SAVEPOINT my_export_one");
    try {
      rows[s.key] = (await tx.query(s.sql, s.params ?? [])).rows as Row[];
      await tx.query("RELEASE SAVEPOINT my_export_one");
    } catch (e) {
      await tx.query("ROLLBACK TO SAVEPOINT my_export_one");
      console.error(`[me/export] mục ${s.key} lỗi:`, (e as Error).message);
      rows[s.key] = [];
      failed.push(s.title);
    }
  }
  return { rows, failed };
}

/** Dữ liệu cá nhân của người đang đăng nhập (chỉ của chính mình) ⇒ tệp JSON. */
export async function exportMyData(tx: Tx, userId: string): Promise<MyDataExport> {
  const [meR, houseR] = await batch(tx, [
    [`SELECT ${ME} AS id`],
    ["SELECT value #>> '{}' AS name FROM settings WHERE key = 'org.house_name'"],
  ]);
  const memberId = (meR.rows[0] as { id: string | null } | undefined)?.id ?? null;
  if (!memberId) throw forbidden("Tài khoản chưa gắn với hồ sơ thành viên nên chưa có dữ liệu để tải.");
  if (!(await rateLimit(tx, `me-export:${hashKey("user", userId)}`, 3600, 10))) {
    throw new ApiError(429, "RATE_LIMITED", "Bạn đã tải dữ liệu nhiều lần trong giờ qua — vui lòng thử lại sau ít phút.");
  }
  const house = ((houseR.rows[0] as { name: string | null } | undefined)?.name ?? "").trim() || "Lưu Xá Phanxicô";
  const { rows, failed } = await runSections(tx);
  const one = (k: string): Row | null => rows[k]?.[0] ?? null;

  const account = one("account");
  const profile = one("profile");
  const priv = one("privateDetails");
  const catholic = one("catholicProfile");
  const alumni = one("alumniProfile");
  const pay = one("paymentAccount");
  const exportedAt = new Date();

  const data = {
    meta: {
      title: `Dữ liệu cá nhân của ${profile?.full_name ?? "tôi"} — ${house}`,
      exportedAt: exportedAt.toISOString(),
      format: "luuxa-personal-data/1",
      legalVersion: LEGAL_VERSION,
      notes: [
        "Tệp này gồm dữ liệu cá nhân của CHÍNH bạn mà hệ thống đang lưu, ở dạng máy đọc được (JSON) để bạn lưu giữ hoặc mang sang nơi khác.",
        "Số CCCD/CMND và số điện thoại của cha mẹ / người giám hộ được mã hóa trong hệ thống nên ở đây chỉ ghi 4 số cuối. SĐT phụ huynh đầy đủ xem ở Cài đặt → Hồ sơ cá nhân; cần bản sao số CCCD đầy đủ thì gửi yêu cầu “Xem / nhận bản sao dữ liệu” ở cùng trang — người quản lý có thẩm quyền sẽ cung cấp sau khi xác minh.",
        "Ảnh (ảnh đại diện, ảnh điểm danh, ảnh check-in đi lễ, mã QR…) không nằm trong tệp: chỉ ghi có/không có ảnh. Bạn xem ảnh trực tiếp trong ứng dụng.",
        "Sổ quỹ, phiếu thu/chi là sổ sách chung của nhà (ghi bất biến) — tệp chỉ gồm các khoản liên quan đến bạn.",
        "Nhật ký kiểm toán và nhật ký lỗi kỹ thuật không nằm trong tệp (dùng cho an ninh hệ thống). Cách hệ thống xử lý dữ liệu: xem trang Chính sách bảo mật.",
        ...(failed.length ? [`Một số mục chưa đọc được lúc xuất (${failed.join(", ")}) — hãy thử lại sau hoặc gửi yêu cầu cho người quản lý.`] : []),
      ],
      sections: Object.fromEntries(SECTIONS.map((s) => [s.key, s.title])),
    },
    account: account
      ? {
          loginEmail: account.email ?? null,
          loginPhone: account.phone_e164 ?? null,
          status: account.status,
          createdAt: d(account.created_at),
          lastLoginAt: d(account.last_login_at),
          passwordChangedAt: d(account.password_changed_at),
          twoFactorEnabled: !!account.mfa_enabled,
        }
      : null,
    roles: rows.roles.map((r) => ({ role: r.role, validFrom: d(r.valid_from), validTo: d(r.valid_to) })),
    profile: profile
      ? {
          memberCode: profile.member_no ? `TV${String(profile.member_no).padStart(4, "0")}` : null,
          fullName: profile.full_name,
          displayName: profile.display_name,
          gender: profile.gender ?? null,
          contactPhone: profile.contact_phone_e164 ?? null,
          contactEmail: profile.contact_email ?? null,
          hidePhoneFromMembers: !!profile.hide_phone,
          status: profile.status,
          joinedOn: day(profile.joined_on),
          leftOn: day(profile.left_on),
          leftReason: profile.left_reason ?? null,
          customDuesVnd: n(profile.custom_dues_vnd),
          hasAvatar: !!profile.has_avatar,
          createdAt: d(profile.created_at),
          updatedAt: d(profile.updated_at),
        }
      : null,
    privateDetails: priv
      ? {
          birthDate: day(priv.birth_date),
          hometown: priv.hometown ?? null,
          homeAddress: priv.home_address ?? null,
          nationalIdMasked: masked(priv.national_id_last4),
        }
      : null,
    guardians: rows.guardians.map((g) => ({
      relation: RELATION[g.relation] ?? g.relation,
      fullName: g.full_name,
      phoneMasked: masked(g.phone_last4, 1),
      emergencyContact: !!g.is_emergency_contact,
      legalGuardian: !!g.is_legal_guardian,
    })),
    catholicProfile: catholic
      ? { holyName: catholic.holy_name ?? null, diocese: catholic.diocese ?? null, parish: catholic.parish_name ?? null, pastor: catholic.pastor_name ?? null, updatedAt: d(catholic.updated_at) }
      : null,
    sacraments: rows.sacraments.map((s) => ({ sacrament: SACRAMENT[s.sacrament] ?? s.sacrament, receivedOn: day(s.received_on), place: s.place ?? null })),
    study: rows.study.map((s) => ({
      university: s.university ?? null,
      major: s.major ?? null,
      cohort: s.cohort_label ?? null,
      enrollmentYear: n(s.enrollment_year),
      expectedGraduationYear: n(s.expected_graduation_year),
      studentCode: s.student_code ?? null,
      status: s.status,
      current: !!s.is_current,
    })),
    alumniProfile: alumni
      ? { graduationYear: n(alumni.graduation_year), occupation: alumni.occupation ?? null, workplace: alumni.workplace ?? null, city: alumni.city ?? null, keepsContact: !!alumni.keeps_contact, note: alumni.note ?? null }
      : null,
    paymentAccount: pay ? { bankName: pay.bank_name, accountNo: pay.account_no, accountName: pay.account_name, hasQrImage: !!pay.has_qr_image, note: pay.note ?? null, updatedAt: d(pay.updated_at) } : null,
    consents: rows.consents.map((c) => ({
      purpose: c.purpose_code,
      purposeName: c.purpose_name ?? c.purpose_code,
      version: c.purpose_code === "terms_of_use" || c.purpose_code === "privacy_notice_ack" ? legalVersionLabel(Number(c.policy_version)) : String(c.policy_version),
      grantedAt: d(c.granted_at),
      withdrawnAt: d(c.withdrawn_at),
      method: METHOD_CONSENT[c.method] ?? c.method,
      note: c.evidence_note ?? null,
    })),
    rooms: rows.rooms.map((r) => ({ room: r.room_name ?? r.room_code ?? null, roomCode: r.room_code ?? null, bed: r.bed_label ?? null, from: day(r.starts_on), to: day(r.ends_on) })),
    contributions: rows.contributions.map((c) => ({
      plan: c.plan_name ?? null,
      type: FEE_TYPE_LABEL[c.fee_type as FeeType] ?? c.fee_type,
      periodMonth: day(c.period_month),
      amountDueVnd: n(c.amount_due_vnd),
      discountVnd: n(c.discount_vnd),
      discountReason: c.discount_reason ?? null,
      paidVnd: n(c.paid_vnd),
      status: CONTRIBUTION_STATUS_LABEL[c.status as keyof typeof CONTRIBUTION_STATUS_LABEL] ?? c.status,
      dueDate: day(c.due_date),
      note: c.note ?? null,
    })),
    payments: rows.payments.map((p) => ({
      amountVnd: n(p.amount_vnd),
      method: PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method,
      paidOn: day(p.paid_on),
      reference: p.reference_code ?? null,
      note: p.note ?? null,
      voidedAt: d(p.voided_at),
      voidReason: p.void_reason ?? null,
    })),
    paymentClaims: rows.paymentClaims.map((c) => ({
      method: PAYMENT_METHOD_LABEL[c.method as PaymentMethod] ?? c.method,
      reference: c.reference_code ?? null,
      note: c.note ?? null,
      status: c.status,
      createdAt: d(c.created_at),
      decidedAt: d(c.decided_at),
      decisionNote: c.decision_note ?? null,
    })),
    donations: rows.donations.map((x) => ({
      amountVnd: n(x.amount_vnd),
      donatedOn: day(x.donated_on),
      method: PAYMENT_METHOD_LABEL[x.method as PaymentMethod] ?? x.method,
      reference: x.reference_code ?? null,
      note: x.note ?? null,
      status: DONATION_STATUS_LABEL[x.status as DonationStatus] ?? x.status,
      decidedAt: d(x.decided_at),
      decisionNote: x.decision_note ?? null,
    })),
    leaveRequests: rows.leaveRequests.map((l) => ({
      kind: LEAVE_KIND_LABEL[l.kind as LeaveKind] ?? l.kind,
      event: l.event_title ?? null,
      startsAt: d(l.starts_at),
      endsAt: d(l.ends_at),
      reason: l.reason ?? null,
      destination: l.destination ?? null,
      contactPhone: l.contact_phone_e164 ?? null,
      doorMember: l.door_member ?? null,
      status: LEAVE_STATUS_LABEL[l.status as LeaveStatus] ?? l.status,
      decidedAt: d(l.decided_at),
      decisionNote: l.decision_note ?? null,
      createdAt: d(l.created_at),
      extensions: Array.isArray(l.extensions) ? l.extensions : [],
    })),
    attendance: rows.attendance.map((a) => ({
      event: a.event_title ?? null,
      eventStartsAt: d(a.event_starts_at),
      status: a.status,
      method: a.method,
      checkedInAt: d(a.checked_in_at),
      note: a.note ?? null,
      hasPhoto: !!a.has_photo,
    })),
    massCheckins: rows.massCheckins.map((m) => ({
      day: day(m.day_date),
      occasion: m.occasion,
      church: m.church ?? null,
      note: m.note ?? null,
      status: m.status,
      checkedInAt: d(m.checked_in_at),
      reviewedAt: d(m.reviewed_at),
      reviewNote: m.review_note ?? null,
      hasPhoto: !!m.has_photo,
    })),
    dutyWeeks: rows.dutyWeeks.map((w) => ({ weekStart: day(w.week_start), score: n(w.score), comment: w.review_comment ?? null, redoRequired: !!w.redo_required, redoNote: w.redo_note ?? null })),
    liturgyAssignments: rows.liturgyAssignments.map((a) => ({ event: a.event_title ?? null, eventStartsAt: d(a.event_starts_at), status: a.status, note: a.note ?? null })),
    discipline: rows.discipline.map((x) => ({
      ruleCode: x.rule_code ?? null,
      rule: x.rule_title ?? null,
      occurredOn: day(x.occurred_on),
      note: x.note ?? null,
      penalty: PENALTY_LABEL[x.penalty_kind as PenaltyKind] ?? x.penalty_kind,
      penaltyQuantity: n(x.penalty_qty),
      penaltyDetail: x.penalty_detail ?? null,
      penaltyFrom: day(x.penalty_starts_on),
      penaltyTo: day(x.penalty_ends_on),
      status: x.status,
      completedAt: d(x.completed_at),
      waivedAt: d(x.waived_at),
      waiveReason: x.waive_reason ?? null,
    })),
    merit: rows.merit.map((m) => ({ rule: m.rule_code, points: n(m.points), occurredOn: day(m.occurred_on), note: m.note ?? null })),
    academicRecords: rows.academicRecords.map((r) => ({
      semester: r.semester ?? null,
      university: r.university ?? null,
      major: r.major_snapshot ?? null,
      studentCode: r.student_code_snapshot ?? null,
      status: r.status,
      scholarship: !!r.has_scholarship,
      scholarshipNote: r.scholarship_note ?? null,
      submittedAt: d(r.submitted_at),
      verifiedAt: d(r.verified_at),
      rejectReason: r.reject_reason ?? null,
      grades: Array.isArray(r.grades) ? r.grades : [],
    })),
    studyGoals: rows.studyGoals.map((g) => ({ semester: g.semester ?? null, goals: g.goals ?? null, difficulties: g.difficulties ?? null, visibility: g.visibility, updatedAt: d(g.updated_at) })),
    mealRegistrations: rows.mealRegistrations.map((m) => ({ day: day(m.menu_date), meal: m.meal_type, willEat: !!m.will_eat, guests: n(m.guests), note: m.note ?? null, registeredAt: d(m.registered_at) })),
    prayerIntentions: rows.prayerIntentions.map((p) => ({ content: p.content, anonymous: !!p.is_anonymous, status: p.status, visibility: p.visibility, createdAt: d(p.created_at) })),
    forumPosts: rows.forumPosts.map((p) => ({ title: p.title, content: p.content, status: p.status, createdAt: d(p.created_at), deletedAt: d(p.deleted_at) })),
    albumPhotos: rows.albumPhotos.map((p) => ({ album: p.album ?? null, caption: p.caption ?? null, createdAt: d(p.created_at), deletedAt: d(p.deleted_at) })),
    feedback: rows.feedback.map((f) => ({
      category: f.category,
      content: f.content,
      page: f.page_path ?? null,
      anonymous: !!f.is_anonymous,
      status: f.status,
      response: f.response ?? null,
      respondedAt: d(f.responded_at),
      createdAt: d(f.created_at),
    })),
    dataRequests: rows.dataRequests.map((r) => ({
      type: DATA_REQUEST_TYPE_LABEL[r.type as DataRequestType] ?? r.type,
      status: DATA_REQUEST_STATUS_LABEL[r.status as DataRequestStatus] ?? r.status,
      details: r.details ?? null,
      receivedAt: d(r.received_at),
      dueAt: d(r.due_at),
      completedAt: d(r.completed_at),
      response: r.resolution_note ?? null,
    })),
    notificationPreferences: rows.notificationPreferences.map((p) => ({ category: p.category, channel: p.channel, enabled: !!p.enabled, quietStart: p.quiet_start ?? null, quietEnd: p.quiet_end ?? null })),
    devices: rows.devices.map((s) => ({
      device: s.device_label ?? null,
      browser: s.user_agent ?? null,
      ip: s.ip ?? null,
      signedInAt: d(s.created_at),
      lastSeenAt: d(s.last_seen_at),
      expiresAt: d(s.expires_at),
      signedOutAt: d(s.revoked_at),
      signedOutReason: s.revoked_reason ?? null,
    })),
  };

  // Nhật ký kiểm toán: ai tải dữ liệu cá nhân, lúc nào (không ghi nội dung)
  await tx.query("SELECT app.fn_audit_event('EXPORT', 'members', $1, $2)", [memberId, "Thành viên tải dữ liệu cá nhân của chính mình (Cài đặt → Hồ sơ cá nhân → Tải dữ liệu của tôi)"]);

  const stamp = exportedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  return { fileName: `du-lieu-ca-nhan-${stamp}.json`, json: JSON.stringify(data, null, 2) };
}
