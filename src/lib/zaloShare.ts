import { formatVND } from "./utils";
import { Member, Expense, Contribution } from "./mockData";

/**
 * Universal safe copy to clipboard with fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers or non-secure contexts
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    return false;
  }
}

/**
 * Format Thu Chi report for Zalo Group Chat
 */
export function formatFinancialReportForZalo(params: {
  periodLabel: string;
  fundBalance: number;
  totalCollected: number;
  totalSpent: number;
  totalUnpaid: number;
  unpaidMembers: Contribution[];
  recentExpenses: Expense[];
}): string {
  const {
    periodLabel,
    fundBalance,
    totalCollected,
    totalSpent,
    totalUnpaid,
    unpaidMembers,
    recentExpenses,
  } = params;

  let text = `📊 BÁO CÁO THU CHI - LƯU XÁ PHANXICÔ\n`;
  text += `🗓️ Kỳ đối soát: ${periodLabel}\n`;
  text += `-------------------------------------------\n`;
  text += `💰 Tồn quỹ hiện tại: ${formatVND(fundBalance)}\n`;
  text += `📥 Tổng đã thu trong kỳ: ${formatVND(totalCollected)}\n`;
  text += `📤 Tổng đã chi trong kỳ: ${formatVND(totalSpent)} (${recentExpenses.length} khoản chi)\n`;
  text += `⏳ Khoản chưa thu: ${formatVND(totalUnpaid)} (${unpaidMembers.length} bạn)\n\n`;

  if (unpaidMembers.length > 0) {
    text += `🔴 DANH SÁCH CHƯA ĐÓNG QUỸ (${unpaidMembers.length} bạn):\n`;
    unpaidMembers.forEach((m, idx) => {
      text += `${idx + 1}. ${m.name} (${m.room}) - ${formatVND(m.amount)}\n`;
    });
    text += `👉 Hạn chót: 05/${periodLabel.includes("Tháng") ? periodLabel.replace("Tháng ", "") : "tháng"}. Xin anh em sớm hoàn tất để ban tài chính chốt sổ!\n\n`;
  } else {
    text += `✅ 100% Anh em đã hoàn tất đóng quỹ đầy đủ! Cảm ơn cả nhà! 🎉\n\n`;
  }

  if (recentExpenses.length > 0) {
    text += `🛒 CÁC KHOẢN CHI CHÍNH TRONG KỲ:\n`;
    recentExpenses.slice(0, 5).forEach((e) => {
      text += `• ${e.date}: ${e.name} (${formatVND(e.amount)}) - ${e.paidBy}\n`;
    });
    if (recentExpenses.length > 5) {
      text += `• ... và ${recentExpenses.length - 5} khoản chi khác.\n`;
    }
  }

  text += `\n✨ Mọi chứng từ, hóa đơn đều công khai tại website Lưu Xá.\nPax et Bonum! 🕊️`;
  return text;
}

/**
 * Format Meal attendance for Zalo Kitchen Group
 */
export function formatMealAttendanceForZalo(params: {
  dateStr: string;
  cookTeam: string;
  lunchAttendants: Member[];
  lunchAbsentees: Member[];
  dinnerAttendants: Member[];
  dinnerAbsentees: Member[];
  menuLunch?: string[];
  menuDinner?: string[];
}): string {
  const {
    dateStr,
    cookTeam,
    lunchAttendants,
    lunchAbsentees,
    dinnerAttendants,
    dinnerAbsentees,
    menuLunch,
    menuDinner,
  } = params;

  let text = `🍚 BÁO CÁO CHỐT CƠM LƯU XÁ PHANXICÔ\n`;
  text += `📅 Ngày: ${dateStr}\n`;
  text += `👨‍🍳 Trực nấu hôm nay: ${cookTeam}\n`;
  text += `-------------------------------------------\n\n`;

  text += `☀️ BỮA TRƯA: ${lunchAttendants.length} / 12 suất\n`;
  text += `• Có mặt (${lunchAttendants.length}): ${lunchAttendants.map((m) => m.name).join(", ")}\n`;
  if (lunchAbsentees.length > 0) {
    text += `• Báo vắng (${lunchAbsentees.length}): ${lunchAbsentees.map((m) => m.name).join(", ")}\n`;
  }
  if (menuLunch && menuLunch.length > 0) {
    text += `🍲 Món trưa: ${menuLunch.join(", ")}\n`;
  }

  text += `\n🌙 BỮA TỐI: ${dinnerAttendants.length} / 12 suất\n`;
  text += `• Có mặt (${dinnerAttendants.length}): ${dinnerAttendants.map((m) => m.name).join(", ")}\n`;
  if (dinnerAbsentees.length > 0) {
    text += `• Báo vắng (${dinnerAbsentees.length}): ${dinnerAbsentees.map((m) => m.name).join(", ")}\n`;
  }
  if (menuDinner && menuDinner.length > 0) {
    text += `🍲 Món tối: ${menuDinner.join(", ")}\n`;
  }

  text += `\n👉 Anh em trực bếp chú ý căn lượng gạo & đồ ăn vừa vặn, tránh lãng phí!\nPax et Bonum! ✨`;
  return text;
}

/**
 * Format Member brief CV for Zalo / Quick text sharing
 */
export function formatMemberCVForZalo(member: Member): string {
  let text = `📋 SƠ YẾU LÝ LỊCH VẮN TẮT - SINH VIÊN LƯU XÁ\n`;
  text += `-------------------------------------------\n`;
  text += `✝️ Tên Thánh: ${member.holyName || "Đang cập nhật"}\n`;
  text += `👤 Họ và tên: ${member.fullName}\n`;
  text += `🎂 Ngày sinh: ${member.birthDate || "---"} | Giới tính: ${member.gender || "Nam"}\n`;
  text += `🚪 Phòng ở: ${member.room} | Chức vụ: ${member.role}\n`;
  text += `📞 SĐT Cá nhân: ${member.phone}\n`;
  text += `⛪ Giáo phận: ${member.diocese || "---"} | Giáo xứ: ${member.parish || "---"}\n`;
  text += `🎓 Đại học: ${member.university || "---"}\n`;
  text += `📚 Chuyên ngành: ${member.major || "---"} | Niên khóa: ${member.academicYear || "---"}\n`;
  text += `🏡 Quê quán: ${member.hometown || "---"}\n`;
  text += `👨‍👩‍👦 Phụ huynh: ${member.fatherName || member.motherName || "---"}\n`;
  text += `🆘 SĐT Khẩn cấp: ${member.parentPhone || "---"}\n`;
  text += `🤝 Ban phụ trách: ${member.duty || "Sinh hoạt cộng đoàn"}\n`;
  text += `📅 Ngày vào lưu xá: ${member.joined}\n`;
  text += `-------------------------------------------\n`;
  text += `Cộng đoàn Lưu Xá Sinh Viên Phanxicô Assisi 🕊️`;
  return text;
}
