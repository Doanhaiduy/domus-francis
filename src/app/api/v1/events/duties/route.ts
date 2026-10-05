import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { dayDuties } from "@/server/modules/events";

/** GET /api/v1/events/duties?date=YYYY-MM-DD — phân công trực nhật đã công bố của một ngày (chỉ đọc, hiển thị trên lịch). */
export const GET = api({}, (ctx) => {
  const date = ctx.query.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Thiếu tham số date dạng YYYY-MM-DD.");
  return ctx.db((tx) => dayDuties(tx, date));
});
