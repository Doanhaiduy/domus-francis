import { api } from "@/server/http";
import { getSummary } from "@/server/modules/academic";

/** Tóm tắt học tập cho trang Tổng quan: bảng điểm học kỳ hiện tại của tôi, số bảng điểm chờ xác minh, thống kê ẩn danh. */
export const GET = api({}, (ctx) => ctx.db((tx) => getSummary(tx)));
