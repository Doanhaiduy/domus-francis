// Làm sạch thông điệp lỗi trước khi tới người dùng: trigger/hàm nghiệp vụ trong DB (và một số lỗi phía API) viết câu chữ
// kèm mã quy tắc ("BR-FIN-06: …"), mã quyền ("(notification.send)"), mã trạng thái ("trạng thái scheduled"),
// tên bảng/cột/hàm. Mã nghiệp vụ vẫn nằm ở trường `code` của problem+json cho client xử lý; phần `detail` chỉ còn lời thường.
// File thuần TS — dùng được cả phía máy chủ lẫn trình duyệt.
import { SETTING_CATALOG } from "./settings-catalog";

/** Tên ngắn của các quyền hay xuất hiện trong thông điệp lỗi. */
const PERMISSION_SHORT: Record<string, string> = {
  "auth.role.assign": "gán vai trò",
  "auth.user.manage": "quản lý tài khoản",
  "dsr.manage": "xử lý yêu cầu dữ liệu cá nhân",
  "event.manage": "quản lý sự kiện",
  "finance.contribution.waive": "miễn/giảm khoản thu",
  "finance.ledger.adjust": "điều chỉnh sổ cái",
  "finance.settings.write": "sửa cấu hình tài chính",
  "issue.resolve": "xử lý sự cố",
  "issue.triage": "phân loại sự cố",
  "liturgy.manage": "quản lý phụng vụ",
  "meal.manage": "quản lý bếp",
  "member.status.change": "đổi trạng thái cư trú",
  "member.update": "sửa hồ sơ thành viên",
  "notification.send": "gửi thông báo",
  "security.settings.write": "sửa cấu hình bảo mật",
  "setting.write": "sửa cấu hình hệ thống",
};

/** Nhóm tệp tải lên (storage bucket). */
const BUCKET_LABEL: Record<string, string> = {
  "academic-evidence": "minh chứng học tập",
  attachments: "tệp đính kèm",
  avatars: "ảnh đại diện",
  "cleaning-evidence": "ảnh minh chứng trực nhật",
  documents: "tài liệu",
  maintenance: "ảnh báo hỏng",
  moments: "ảnh khoảnh khắc",
  receipts: "ảnh hóa đơn",
};

/** Mã trạng thái (enum) → lời thường. Chỉ thay khi đứng riêng thành một từ. */
const STATUS_WORD: Record<string, string> = {
  active: "đang ở",
  approved: "đã duyệt",
  cancelled: "đã hủy",
  checked_in: "đã check-in",
  closed: "đã đóng",
  confirmed: "đã xác nhận",
  draft: "nháp",
  expired: "hết hạn",
  in_service: "đang sử dụng",
  manual: "thủ công",
  missed: "bỏ ca",
  no_show: "không đến",
  on_leave: "tạm vắng",
  open: "đang mở",
  paid: "đã chi",
  passed: "đạt",
  pending: "đang chờ",
  published: "đã công bố",
  ready: "sẵn sàng",
  rejected: "bị từ chối",
  rework: "phải làm lại",
  scheduled: "đã lên lịch",
  submitted: "đã nộp",
  verified: "đã xác minh",
};

const TERM: [RegExp, string][] = [
  [/\broster\b/gi, "lịch trực tuần"],
  [/\bghi audit\b/gi, "ghi nhật ký kiểm toán"],
  [/\baudit\b/gi, "nhật ký kiểm toán"],
  [/\bworker\b/gi, "hệ thống"],
  [/\bjob\b/gi, "tác vụ tự động"],
  [/\bclient\b/gi, "ứng dụng"],
  [/\bPoll\b/g, "Cuộc biểu quyết"],
  [/\bhạn SLA\b/g, "hạn xử lý"],
  [/\bSLA\b/g, "thời hạn xử lý"],
  [/\bappend-only\b/gi, "chỉ ghi thêm"],
  [/\blocale\/time_zone\b/gi, "ngôn ngữ/múi giờ"],
  [/\beffective_from\b/gi, "ngày hiệu lực"],
  [/\bphoto_tagging\b/g, "gắn thẻ tên trong ảnh"],
  [/\bscope_id\b/gi, "phạm vi"],
];

const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase("vi-VN") + s.slice(1) : s);

