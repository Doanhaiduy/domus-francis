import { api } from "@/server/http";
import { getDutySummary } from "@/server/modules/duty";

/** Tóm tắt Hậu cần cho Tổng quan: tuần trực vệ sinh hiện tại, lần trực sắp tới của tôi, số tuần chờ đánh giá, số sự cố đang mở. */
export const GET = api({}, (ctx) => ctx.db((tx) => getDutySummary(tx)));
