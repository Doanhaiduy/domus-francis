// Các trang được GỘP chung một mục ở thanh bên (cho gọn): thanh bên chỉ có một mục cho cả nhóm, còn trong trang có thanh tab chuyển qua lại
// giữa các trang con (xem components/SectionTabs.tsx). `requires`: chỉ hiện tab với người có một trong các quyền này.
import type { InboxKind } from "./types/inbox";

export interface NavTab {
  href: string;
  label: string;
  requires?: string | string[];
}

export interface NavGroup {
  id: string;
  tabs: NavTab[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: "thong-bao", tabs: [{ href: "/thong-bao", label: "Thông báo" }, { href: "/dien-dan", label: "Diễn đàn" }] },
  { id: "lich", tabs: [{ href: "/lich-su-kien", label: "Lịch & Sự kiện" }, { href: "/xin-phep", label: "Xin phép" }] },
  { id: "tai-chinh", tabs: [{ href: "/thu-chi", label: "Thu chi" }, { href: "/bao-cao", label: "Báo cáo & tổng kết" }] },
  { id: "thanh-vien", tabs: [{ href: "/thanh-vien", label: "Thành viên" }, { href: "/so-do-nha", label: "Sơ đồ nhà" }, { href: "/ky-luat", label: "Vi phạm & kỷ luật" }] },
  { id: "cai-dat", tabs: [{ href: "/cai-dat", label: "Cài đặt" }, { href: "/khoi-tao", label: "Bắt đầu thiết lập", requires: "setting.write" }, { href: "/huong-dan", label: "Hướng dẫn sử dụng" }, { href: "/gop-y", label: "Góp ý" }] },
];

/**
 * Số trên thanh bên / tab con: trang nào xử lý loại việc nào của hộp "Việc cần xử lý" (useInbox — lib/data/inbox.ts).
 * Mục thanh bên gộp nhiều trang ⇒ cộng các loại việc của mọi trang trong nhóm.
 */
export const INBOX_KINDS_BY_PATH: Readonly<Record<string, readonly InboxKind[]>> = {
  "/xin-phep": ["leave"],
  "/thu-chi": ["expense_approve", "expense_pay", "claim", "donation", "bank_line"],
  "/thanh-vien": ["application", "data_request"],
  "/bai-viet": ["inquiry"],
  "/lich-su-kien": ["mass_checkin"],
  "/hoc-tap": ["transcript"],
  "/hau-can": ["issue", "duty_review"],
  "/ky-luat": ["discipline_overdue"],
  "/gop-y": ["feedback"],
};

/** Các loại việc thuộc một hoặc nhiều trang. */
export const inboxKindsFor = (paths: readonly string[]): InboxKind[] => paths.flatMap((p) => INBOX_KINDS_BY_PATH[p] ?? []);

const inPath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Nhóm chứa trang đang xem (null nếu trang không thuộc nhóm nào). */
export const groupOfPath = (pathname: string): NavGroup | null => NAV_GROUPS.find((g) => g.tabs.some((t) => inPath(pathname, t.href))) ?? null;

/** Mọi đường dẫn của nhóm có `href` (để tô sáng mục thanh bên cho cả nhóm). */
export const groupPaths = (href: string): string[] => NAV_GROUPS.find((g) => g.tabs[0].href === href)?.tabs.map((t) => t.href) ?? [href];

export const isInPath = inPath;
