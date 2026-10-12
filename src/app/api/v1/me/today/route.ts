import { api } from "@/server/http";
import { getMyToday } from "@/server/modules/me-today";

/**
 * "Việc của tôi hôm nay" của CHÍNH người gọi (tuần trực, cơm, khoản quỹ chưa đóng, điểm danh sự kiện, check-in đi lễ, để cửa, đơn xin phép,
 * phân công phụng vụ, hình phạt, Luật nhà chưa xác nhận) + dữ liệu "Bắt đầu với Lưu Xá" — dưới RLS, MỘT vòng mạng.
 */
export const GET = api({}, (ctx) => ctx.db((tx) => getMyToday(tx)));