/** Trả về thông điệp tiếng Việt sạch (không mã quy tắc/quyền/bảng/hàm). Giữ nguyên câu đã sạch. */
export function humanizeErrorMessage(raw: string | null | undefined): string {
  if (!raw) return "";
  let m = String(raw);

  // 0. Thiếu đồng ý lưu hồ sơ Công giáo (trigger require_consent): nói rõ ai cần làm gì
  if (/chưa đồng ý xử lý dữ liệu tôn giáo/i.test(m)) {
    return "Hồ sơ Công giáo chỉ được lưu khi thành viên đã đồng ý. Hãy vào Cài đặt → Hồ sơ cá nhân → mục “Hồ sơ Công giáo & Bí tích” và bấm “Đồng ý lưu hồ sơ Công giáo” (với người khác: họ cần tự bấm đồng ý trên tài khoản của mình).";
  }

  // 1. Mã quy tắc ở đầu câu ("BR-FIN-06: …", "BR-COM-05/BR-COM-21: …") và trong ngoặc ("(BR-FIN-17)")
  m = m.replace(/^\s*(?:BR-[A-Z]+-\d+[a-z]?\s*\/\s*)*BR-[A-Z]+-\d+[a-z]?\s*[:：—–-]\s*/, "");
  m = m.replace(/\s*\((?:BR|E|D)-[A-Z]*-?\d+[a-z]?\)/g, "");
  m = m.replace(/\b(?:BR-[A-Z]+-\d+[a-z]?|E-\d{3})\b:?\s*/g, "");

  // 2. Lời gọi hàm / tên hàm DB: "dùng app.fn_submit_expense() để nộp duyệt" → bỏ tên hàm
  m = m.replace(/\s*\((?:hoặc\s+)?app\.[a-z_]+(?:\(\))?\)/gi, "");
  m = m.replace(/;\s*dùng app\.[a-z_]+\(\)[^.;]*/gi, "");
  m = m.replace(/\bapp\.[a-z_]+(?:\(\))?/gi, "chức năng hệ thống");

  // 3. Mã quyền: "(cần quyền member.update)", "(notification.send)", "(quyền finance.contribution.waive — Trưởng nhà)"
  const permWord = (code: string) => PERMISSION_SHORT[code] ?? "phù hợp";
  m = m.replace(/\((?:cần\s+)?(?:quyền\s+)?([a-z]+(?:\.[a-z_]+)+)\s*[—–-]\s*([^()]+)\)/g, (_, _c, who) => `(${String(who).trim()})`);
  m = m.replace(/\((?:cần\s+)?quyền\s+([a-z]+(?:\.[a-z_]+)+)\)/g, (_, c) => `(cần quyền ${permWord(c)})`);
  m = m.replace(/\s*\(([a-z]+(?:\.[a-z_]+)+)\)/g, (all, c) =>
    PERMISSION_SHORT[c] || /\.(manage|write|read|send|change|update|assign|adjust|waive)$/.test(c) ? "" : all,
  );
  m = m.replace(/\bcần quyền ([a-z]+(?:\.[a-z_]+)+)/g, (_, c) => `cần quyền ${permWord(c)}`);
  m = m.replace(/\bquyền ([a-z]+(?:\.[a-z_]+)+)(?:\/[a-z]+(?:\.[a-z_]+)+)*/g, (_, c) => `quyền ${permWord(c)}`);

  // 4. Khóa cấu hình trong ngoặc kép → tên hiển thị; "(settings laundry.slots)" → bỏ
  m = m.replace(/\s*\(settings? [a-z.]+\)/gi, "");
  m = m.replace(/"([a-z]+(?:\.[a-z0-9_]+)+)"/g, (all, k) => (SETTING_CATALOG[k] ? `"${SETTING_CATALOG[k].label}"` : all));

  // 5. Chú thích kỹ thuật trong ngoặc: (pHash), (SHA-256), (EXIF/camera), (ready), (is_loanable), (in)…
  m = m.replace(/\s*\((?:pHash|SHA-256|EXIF(?:\/camera)?|ready|in|out|status [a-z_]+)\)/g, "");
  m = m.replace(/\s*\(([a-z]+_[a-z_]+)\)/g, (_, w) => (STATUS_WORD[w] ? ` (${STATUS_WORD[w]})` : ""));
  m = m.replace(/\bmục đích [a-z_]+/g, "mục đích tương ứng");
  m = m.replace(/\b[a-z]+(?:_[a-z0-9]+)*\.[a-z]+_[a-z0-9_]+\b/g, "mục này"); // bảng.cột
  m = m.replace(/\bcột [a-z_]+\b/g, "trường dữ liệu này");

  // 6. Nhóm tệp: "trong bucket cleaning-evidence" / mục "documents" → tên tiếng Việt
  m = m.replace(/\bbucket\s+"?([a-z][a-z-]*)"?/gi, (_, b) => `nhóm "${BUCKET_LABEL[b] ?? "tệp khác"}"`);
  m = m.replace(/\bmục "([a-z][a-z-]*)"/g, (all, b) => (BUCKET_LABEL[b] ? `mục "${BUCKET_LABEL[b]}"` : all));

  // 7. Mã trạng thái đứng riêng
  m = m.replace(/\b([a-z]+(?:_[a-z]+)?)\b/g, (w) => STATUS_WORD[w] ?? w);

  // 8. Thuật ngữ tiếng Anh còn sót
  for (const [re, rep] of TERM) m = m.replace(re, rep);

  return capitalize(m.replace(/\s{2,}/g, " ").replace(/\s+([.,;:)])/g, "$1").trim());
}
