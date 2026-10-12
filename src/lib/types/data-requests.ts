// Yêu cầu về dữ liệu cá nhân (bảng data_subject_requests — quyền của chủ thể dữ liệu theo Luật BVDLCN 91/2025/QH15) — DTO dùng chung client/server.

export type DataRequestType = "access" | "rectification" | "erasure" | "restriction" | "portability" | "withdraw_consent" | "objection" | "other";
export type DataRequestStatus = "received" | "in_progress" | "completed" | "rejected";

/** Loại hiện ở biểu mẫu gửi yêu cầu (portability = "Tải dữ liệu của tôi" tự làm được nên gộp vào "Xem / nhận bản sao"). */
export const DATA_REQUEST_FORM_TYPES: DataRequestType[] = ["access", "rectification", "erasure", "withdraw_consent", "restriction", "objection", "other"];
export const DATA_REQUEST_TYPES: DataRequestType[] = ["access", "rectification", "erasure", "restriction", "portability", "withdraw_consent", "objection", "other"];
export const DATA_REQUEST_STATUSES: DataRequestStatus[] = ["received", "in_progress", "completed", "rejected"];

export const DATA_REQUEST_TYPE_LABEL: Record<DataRequestType, string> = {
  access: "Xem / nhận bản sao dữ liệu",
  rectification: "Sửa dữ liệu chưa đúng",
  erasure: "Xóa dữ liệu",
  restriction: "Hạn chế xử lý",
  portability: "Nhận dữ liệu để mang đi",
  withdraw_consent: "Rút lại đồng ý",
  objection: "Phản đối xử lý",
  other: "Yêu cầu khác",
};

export const DATA_REQUEST_TYPE_HINT: Record<DataRequestType, string> = {
  access: "Biết nhà đang lưu những gì về bạn, hoặc cần bản sao có xác nhận (tự tải được bằng nút “Tải dữ liệu của tôi”).",
  rectification: "Thông tin nào sai, bạn không tự sửa được (vd. ngày vào nhà, phòng ở, khoản quỹ).",
  erasure: "Xóa dữ liệu cá nhân — với người đã rời nhà là ẩn danh hóa hồ sơ; sổ quỹ và chứng từ vẫn giữ theo nghĩa vụ kế toán.",
  restriction: "Tạm ngừng dùng một phần dữ liệu trong lúc chờ đính chính hoặc giải quyết khiếu nại.",
  portability: "Nhận dữ liệu ở dạng máy đọc được (tệp JSON).",
  withdraw_consent: "Rút đồng ý mà bạn không tự tắt được trong ứng dụng (đồng ý thông thường: Cài đặt → Bảo mật).",
  objection: "Phản đối một việc xử lý dữ liệu cụ thể (vd. đăng ảnh có bạn).",
  other: "Câu hỏi hoặc yêu cầu khác về dữ liệu cá nhân của bạn.",
};

/** Loại cần mô tả cụ thể (tối thiểu 10 ký tự). */
export const DATA_REQUEST_NEEDS_DETAILS: DataRequestType[] = ["rectification", "restriction", "objection", "other"];

export const DATA_REQUEST_STATUS_LABEL: Record<DataRequestStatus, string> = {
  received: "Đã tiếp nhận",
  in_progress: "Đang xử lý",
  completed: "Đã hoàn tất",
  rejected: "Không thể thực hiện",
};

/** Số giờ người quản lý cần phản hồi (mặc định của bảng: due_at = received_at + 72 giờ). */
export const DATA_REQUEST_DUE_HOURS = 72;

export interface DataRequestDto {
  id: string;
  type: DataRequestType;
  status: DataRequestStatus;
  details: string | null;
  receivedAt: string;
  /** Hạn phản hồi (72 giờ kể từ lúc gửi) */
  dueAt: string;
  completedAt: string | null;
  /** Trả lời / kết quả xử lý của người quản lý (người gửi thấy) */
  resolutionNote: string | null;
  handledByName: string | null;
  updatedAt: string;
  /** Còn mở và đã quá hạn phản hồi */
  overdue: boolean;
  isMine: boolean;
  /** Người gửi (chỉ trả cho người quản lý) */
  member: { id: string; name: string; status: "active" | "on_leave" | "alumni" | "left"; anonymized: boolean } | null;
}

export interface DataRequestListDto {
  mine: DataRequestDto[];
  /** Người có quyền privacy.manage: mọi yêu cầu (còn mở trước) */
  all: DataRequestDto[] | null;
  canManage: boolean;
  /** Số yêu cầu đang mở / quá hạn (cho người quản lý) */
  openCount: number;
  overdueCount: number;
}
