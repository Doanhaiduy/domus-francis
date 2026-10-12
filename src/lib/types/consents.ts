// Đồng ý Điều khoản sử dụng + Chính sách bảo mật theo phiên bản (GET/POST /api/v1/consents/legal) — DTO dùng chung client/server.

export interface LegalConsentStatus {
  /** Phiên bản văn bản hiện hành, vd. "1.2" */
  version: string;
  /** Ngày cập nhật văn bản "dd/mm/yyyy" */
  updated: string;
  /** Đã đồng ý CẢ HAI (Điều khoản sử dụng + Chính sách bảo mật) với phiên bản hiện hành */
  accepted: boolean;
  /** Cần hiện hộp thoại xác nhận bắt buộc: có hồ sơ thành viên và chưa đồng ý phiên bản hiện hành */
  required: boolean;
  /** Thời điểm đồng ý phiên bản hiện hành (ISO) — null nếu chưa */
  acceptedAt: string | null;
  /** Đã từng đồng ý một phiên bản cũ hơn (để hộp thoại nói "văn bản đã cập nhật" thay vì "chào mừng") */
  hadPrevious: boolean;
  /** Phiên bản cũ đã đồng ý gần nhất, vd. "1.1" (null nếu chưa từng) */
  previousVersion: string | null;
}
