import { api } from "@/server/http";
import { getDashboardSummary } from "@/server/modules/finance";

/** Tóm tắt quỹ cho trang Tổng quan (số dư, thu/chi tháng, 6 tháng, cơ cấu chi, kỳ quỹ hiện tại + điện nước tháng gần nhất, khoản còn nợ của tôi, phiếu chờ duyệt). */
export const GET = api({}, (ctx) => ctx.db((tx) => getDashboardSummary(tx)));
