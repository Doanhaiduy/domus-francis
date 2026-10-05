// Kiểu dữ liệu + luật kiểm tra dùng chung client/server cho phân hệ Cài đặt (settings, categories, RBAC).
// File thuần TypeScript (không React, không server-only) để màn hình và API kiểm cùng một bộ luật.

export type SettingValueType = "integer" | "number" | "boolean" | "string" | "time" | "vnd" | "json";

export interface SettingDto {
  key: string;
  value: unknown;
  valueType: SettingValueType;
  description: string;
  min: number | null;
  max: number | null;
  isPublic: boolean;
  /** Mã quyền cần có để sửa khóa này (settings.write_permission). */
  writePermission: string;
  /** Giá trị cho nút "Khôi phục mặc định" (settings.default_value); null = không có mặc định. */
  defaultValue: unknown;
  /** Người gọi có quyền sửa (app.has_permission(write_permission)). */
  canWrite: boolean;
  updatedAt: string;
  updatedByName: string | null;
  version: number;
}

export interface SettingWriterDto {
  /** Mô tả tiếng Việt của quyền (permissions.description) */
  description: string;
  /** Tên vai trò đang có quyền này (theo role_permissions) */
  roles: string[];
}

export interface SettingsListDto {
  items: SettingDto[];
  /** write_permission → ai được sửa (để hiển thị lý do khi ô bị khóa) */
  writers: Record<string, SettingWriterDto>;
}

export interface SettingChange {
  key: string;
  value: unknown;
  /** settings.version lúc tải — chống ghi đè thay đổi của người khác */
  version?: number;
}

