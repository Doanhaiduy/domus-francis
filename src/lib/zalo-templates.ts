// Mẫu tin nhắn gửi nhóm Zalo (dùng chung client + server). Mỗi loại tin có mẫu mặc định + danh sách biến {tên};
// Trưởng nhà / Admin sửa mẫu ở Cài đặt → Tích hợp Zalo (lưu ở settings.integration.zalo.templates).
// Dòng nào chỉ gồm biến rỗng sẽ tự bị bỏ, nên mẫu không để lại dòng trống khi thiếu dữ liệu (vd. không có ghi chú).
import type { ZaloEventKey } from "./types/settings";

export interface TemplatePlaceholder {
  name: string;
  desc: string;
  /** Giá trị minh họa cho bản xem trước */
  sample: string;
}

export interface TemplateDef {
  placeholders: TemplatePlaceholder[];
  default: string;
}

const HOUSE: TemplatePlaceholder = { name: "house", desc: "Tên lưu xá", sample: "Lưu Xá Sinh Viên Phanxicô Assisi" };

export const ZALO_TEMPLATES: Record<ZaloEventKey, TemplateDef> = {
  duty_week: {
    placeholders: [
      HOUSE,
      { name: "week", desc: "Khoảng ngày của tuần", sample: "05/10 – 11/10/2026" },
      { name: "members", desc: "Người trực", sample: "Minh Tuấn & Văn Đức" },
      { name: "note", desc: "Ghi chú của Trưởng nhà (có thể trống)", sample: "Quét sân, đổ rác" },
    ],
    default: [
      "🧹 LỊCH TRỰC VỆ SINH SÂN NHÀ — {house}",
      "🗓️ Tuần {week}",
      "👥 Người trực: {members}",
      "📝 {note}",
      "Nhớ dọn dẹp sân nhà trong tuần này nhé. Cảm ơn anh em! 🕊️",
    ].join("\n"),
  },
  dues_reminder: {
    placeholders: [
      HOUSE,
      { name: "plan", desc: "Tên khoản thu", sample: "Quỹ kỳ T7–T12/2026" },
      { name: "due", desc: "Hạn nộp", sample: "15/10/2026" },
      { name: "status", desc: "Dòng tóm tắt số người chưa đóng", sample: "🔴 Còn 3 bạn chưa đóng:" },
      { name: "list", desc: "Danh sách người chưa đóng (nhiều dòng)", sample: "1. Hoàng Long (P.1) — 300.000đ\n2. Tuấn Kiệt (P.4) — 300.000đ" },
      { name: "account", desc: "Tài khoản nhận quỹ", sample: "Techcombank · 1903688889999 · TRAN VAN DUC" },
      { name: "transfer_note", desc: "Nội dung chuyển khoản", sample: "QUY-2026-07 <tên bạn>" },
      { name: "instruction", desc: "Hướng dẫn đóng tiền", sample: "Đóng tiền mặt cho Thủ quỹ hoặc chuyển khoản rồi bấm “Tôi đã đóng” trên web Lưu Xá nhé." },
      { name: "message", desc: "Lời nhắn thêm của người gửi (có thể trống)", sample: "Anh em sớm hoàn tất nhé" },
    ],
    default: [
      "💰 NHẮC ĐÓNG QUỸ — {house}",
      "📌 {plan} · hạn {due}",
      "{status}",
      "{list}",
      "💳 Chuyển khoản: {account}",
      "📝 Nội dung: {transfer_note}",
      "{instruction}",
      "📣 {message}",
      "Pax et Bonum! 🕊️",
    ].join("\n"),
  },
  facility_new: {
    placeholders: [
      { name: "code", desc: "Mã sự cố", sample: "LOG-108" },
      { name: "title", desc: "Tiêu đề báo hỏng", sample: "Vòi nước tầng 2 bị rò" },
      { name: "urgency", desc: "Mức độ khẩn", sample: "Gấp (Trong ngày)" },
      { name: "location", desc: "Vị trí / phòng", sample: "Nhà vệ sinh tầng 2" },
      { name: "reporter", desc: "Người báo", sample: "Minh Tuấn" },
    ],
    default: ["🔧 BÁO HỎNG MỚI {code}", "• {title}", "• Mức độ: {urgency}", "• Vị trí: {location}", "Anh em Ban Hậu cần chú ý xử lý nhé."].join("\n"),
  },
  liturgy: {
    placeholders: [
      { name: "title", desc: "Tên lễ / dịp", sample: "Còn 7 ngày: Lễ Các Thánh" },
      { name: "body", desc: "Nội dung nhắc", sample: "Lễ Các Thánh vào Thứ Bảy 1/11. Anh em nhớ tham dự Thánh lễ." },
    ],
    default: ["⛪ {title}", "{body}"].join("\n"),
  },
  announcement: {
    placeholders: [
      { name: "title", desc: "Tiêu đề thông báo", sample: "Lịch tĩnh tâm tháng 11" },
      { name: "content", desc: "Phần đầu nội dung (tối đa 400 ký tự)", sample: "Anh em đăng ký tham dự tĩnh tâm trước 30/10…" },
    ],
    default: ["📣 THÔNG BÁO: {title}", "{content}", "👉 Xem chi tiết trên web Lưu Xá."].join("\n"),
  },
  event_new: {
    placeholders: [
      { name: "title", desc: "Tên sự kiện", sample: "Dã ngoại cộng đoàn" },
      { name: "when", desc: "Thời gian", sample: "07:00 ngày 12/10/2026" },
      { name: "location", desc: "Địa điểm", sample: "Hồ Đá Bàn" },
      { name: "description", desc: "Mô tả ngắn (có thể trống)", sample: "Mang theo nước và mũ nón" },
    ],
    default: ["📅 SỰ KIỆN MỚI: {title}", "🕒 {when}", "📍 {location}", "📝 {description}", "Anh em xem chi tiết và báo tham gia trên web Lưu Xá nhé."].join("\n"),
  },
  event_reminder: {
    placeholders: [
      { name: "day_label", desc: "HÔM NAY hoặc NGÀY MAI", sample: "HÔM NAY" },
      { name: "date", desc: "Thứ, ngày", sample: "Thứ Tư 08/10" },
      { name: "list", desc: "Danh sách sự kiện (nhiều dòng)", sample: "• 19:30 — Họp nhà @ Phòng sinh hoạt chung\n• 20:30 — Kinh Tối chung" },
    ],
    default: ["⏰ SỰ KIỆN {day_label} ({date})", "{list}", "Anh em sắp xếp thời gian tham gia nhé. 🕊️"].join("\n"),
  },
  reminder_schedule: {
    placeholders: [
      { name: "headline", desc: "Tiêu đề kèm giờ và 'hôm nay/tối nay'", sample: "Họp nhà — 21:00 tối (hôm nay)" },
      { name: "title", desc: "Tên lịch nhắc", sample: "Họp nhà" },
      { name: "time", desc: "Giờ diễn ra (có thể trống)", sample: "21:00 tối" },
      { name: "message", desc: "Nội dung thêm (có thể trống)", sample: "Tại phòng sinh hoạt chung" },
    ],
    default: ["📢 {headline}", "{message}"].join("\n"),
  },
  room_change: {
    placeholders: [
      { name: "member", desc: "Tên thành viên", sample: "Minh Tuấn" },
      { name: "room", desc: "Phòng mới", sample: "P.2" },
    ],
    default: "🚪 {member} chuyển sang {room}.",
  },
  member_joined: {
    placeholders: [
      { name: "member", desc: "Tên thành viên mới", sample: "Hoài An" },
      { name: "room_part", desc: "Phòng ở (vd. “, ở P.3”; có thể trống)", sample: ", ở P.3" },
    ],
    default: "👋 Chào mừng {member} vào nhà{room_part}! Anh em giúp đỡ bạn làm quen nhé. 🕊️",
  },
  birthday: {
    placeholders: [
      { name: "names", desc: "Người sinh nhật hôm nay", sample: "Văn Đức" },
      { name: "them", desc: "“bạn” hoặc “các bạn”", sample: "bạn" },
    ],
    default: ["🎂 Hôm nay sinh nhật {names}!", "Chúc {them} một ngày thật vui, bình an và luôn được Chúa gìn giữ. 🕊️"].join("\n"),
  },
};

