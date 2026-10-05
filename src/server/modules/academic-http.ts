import "server-only";
import { toApiError } from "../errors";

/** Thông điệp tiếng Việt của một lỗi (lỗi nghiệp vụ DB được ánh xạ như phản hồi API) — dùng khi lưu thành công nhưng nộp thất bại. */
export function errorMessageOf(e: unknown): string {
  return toApiError(e).message;
}
