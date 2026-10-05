import { api } from "@/server/http";
import { upcomingEvents } from "@/server/modules/events";

/** GET /api/v1/events/upcoming?limit=N — sự kiện đang diễn ra/sắp tới (hợp đồng cho trang Tổng quan). Quyền: event.read. */
export const GET = api({}, (ctx) => {
  const n = Number(ctx.query.get("limit") ?? 5);
  const limit = Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 5;
  return ctx.db((tx) => upcomingEvents(tx, limit));
});
