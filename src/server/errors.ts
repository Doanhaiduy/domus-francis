import "server-only";
import { humanizeErrorMessage } from "@/lib/humanize-error";

/**
 * Lỗi API theo RFC 9457 (application/problem+json) — Phần 6.1.6 tài liệu thiết kế.
 * `code` là mã nghiệp vụ ổn định (BR-xxx hoặc mã kỹ thuật) để client xử lý theo mã, không theo câu chữ.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: { field: string; message: string }[]
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, errors?: ApiError["errors"]) => new ApiError(400, "VALIDATION_FAILED", msg, errors);
export const unauthorized = (msg = "Bạn cần đăng nhập.") => new ApiError(401, "UNAUTHENTICATED", msg);
export const forbidden = (msg = "Bạn không có quyền thực hiện thao tác này.") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Không tìm thấy dữ liệu.") => new ApiError(404, "NOT_FOUND", msg);
export const conflict = (msg: string, code = "CONFLICT") => new ApiError(409, code, msg);

const TITLES: Record<number, string> = {
  400: "Dữ liệu không hợp lệ",
  401: "Chưa đăng nhập",
  403: "Không có quyền",
  404: "Không tìm thấy",
  409: "Xung đột dữ liệu",
  413: "Tệp quá lớn",
  415: "Định dạng không hỗ trợ",
  422: "Vi phạm quy tắc nghiệp vụ",
  423: "Tài khoản đang bị khóa",
  429: "Quá nhiều yêu cầu",
  500: "Lỗi hệ thống",
  503: "Hệ thống bận",
};

interface PgError {
  code?: string;
  message: string;
  detail?: string;
  constraint?: string;
  column?: string;
  table?: string;
}

const isPgError = (e: unknown): e is PgError =>
  !!e && typeof e === "object" && "code" in e && typeof (e as PgError).code === "string" && /^[0-9A-Z]{5}$/.test((e as PgError).code!);

/** Lỗi do trigger/hàm nghiệp vụ ném ra mang câu chữ tiếng Việt dành cho người dùng; tách mã BR-xxx nếu có. */
function brCode(msg: string): string | null {
  return /^(BR-[A-Z]+-\d+)/.exec(msg)?.[1] ?? null;
}

const FRIENDLY_CONSTRAINT: Record<string, string> = {
  ux_users__email: "Email này đã được dùng cho tài khoản khác.",
  ux_users__phone: "Số điện thoại này đã được dùng cho tài khoản khác.",
  ex_laundry_bookings__no_overlap: "Khung giờ này vừa có người đặt. Vui lòng chọn khung khác.",
  ex_room_assignments__no_overlap: "Thành viên đang có phân phòng trùng thời gian.",
  ux_duty_checkins__evidence: "Ảnh minh chứng này đã được dùng cho lần check-in khác — hãy chụp ảnh mới.",
};

/** Ánh xạ một lỗi bất kỳ → (status, code, detail). Bảng ánh xạ duy nhất cho toàn API (⑦.4 / C.6 kiểm định). */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (isPgError(e)) {
    const msg = e.message;
    const br = brCode(msg);
    const friendly = (e.constraint && FRIENDLY_CONSTRAINT[e.constraint]) || null;
    // RAISE EXCEPTION trong trigger/hàm nghiệp vụ (không gắn constraint) mang câu chữ tiếng Việt dành cho người dùng → giữ nguyên.
    const raised = !e.constraint && !/violates|duplicate key|null value in column/i.test(msg);
    const userMsg = (fallback: string) => friendly ?? (br || raised ? msg : fallback);
    switch (e.code) {
      case "23505": return new ApiError(409, br ?? "DUPLICATE", userMsg("Dữ liệu bị trùng với bản ghi đã có."));
      case "23P01": return new ApiError(409, br ?? "OVERLAP", userMsg("Trùng lịch/khoảng thời gian với bản ghi đã có."));
      case "23503": return new ApiError(409, br ?? "REFERENCE", userMsg("Dữ liệu đang được tham chiếu hoặc tham chiếu tới bản ghi không tồn tại."));
      case "23502": return new ApiError(422, br ?? "REQUIRED", raised ? msg : "Thiếu thông tin bắt buộc.");
      case "23514": return new ApiError(422, br ?? "CHECK_FAILED", userMsg("Dữ liệu không thỏa ràng buộc nghiệp vụ."));
      case "22P02":
      case "22007":
      case "22008":
      case "22003": return new ApiError(400, "INVALID_VALUE", "Giá trị không hợp lệ.");
      case "42501": {
        if (/row-level security|permission denied/i.test(msg)) return new ApiError(403, br ?? "FORBIDDEN", br ? msg : "Bạn không có quyền thực hiện thao tác này.");
        return new ApiError(403, br ?? "FORBIDDEN", msg);
      }
      case "P0002": return new ApiError(404, br ?? "NOT_FOUND", msg);
      case "40001":
      case "40P01":
      case "55P03": return new ApiError(409, "RETRY", "Dữ liệu đang được người khác cập nhật, vui lòng thử lại.");
      case "57014": return new ApiError(503, "TIMEOUT", "Thao tác mất quá nhiều thời gian, vui lòng thử lại.");
      case "P0001":
      case "22023":
      case "22000":
      case "23000": return new ApiError(422, br ?? "BUSINESS_RULE", msg);
    }
    if (e.code?.startsWith("22") || e.code?.startsWith("23")) return new ApiError(422, br ?? "BUSINESS_RULE", msg);
  }
  console.error("[api] lỗi không mong đợi:", e);
  return new ApiError(500, "INTERNAL", "Đã có lỗi hệ thống. Vui lòng thử lại sau.");
}

export function problemResponse(err: ApiError, requestId: string, instance?: string): Response {
  const body = {
    type: `https://luuxa.local/problems/${err.code.toLowerCase()}`,
    title: TITLES[err.status] ?? "Lỗi",
    status: err.status,
    // Lời thường cho người dùng: bỏ mã quy tắc/mã quyền/tên bảng-hàm (mã nghiệp vụ vẫn ở `code`)
    detail: humanizeErrorMessage(err.message),
    code: err.code,
    instance,
    // errors[] giữ nguyên: có nơi dùng làm dữ liệu máy đọc (vd. mã BR-AI-03 cho client AI); câu chữ theo ô đã là tiếng Việt
    errors: err.errors,
    request_id: requestId,
  };
  return new Response(JSON.stringify(body), {
    status: err.status,
    headers: { "content-type": "application/problem+json; charset=utf-8", "x-request-id": requestId },
  });
}
