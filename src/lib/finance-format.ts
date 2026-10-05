// Định dạng dữ liệu Thu Chi cho giao diện và bản tin Zalo/TXT (chỉ tạo văn bản — sao chép clipboard, không gọi mạng).
import { formatVND } from "./utils";

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
/** 'YYYY-MM-DD' → 'DD/MM' */
export const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
/** 'YYYY-MM' → 'Tháng 10/2026' */
export const monthTitle = (ym: string) => `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

/** Thời điểm (ISO) → '04/10/2026 20:30' theo giờ Việt Nam */
export function dateTimeVN(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const p = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
}

/** Hôm nay theo giờ Việt Nam: 'YYYY-MM-DD' */
export const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

export const monthEndOf = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
export const shiftMonth = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export interface FinanceReportText {
  periodLabel: string;
  openingVnd: number;
  incomeVnd: number;
  expenseVnd: number;
  closingVnd: number;
  duesExpectedVnd: number;
  duesCollectedVnd: number;
  /** null: người xem không được thấy danh sách người chưa đóng (chỉ số tổng hợp) */
  unpaid: { name: string; room: string | null; amountVnd: number }[] | null;
  unpaidCount: number | null;
  dueDate: string | null;
  expenses: { date: string; title: string; amountVnd: number; payer: string | null }[];
  categories: { name: string; amountVnd: number }[];
  treasurer: string | null;
}

/** Bản tin báo cáo thu chi gửi nhóm Zalo / tải .txt — mọi số liệu lấy từ sổ quỹ thật. */
export function formatFinanceReportForZalo(r: FinanceReportText): string {
  const outstanding = Math.max(0, r.duesExpectedVnd - r.duesCollectedVnd);
  const rate = r.duesExpectedVnd > 0 ? Math.round((r.duesCollectedVnd / r.duesExpectedVnd) * 100) : null;
  let t = `📊 BÁO CÁO THU CHI - LƯU XÁ PHANXICÔ\n`;
  t += `🗓️ Kỳ đối soát: ${r.periodLabel}\n`;
  t += `-------------------------------------------\n`;
  t += `🏦 Số dư đầu kỳ: ${formatVND(r.openingVnd)}\n`;
  t += `📥 Tổng thu trong kỳ: ${formatVND(r.incomeVnd)}\n`;
  t += `📤 Tổng chi trong kỳ: ${formatVND(r.expenseVnd)} (${r.expenses.length} khoản chi)\n`;
  t += `💰 Tồn quỹ cuối kỳ: ${formatVND(r.closingVnd)}\n`;
  if (r.duesExpectedVnd > 0) {
    t += `🧾 Thu quỹ & điện nước: ${formatVND(r.duesCollectedVnd)} / ${formatVND(r.duesExpectedVnd)}${rate !== null ? ` (${rate}%)` : ""}\n`;
    t += `⏳ Còn phải thu: ${formatVND(outstanding)}${r.unpaidCount !== null ? ` (${r.unpaidCount} bạn)` : ""}\n`;
  }
  t += `\n`;

  if (r.unpaid && r.unpaid.length > 0) {
    t += `🔴 DANH SÁCH CHƯA ĐÓNG ĐỦ QUỸ (${r.unpaid.length} bạn):\n`;
    r.unpaid.forEach((m, i) => {
      t += `${i + 1}. ${m.name}${m.room ? ` (${m.room})` : ""} - còn ${formatVND(m.amountVnd)}\n`;
    });
    if (r.dueDate) t += `👉 Hạn chót: ${dmy(r.dueDate)}. Xin anh em sớm hoàn tất để ban tài chính chốt sổ!\n\n`;
    else t += `👉 Xin anh em sớm hoàn tất để ban tài chính chốt sổ!\n\n`;
  } else if (r.duesExpectedVnd > 0 && outstanding === 0) {
    t += `✅ 100% anh em đã hoàn tất đóng quỹ đầy đủ! Cảm ơn cả nhà! 🎉\n\n`;
  }

  if (r.expenses.length > 0) {
    t += `🛒 CÁC KHOẢN CHI CHÍNH TRONG KỲ:\n`;
    [...r.expenses]
      .sort((a, b) => b.amountVnd - a.amountVnd)
      .slice(0, 5)
      .forEach((e) => {
        t += `• ${dm(e.date)}: ${e.title} (${formatVND(e.amountVnd)})${e.payer ? ` - ${e.payer}` : ""}\n`;
      });
    if (r.expenses.length > 5) t += `• ... và ${r.expenses.length - 5} khoản chi khác.\n`;
  } else if (r.categories.length > 0) {
    t += `🛒 CƠ CẤU CHI TRONG KỲ:\n`;
    r.categories.forEach((c) => {
      t += `• ${c.name}: ${formatVND(c.amountVnd)}\n`;
    });
  }

  t += `\n✨ Mọi phiếu chi đều có chữ ký duyệt và chứng từ lưu trên hệ thống Lưu Xá.`;
  if (r.treasurer) t += `\nThủ quỹ: ${r.treasurer}`;
  t += `\nPax et Bonum! 🕊️`;
  return t;
}
