import { api } from "@/server/http";
import { listSplitAlerts } from "@/server/modules/finance-expenses";

/**
 * Cảnh báo nghi TÁCH PHIẾU CHI (?days=60): ≥ 2 phiếu một chữ ký cho cùng người/nơi nhận trong một tuần, tổng ≥ ngưỡng phiếu cần 2 chữ ký.
 * Chỉ người duyệt chi / xem mọi phiếu chi.
 */
export const GET = api({}, (ctx) => ctx.db((tx) => listSplitAlerts(tx, Number(ctx.query.get("days") ?? 60))));
