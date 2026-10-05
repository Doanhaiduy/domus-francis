import { api } from "@/server/http";
import { getMealsSummary, kdb } from "@/server/modules/kitchen";

/** Tóm tắt bữa ăn hôm nay (cho trang Tổng quan): số suất trưa/tối, đăng ký của tôi, kho sắp hết, yêu cầu chờ, khảo sát đang mở. */
export const GET = api({}, (ctx) => kdb(ctx, getMealsSummary));
