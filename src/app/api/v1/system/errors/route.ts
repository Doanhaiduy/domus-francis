import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { ErrorBulkBody, ErrorsQuery, listErrors, setErrorStatus } from "@/server/modules/system-status";

export const runtime = "nodejs";

/**
 * Nhật ký lỗi đã gộp (error_events) — CHỈ Admin (system.monitor).
 *   GET   ?status=new|ack|resolved|all  ?source=server|client|cron|csp|auth  ?q=<thông điệp / đường dẫn / mã lỗi 8 ký tự>  ?limit=1..200
 *   PATCH { status, ids: [...] }  đổi trạng thái nhiều lỗi một lần (vd. "Đã xem tất cả").
 */
export const GET = api({}, async (ctx) => {
  const parsed = ErrorsQuery.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Bộ lọc không hợp lệ.");
  return ctx.db((tx) => listErrors(tx, parsed.data));
});

export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(ErrorBulkBody);
  const items = await ctx.db((tx) => setErrorStatus(tx, [...new Set(b.ids)], b.status));
  return { updated: items.length, items };
});
