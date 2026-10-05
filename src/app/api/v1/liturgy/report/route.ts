import { api } from "@/server/http";
import { massReport } from "@/server/modules/liturgy-calendar";

/** GET ?from&to (≤ 93 ngày) — báo cáo đi lễ của cả nhà: các ngày bắt buộc và số lần vắng của từng anh em (liturgy.calendar.manage). */
export const GET = api({}, (ctx) => ctx.db((tx) => massReport(tx, { from: ctx.query.get("from"), to: ctx.query.get("to") })));
