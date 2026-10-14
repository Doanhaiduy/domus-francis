// Hai trang cấu hình, hai đối tượng:
//   /cai-dat  — CÀI ĐẶT: hồ sơ + bảo mật + thông báo của chính mình, và cấu hình của lưu xá (thông tin chung, danh mục, nhắc lịch…)
//   /quan-tri — QUẢN TRỊ HỆ THỐNG: phần kỹ thuật/vận hành chỉ người quản trị dùng (phân quyền, tài khoản, Zalo, AI, dung lượng, nhật ký, phiên bản…)
// Tab nào thuộc trang nào khai ở đây (một nơi duy nhất) để liên kết cũ dạng /cai-dat?tab=<tab> tự chuyển đúng trang.

export const ADMIN_TABS = ["system", "version", "storage", "ai", "zalo", "modules", "roles", "accounts", "activity"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export const isAdminTab = (t: string | null | undefined): t is AdminTab => !!t && (ADMIN_TABS as readonly string[]).includes(t);

/** Đường dẫn của một tab cấu hình (đúng trang /cai-dat hay /quan-tri). */
export const settingsTabHref = (tab: string) => `${isAdminTab(tab) ? "/quan-tri" : "/cai-dat"}?tab=${encodeURIComponent(tab)}`;

/** Quyền nào thì mở được trang Quản trị (thanh bên chỉ hiện mục này với người có một trong các quyền này; từng tab còn kiểm riêng). */
export const ADMIN_SECTION_PERMISSIONS = ["system.monitor", "ai.manage", "setting.write", "auth.role.assign", "auth.role.manage", "auth.role.delegate", "auth.user.read", "activity.log.read"] as const;
