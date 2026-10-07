// Góp ý về ứng dụng — DTO dùng chung client/server.

export type FeedbackCategory = "bug" | "idea" | "ux" | "other";
export type FeedbackStatus = "new" | "reviewing" | "done" | "declined";

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["bug", "idea", "ux", "other"];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ["new", "reviewing", "done", "declined"];

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Lỗi / không hoạt động",
  idea: "Đề xuất tính năng",
  ux: "Khó dùng / giao diện",
  other: "Góp ý khác",
};

export const FEEDBACK_CATEGORY_HINT: Record<FeedbackCategory, string> = {
  bug: "Có chỗ báo lỗi, bấm không được, hiển thị sai…",
  idea: "Bạn muốn ứng dụng có thêm tính năng hay cách làm mới.",
  ux: "Chỗ nào khó hiểu, khó bấm, chữ nhỏ hay rối mắt.",
  other: "Mọi ý kiến khác về ứng dụng.",
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Mới gửi",
  reviewing: "Đang xem xét",
  done: "Đã xử lý",
  declined: "Chưa thực hiện",
};

export interface FeedbackDto {
  id: string;
  category: FeedbackCategory;
  content: string;
  /** Màn hình liên quan (đường dẫn), nếu có */
  pagePath: string | null;
  isAnonymous: boolean;
  /** Ảnh chụp màn hình đính kèm */
  evidenceFileId: string | null;
  status: FeedbackStatus;
  response: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  createdAt: string;
  isMine: boolean;
  /** Tên người gửi: null khi góp ý ẩn tên và người xem không phải chính chủ */
  authorName: string | null;
}

export interface FeedbackListDto {
  /** Góp ý của chính mình (mới nhất trước) */
  mine: FeedbackDto[];
  /** Người có feedback.manage: mọi góp ý (mới gửi trước) */
  all: FeedbackDto[] | null;
  canManage: boolean;
  /** Số góp ý đang ở trạng thái "mới" (cho người quản lý) */
  newCount: number;
}