/** GET /api/v1/settings/public — cấu hình công khai (is_public) cho mọi màn hình. */
export interface OrgSettingsDto {
  houseName: string;
  motto: string;
  address: string;
  /** "MM-DD" như lưu trong DB */
  patronFeast: string;
  /** "DD/MM" để hiển thị */
  patronFeastLabel: string;
  /** Tên lễ trong lịch phụng vụ năm nay (liturgical_days), nếu đã nhập */
  patronFeastTitle: string | null;
  contactPhone: string;
  orderName: string;
  chaplainName: string;
  duesBankAccount: string;
  monthlyDuesVnd: number | null;
  duesDueDay: number | null;
  mealPricePerServingVnd: number | null;
  lunchCutoffTime: string | null;
  dinnerCutoffTime: string | null;
  nightPrayerTime: string | null;
  mealsEnabled: boolean;
  /** Mọi khóa is_public (key → value) cho nhu cầu khác */
  values: Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Danh mục
// ---------------------------------------------------------------------
export const CATEGORY_KINDS = ["expense", "event", "announcement", "forum", "maintenance", "album"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface CategoryDto {
  id: string;
  kind: CategoryKind;
  code: string;
  name: string;
  description: string | null;
  color: string;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  /** Số bản ghi nghiệp vụ đang dùng danh mục (trong phạm vi người gọi được xem) */
  usageCount: number;
  updatedAt: string;
  version: number;
}

export interface CategoryInput {
  kind?: CategoryKind;
  code?: string;
  name?: string;
  description?: string | null;
  color?: string;
  isActive?: boolean;
  version?: number;
}

// ---------------------------------------------------------------------
// Phân quyền
// ---------------------------------------------------------------------
export interface RoleHolderDto {
  userId: string;
  memberId: string | null;
  name: string;
  fullName: string | null;
  avatarFileId: string | null;
  validTo: string | null;
  scopeType: string;
}

export interface RoleDto {
  code: string;
  name: string;
  description: string | null;
  rank: number;
  /** Vai trò hệ thống (Admin, Trưởng nhà, Thủ quỹ, Thành viên): không xóa, bộ quyền khóa — chỉ đổi tên hiển thị/mô tả */
  isSystem: boolean;
  /** Đã xóa nhưng còn lịch sử tham chiếu (lưu trữ) — danh sách GET /api/v1/rbac không trả các vai trò này */
  archived: boolean;
  permissionCount: number;
  /** Mã quyền của vai trò (role_permissions) */
  permissions: string[];
  holders: RoleHolderDto[];
}

export interface PermissionDto {
  code: string;
  module: string;
  description: string;
  isSensitive: boolean;
  /** Mã vai trò có quyền này */
  roles: string[];
}

export interface PermissionModuleDto {
  code: string;
  label: string;
  permissions: PermissionDto[];
}

export interface RbacMatrixDto {
  roles: RoleDto[];
  modules: PermissionModuleDto[];
  /** "all": người gọi xem được mọi phân công vai trò; "own": RLS chỉ cho thấy vai trò của chính mình */
  holdersVisibility: "all" | "own";
  /** Người gọi có quyền auth.role.manage (thêm/sửa/xóa vai trò tự tạo, đổi tên vai trò hệ thống) */
  canManage: boolean;
  /** Người gọi có quyền auth.role.assign (gán/thu hồi vai trò cho người khác) */
  canAssign: boolean;
  /** Quyền vai trò tự tạo không được nhận (app.rbac_protected_permissions()) */
  protectedPermissions: string[];
}

/** Thân POST /api/v1/rbac/roles (code bắt buộc) và PATCH /api/v1/rbac/roles/{code} (không gửi code). */
export interface RoleInput {
  code?: string;
  name: string;
  description?: string | null;
  /** Thứ hạng hiển thị (41–89 với vai trò tự tạo); bỏ trống = giữ nguyên / mặc định 50 */
  rank?: number | null;
  /** Bộ quyền MỚI (thay toàn bộ); bỏ trống = giữ nguyên. Vai trò hệ thống: không được đổi. */
  permissions?: string[] | null;
}

/** Mã vai trò tự tạo: 3–40 ký tự, chữ thường không dấu/số/gạch dưới, bắt đầu bằng chữ (khớp app.fn_role_save). */
export const ROLE_CODE_RE = /^[a-z][a-z0-9_]{2,39}$/;
/** Thứ hạng vai trò tự tạo: dưới Trưởng nhà (20) / Thủ quỹ (30), trên Thành viên (90). Hạng chỉ để sắp xếp, không cấp quyền. */
export const CUSTOM_ROLE_RANK = { min: 41, max: 89, default: 50 } as const;

/**
 * Quyền "bảo vệ": chỉ vai trò hệ thống có, vai trò tự tạo không được nhận (chống leo thang đặc quyền, giữ tách bạch tài khoản/kiểm toán).
 * PHẢI khớp app.rbac_protected_permissions() ở db/app/992_rbac_admin.sql — DB là nơi thực thi, hằng số này để giao diện làm mờ ô.
 */
export const PROTECTED_PERMISSIONS = [
  "auth.role.manage",
  "auth.role.assign",
  "auth.role.delegate",
  "auth.user.manage",
  "auth.session.revoke_any",
  "audit.sensitive.read",
  "member.national_id.read",
] as const;

/** Lý do một quyền bị khóa với vai trò tự tạo (hiển thị cạnh ô bị làm mờ). */
export const PROTECTED_PERMISSION_REASON: Record<string, string> = {
  "auth.role.manage": "Chỉ Admin — tránh tự tạo vai trò có quyền vượt cấp",
  "auth.role.assign": "Chỉ Trưởng nhà / Admin gán vai trò",
  "auth.role.delegate": "Ủy quyền chỉ dành cho vai trò hệ thống",
  "auth.user.manage": "Quản lý tài khoản chỉ dành cho Trưởng nhà / Admin",
  "auth.session.revoke_any": "Thu hồi phiên người khác chỉ dành cho Trưởng nhà / Admin",
  "audit.sensitive.read": "Nhật ký dữ liệu nhạy cảm chỉ Trưởng nhà xem",
  "member.national_id.read": "Giải mã CCCD chỉ Trưởng nhà",
};

export const PERMISSION_MODULE_LABEL: Record<string, string> = {
  auth: "Tài khoản & Phân quyền",
  audit: "Nhật ký kiểm toán",
  setting: "Cài đặt hệ thống & Danh mục",
  member: "Thành viên & Hồ sơ",
  house: "Sơ đồ nhà & Tài sản",
  duty: "Trực nhật & Vệ sinh",
  academic: "Học tập",
  event: "Lịch, Sự kiện & Phụng vụ",
  finance: "Thu chi & Quỹ",
  facility: "Hậu cần & Báo hỏng",
  community: "Cộng đồng (Thông báo, Diễn đàn, Album, Giặt, Bếp…)",
  storage: "Lưu trữ tệp",
  ai: "Trợ lý AI",
};

// ---------------------------------------------------------------------
// Luật kiểm tra giá trị cấu hình (client hiển thị lỗi theo ô; server kiểm lại trước khi ghi — DB còn trigger
// app.tg_settings_validate cho min/max/kiểu và trg_settings__finance_invariants cho ngưỡng chi).
// ---------------------------------------------------------------------
export const ZALO_EVENT_KEYS = ["duty_week", "dues_reminder", "facility_new"] as const;
export type ZaloEventKey = (typeof ZALO_EVENT_KEYS)[number];
export const ZALO_EVENT_LABEL: Record<ZaloEventKey, string> = {
  duty_week: "Lịch trực vệ sinh sân nhà hằng tuần",
  dues_reminder: "Nhắc đóng quỹ / điện nước",
  facility_new: "Có báo hỏng cơ sở vật chất mới",
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TEXT = 300;

type Meta = Pick<SettingDto, "key" | "valueType" | "min" | "max">;

/** Giới hạn độ dài/định dạng riêng của một số khóa chuỗi. */
const STRING_RULES: Record<string, { required?: boolean; max?: number; re?: RegExp; hint?: string; check?: (v: string) => string | null }> = {
  "org.house_name": { required: true, max: 120 },
  "org.motto": { max: 160 },
  "org.address": { max: 200 },
  "org.order_name": { max: 160 },
  "org.chaplain_name": { max: 120 },
  "org.contact_phone": { max: 20, re: /^\+?[0-9][0-9 .()-]{7,18}$/, hint: "Số điện thoại 8–20 ký tự (chữ số, khoảng trắng, + . - ( ))." },
  "org.patron_feast": {
    required: true,
    re: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    hint: "Ngày lễ Bổn mạng dạng DD/MM.",
    check: (v) => {
      const [mm, dd] = v.split("-").map(Number);
      const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
      return dd > days ? `Tháng ${mm} không có ngày ${dd}.` : null;
    },
  },
  "finance.dues_bank_account": { max: 160 },
  "integration.zalo.group_chat_id": {
    max: 100,
    re: /^[A-Za-z0-9._:-]{3,100}$/,
    hint: "Mã cuộc trò chuyện (chat_id) gồm chữ, số và các ký tự . _ : - (3–100 ký tự). Dùng nút “Dò nhóm” để lấy.",
  },
};

/** Khóa json được sửa qua màn hình Cài đặt và cách kiểm tra cấu trúc. */
const JSON_RULES: Record<string, (v: unknown, roles?: string[]) => string | null> = {
  "integration.zalo.group_events": (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return "Cấu hình loại tin Zalo phải là một đối tượng.";
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!(ZALO_EVENT_KEYS as readonly string[]).includes(k)) return `Loại tin Zalo không hợp lệ: ${k}.`;
      if (typeof x !== "boolean") return `Công tắc "${k}" phải là bật/tắt.`;
    }
    return null;
  },
  "laundry.slots": (v) => {
    if (!Array.isArray(v) || v.length === 0 || v.length > 12) return "Cần từ 1 đến 12 khung giờ giặt.";
    let prevEnd = "";
    for (const s of v) {
      if (!Array.isArray(s) || s.length !== 2 || !TIME_RE.test(String(s[0])) || !TIME_RE.test(String(s[1])))
        return "Mỗi khung giờ có dạng HH:MM-HH:MM.";
      if (s[0] >= s[1]) return `Khung ${s[0]}-${s[1]}: giờ kết thúc phải sau giờ bắt đầu.`;
      if (prevEnd && s[0] < prevEnd) return "Các khung giờ phải tăng dần và không chồng lên nhau.";
      prevEnd = s[1];
    }
    return null;
  },
  "auth.mfa_required_roles": (v, roles) => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return "Danh sách vai trò bắt buộc MFA không hợp lệ.";
    if (new Set(v).size !== v.length) return "Danh sách vai trò bị trùng.";
    if (roles && v.some((x) => !roles.includes(x as string))) return "Có mã vai trò không tồn tại.";
    return null;
  },
};