const PH = /\{([a-z_]+)\}/g;

/** Thay {biến}; bỏ các dòng mà mọi biến đều rỗng; gộp dòng trống thừa. */
export function renderTemplate(tpl: string, vars: Record<string, string | undefined | null>): string {
  const lines = tpl.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const names = [...line.matchAll(PH)].map((m) => m[1]);
    const rendered = line.replace(PH, (_, n: string) => (vars[n] ?? "").toString());
    if (names.length > 0 && names.every((n) => !(vars[n] ?? "").toString().trim())) continue; // dòng chỉ gồm biến rỗng
    out.push(rendered.replace(/[ \t]+$/g, ""));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Mẫu đang dùng: bản người dùng đã sửa (nếu có và không rỗng) hoặc mặc định. */
export const templateFor = (templates: Record<string, string> | undefined | null, key: ZaloEventKey) => {
  const t = templates?.[key];
  return typeof t === "string" && t.trim() ? t : ZALO_TEMPLATES[key].default;
};

/** Kiểm mẫu: chỉ được dùng biến đã khai báo cho loại tin đó. Trả về thông báo lỗi hoặc null. */
export function validateTemplate(key: ZaloEventKey, tpl: string): string | null {
  const allowed = new Set(ZALO_TEMPLATES[key].placeholders.map((p) => p.name));
  for (const m of tpl.matchAll(PH)) if (!allowed.has(m[1])) return `Biến {${m[1]}} không dùng được cho loại tin này.`;
  if (tpl.length > 1500) return "Mẫu tối đa 1500 ký tự.";
  return null;
}

export const sampleVars = (key: ZaloEventKey) => Object.fromEntries(ZALO_TEMPLATES[key].placeholders.map((p) => [p.name, p.sample]));
