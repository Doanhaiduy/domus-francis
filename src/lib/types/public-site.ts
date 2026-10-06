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