export const isEditableJsonKey = (key: string) => key in JSON_RULES;

/**
 * Kiểm tra một giá trị theo kiểu/giới hạn của khóa. Trả về thông điệp lỗi tiếng Việt hoặc null nếu hợp lệ.
 * `roles`: danh sách mã vai trò hợp lệ (cho auth.mfa_required_roles) — bỏ qua nếu không truyền.
 */
export function validateSettingValue(meta: Meta, value: unknown, roles?: string[]): string | null {
  switch (meta.valueType) {
    case "integer":
    case "vnd":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return "Phải là một con số.";
      if (meta.valueType !== "number" && !Number.isInteger(value)) return "Phải là số nguyên.";
      if (meta.min !== null && value < meta.min) return `Tối thiểu ${fmtBound(meta, meta.min)}.`;
      if (meta.max !== null && value > meta.max) return `Tối đa ${fmtBound(meta, meta.max)}.`;
      return null;
    }
    case "boolean":
      return typeof value === "boolean" ? null : "Phải là bật/tắt.";
    case "time":
      return typeof value === "string" && TIME_RE.test(value) ? null : "Giờ phải có dạng HH:MM (00:00–23:59).";
    case "string": {
      if (typeof value !== "string") return "Phải là chuỗi ký tự.";
      const v = value.trim();
      const rule = STRING_RULES[meta.key] ?? {};
      if (rule.required && !v) return "Không được để trống.";
      if (v.length > (rule.max ?? MAX_TEXT)) return `Tối đa ${rule.max ?? MAX_TEXT} ký tự.`;
      if (v && rule.re && !rule.re.test(v)) return rule.hint ?? "Định dạng không hợp lệ.";
      if (v && rule.check) return rule.check(v);
      return null;
    }
    case "json": {
      const rule = JSON_RULES[meta.key];
      if (!rule) return "Cấu hình dạng JSON này được quản lý ở phân hệ tương ứng, không sửa ở màn hình Cài đặt.";
      return rule(value, roles);
    }
  }
  return "Kiểu cấu hình không hỗ trợ.";
}

function fmtBound(meta: Meta, n: number) {
  return meta.valueType === "vnd" ? `${n.toLocaleString("vi-VN")} đ` : n.toLocaleString("vi-VN");
}

/** So sánh hai giá trị JSON (thứ tự khóa không quan trọng). */
export function sameSettingValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => sameSettingValue(x, bb[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => sameSettingValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** "10-04" → "04/10" */
export const feastToLabel = (mmdd: string) => (/^\d{2}-\d{2}$/.test(mmdd) ? `${mmdd.slice(3)}/${mmdd.slice(0, 2)}` : mmdd);
/** "4/10", "04/10" → "10-04"; trả lại nguyên chuỗi nếu không nhận ra (để luật kiểm tra báo lỗi). */
export function labelToFeast(label: string): string {
  const m = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(label);
  if (!m) return label.trim();
  return `${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
