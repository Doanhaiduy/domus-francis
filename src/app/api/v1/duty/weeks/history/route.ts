import { api } from "@/server/http";
import { dutyWeekHistory } from "@/server/modules/duty-weeks";

/** GET ?from&to (≤ 2 năm) — lịch trực vệ sinh các tuần trong khoảng kèm kết quả đánh giá (điểm, nhận xét, trực lại) để xuất Excel. */
export const GET = api({}, (ctx) => ctx.db((tx) => dutyWeekHistory(tx, { from: ctx.query.get("from"), to: ctx.query.get("to") })));
