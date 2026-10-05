// Định dạng hiển thị + tin nhắn Zalo cho phân hệ Bếp & Cơm (chỉ sao chép clipboard, không gọi mạng)
import { errorMessage } from "./api";
import type { MealDayDto, MealRosterRowDto, MealSlotDto, MealType, MealCookDto } from "./types/kitchen";

export const MEAL_LABEL: Record<MealType, string> = { lunch: "Trưa", dinner: "Tối" };
const MONTHS = ["", "tháng 1", "tháng 2", "tháng 3", "tháng 4", "tháng 5", "tháng 6", "tháng 7", "tháng 8", "tháng 9", "tháng 10", "tháng 11", "tháng 12"];
const ROLE_LABEL: Record<string, string> = { lead: "Chính", assistant: "Phụ", shopper: "Đi chợ" };

/** "2026-10-04" → "04/10" */
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2026-10-04" → "04/10/2026" */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "2026-10-04" → "4 tháng 10" */
export const dayMonthLong = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7))]}`;

export function addDays(iso: string, n: number) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Giờ địa phương VN của một thời điểm ISO: "09:00" */
export function vnTime(isoTs: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(isoTs));
}
/** "19:00 07/10" (giờ VN) */
export function vnDateTime(isoTs: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" })
      .formatToParts(new Date(isoTs))
      .map((p) => [p.type, p.value])
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
}

/** Thời gian còn lại tới hạn chốt: "Còn 2 tiếng", "Còn 35 phút", "Còn 3 ngày" */
export function countdown(isoTs: string, nowMs = Date.now()) {
  const ms = new Date(isoTs).getTime() - nowMs;
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `Còn ${Math.max(1, min)} phút`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Còn ${h} tiếng${min % 60 >= 10 && h < 3 ? ` ${min % 60} phút` : ""}`;
  return `Còn ${Math.floor(h / 24)} ngày`;
}

export const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`;
export const qtyText = (q: number | null | undefined) =>
  q === null || q === undefined ? "" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(q);

/** "Đình Khôi (Chính) · Minh Tuấn (Phụ)" */
export function cookTeam(cooks: MealCookDto[]) {
  return cooks.map((c) => `${c.name} (${ROLE_LABEL[c.role] ?? c.role})`).join(" · ");
}

/** Người trực cả ngày (gộp trưa + tối, bỏ trùng) */
export function dayCookTeam(day: MealDayDto) {
  const seen = new Map<string, MealCookDto>();
  for (const c of [...day.lunch.cooks, ...day.dinner.cooks]) if (!seen.has(c.memberId)) seen.set(c.memberId, c);
  return cookTeam([...seen.values()]);
}

/** Bỏ mã nghiệp vụ "BR-MEAL-01: " ở đầu thông điệp lỗi và viết hoa chữ đầu. */
export function kitchenErrorText(e: unknown) {
  const m = errorMessage(e).replace(/^BR-[A-Z]+-\d+:\s*/, "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export const slotStatusText = (s: MealSlotDto) =>
  s.status === "cancelled" ? "Không nấu" : s.status === "draft" ? "Chưa mở đăng ký" : s.status === "closed" ? "Đã chốt sổ" : s.pastCutoff ? "Đã khóa sổ" : null;

/** Tin nhắn chốt cơm gửi nhóm Zalo Bếp — từ dữ liệu thật của ngày đang chọn. */
export function formatMealDayForZalo(params: {
  day: MealDayDto;
  roster: MealRosterRowDto[];
  canSeeNames: boolean;
  activeMembers: number;
  today: string;
}) {
  const { day, roster, canSeeNames, activeMembers, today } = params;
  const team = dayCookTeam(day) || "Chưa phân công";
  let text = `🍚 BÁO CÁO CHỐT CƠM LƯU XÁ PHANXICÔ\n`;
  text += `📅 Ngày: ${day.weekdayLong}, ${dmy(day.date)}${day.date === today ? " (Hôm nay)" : ""}\n`;
  text += `👨‍🍳 Trực nấu: ${team}\n`;
  text += `-------------------------------------------\n\n`;
  for (const meal of ["lunch", "dinner"] as MealType[]) {
    const s = day[meal];
    const icon = meal === "lunch" ? "☀️" : "🌙";
    const label = meal === "lunch" ? "BỮA TRƯA" : "BỮA TỐI";
    if (s.status === "cancelled") {
      text += `${icon} ${label}: KHÔNG NẤU\n\n`;
      continue;
    }
    const total = s.eaters + s.guests;
    text += `${icon} ${label}: ${total} suất${s.guests ? ` (${s.eaters} anh em + ${s.guests} khách)` : ""} / ${activeMembers} thành viên\n`;
    if (canSeeNames) {
      const eat = roster.filter((r) => r[meal]?.willEat);
      const absent = roster.filter((r) => r[meal] && !r[meal]!.willEat);
      const none = roster.filter((r) => !r[meal]);
      text += `• Có mặt (${eat.length}): ${eat.map((r) => r.name + (r[meal]!.guests ? ` +${r[meal]!.guests} khách` : "")).join(", ") || "—"}\n`;
      if (absent.length) text += `• Báo vắng (${absent.length}): ${absent.map((r) => r.name).join(", ")}\n`;
      if (none.length) text += `• Chưa đăng ký (${none.length}): ${none.map((r) => r.name).join(", ")}\n`;
    }
    if (s.dishes.length) text += `🍲 Món ${meal === "lunch" ? "trưa" : "tối"}: ${s.dishes.join(", ")}\n`;
    text += `⏰ Chốt suất: ${vnTime(s.cutoffAt)}${s.pastCutoff ? " (đã khóa sổ)" : ""}\n\n`;
  }
  text += `👉 Anh em trực bếp chú ý căn lượng gạo & đồ ăn vừa vặn, tránh lãng phí!\nPax et Bonum! ✨`;
  return text;
}
