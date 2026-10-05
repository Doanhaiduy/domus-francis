import { api } from "@/server/http";
import { getCalendar } from "@/server/modules/liturgy-calendar";

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (≤ 62 ngày) — lịch phụng vụ theo ngày: tên lễ, bậc, màu áo, âm lịch, Bổn mạng, ngày đặc biệt,
 *  trích dẫn Tin Mừng, ngày phải check-in đi lễ + trạng thái check-in của tôi. */
export const GET = api({}, (ctx) => ctx.db((tx) => getCalendar(tx, { from: ctx.query.get("from"), to: ctx.query.get("to") })));
