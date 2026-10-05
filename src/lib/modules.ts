// Danh mục phân hệ Admin có thể tạm ẩn ("Đang bảo trì") — Tổng quan, Cài đặt, Hướng dẫn luôn mở.
// Cấu hình lưu ở settings.ui.disabled_modules: { "<href>": { message?: string; since?: string } }.

export const MODULE_SETTING_KEY = "ui.disabled_modules";
export const DEFAULT_MAINTENANCE_MESSAGE = "Phân hệ này đang tạm bảo trì. Anh em vui lòng quay lại sau nhé!";

export interface ModuleInfo {
  href: string;
  label: string;
  description: string;
}

export const TOGGLEABLE_MODULES: ModuleInfo[] = [
  { href: "/thong-bao", label: "Thông báo", description: "Bảng tin, thông báo của Ban điều hành" },
  { href: "/lich-su-kien", label: "Lịch & Sự kiện", description: "Lịch sinh hoạt, điểm danh, biểu quyết" },
  { href: "/thu-chi", label: "Thu Chi", description: "Quỹ, điện nước, phiếu chi, sổ quỹ" },
  { href: "/bep-com", label: "Bếp & Cơm", description: "Đăng ký suất ăn, thực đơn, kho bếp" },
  { href: "/hau-can", label: "Hậu Cần & Trực", description: "Trực nhật, báo hỏng, giặt đồ, tài sản" },
  { href: "/phung-vu", label: "Phụng Vụ", description: "Lịch phụng vụ, ý cầu nguyện, tài liệu" },
  { href: "/dien-dan", label: "Diễn Đàn", description: "Thảo luận, góp ý" },
  { href: "/thanh-vien", label: "Thành Viên", description: "Danh bạ, hồ sơ, đơn xin vào nhà" },
  { href: "/hoc-tap", label: "Học Tập", description: "Bảng điểm, minh chứng, phụ đạo" },
  { href: "/so-do-nha", label: "Sơ đồ nhà", description: "Phòng ở, xếp phòng" },
  { href: "/khoanh-khac", label: "Khoảnh Khắc", description: "Album ảnh cộng đoàn" },
];

export type DisabledModules = Record<string, { message?: string; since?: string }>;

export interface ModulesStateDto {
  disabled: DisabledModules;
  /** Người xem có quyền đổi cấu hình (setting.write) — vẫn vào được phân hệ đang ẩn để kiểm tra. */
  canManage: boolean;
}

/** Phân hệ chứa đường dẫn hiện tại (vd. /thu-chi/abc ⇒ /thu-chi). */
export function moduleOfPath(pathname: string): ModuleInfo | undefined {
  return TOGGLEABLE_MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));
}
