// DTO của trang công khai mở rộng: hỏi đáp, đăng ký tìm hiểu, thư viện ảnh, ủng hộ.

export interface FaqDto {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

export type InquiryStatus = "new" | "contacted" | "visited" | "accepted" | "rejected" | "spam";

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  visited: "Đã đến thăm",
  accepted: "Đã nhận",
  rejected: "Không nhận",
  spam: "Rác / trùng",
};

export interface InquiryDto {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  school: string | null;
  yearOfStudy: string | null;
  parish: string | null;
  message: string | null;
  preferredVisit: string | null;
  status: InquiryStatus;
  note: string | null;
  createdAt: string;
  handledAt: string | null;
  handledByName: string | null;
}

export interface PublicAlbumDto {
  id: string;
  title: string;
  description: string | null;
  takenOn: string;
  location: string | null;
  coverFileId: string | null;
  photosCount: number;
}

export interface PublicAlbumDetailDto extends PublicAlbumDto {
  photos: { id: string; fileId: string; caption: string | null }[];
}

export interface DonationInfo {
  enabled: boolean;
  note: string;
  account: { bankBin: string | null; bankName: string; accountNo: string; accountName: string } | null;
}

// ---------------------------------------------------------------------
// Trang "Vào ở lưu xá" (/vao-o) — số liệu TỔNG QUÁT (app.fn_public_admission_info): không tên người, không ai nợ.
// ---------------------------------------------------------------------
export interface AdmissionScheduleItem {
  /** Giờ / khung giờ như ghi trong Luật nhà (vd. "21:00", "04:30 – 22:00") */
  time: string | null;
  text: string;
  /** Ghi chú (không phải điều khoản) */
  note: boolean;
  /** Điều con (thụt vào) */
  sub: boolean;
}

export interface AdmissionInfo {
  /** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
  today: string;
  dues: {
    /** Mức quỹ mỗi kỳ của một thành viên (finance.dues_cycle_amount_vnd) */
    cycleAmountVnd: number | null;
    cycleMonths: number | null;
    cycleStartMonth: number | null;
    cycleDueDay: number | null;
    /** Mức quỹ mỗi kỳ cho anh em đã ra trường đi làm */
    graduatedAmountVnd: number | null;
    /** Kỳ quỹ đang thu (chỉ tên, mức mỗi người, kỳ YYYY-MM, hạn YYYY-MM-DD) */
    currentPlan: { name: string; amountVnd: number; from: string; to: string; dueDate: string } | null;
  };
  /** Tiền điện nước bình quân mỗi người của tối đa 3 tháng gần nhất (null: chưa có số liệu) */
  utilities: { avgPerPersonVnd: number; months: number; from: string; to: string } | null;
  /** Chỗ trống (enabled = false khi người quản lý tắt org.show_vacancies hoặc chưa khai báo phòng) */
  vacancies: { enabled: false } | { enabled: true; capacity: number; residents: number; free: number };
  rhythm: {
    /** Giờ Kinh tối: lấy từ Luật nhà nếu có ghi; không thì giờ mặc định trong cấu hình (liturgy.night_prayer_time) */
    nightPrayerTime: string | null;
    gateOpen: string | null;
    gateClose: string | null;
    /** Giờ giữ yên lặng / tắt đèn (nếu Luật nhà ghi) */
    quietTime: string | null;
    mealsEnabled: boolean;
    lunchCutoff: string | null;
    dinnerCutoff: string | null;
  };
  /** Mục "Giờ giấc" của Luật nhà (nếu có) */
  schedule: { title: string; description: string | null; items: AdmissionScheduleItem[] } | null;
}

// ---------------------------------------------------------------------
// Ủng hộ: minh bạch (app.fn_public_donation_transparency) — chỉ số tổng
// ---------------------------------------------------------------------
export type DonationTransparency =
  | { enabled: false }
  | {
      enabled: true;
      year: number;
      /** Các năm có số liệu (mới nhất trước, gồm năm nay) */
      years: number[];
      donationCount: number;
      donationTotalVnd: number;
      expenseTotalVnd: number;
      expenseByCategory: { name: string; totalVnd: number }[];
      /** Ngày lấy số liệu (YYYY-MM-DD) */
      asOf: string;
    };
