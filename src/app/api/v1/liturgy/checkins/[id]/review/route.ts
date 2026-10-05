import { api, uuidParam } from "@/server/http";
import { notifyReviewed, reviewCheckin, ReviewSchema } from "@/server/modules/liturgy-calendar";

/** Người duyệt (liturgy.calendar.manage) đánh dấu check-in hợp lệ / không hợp lệ (kèm lý do) / chờ duyệt; báo kết quả cho người check-in. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReviewSchema);
  const r = await ctx.db((tx) => reviewCheckin(tx, id, b));
  // Thông báo là bước hệ thống tin cậy (luuxa_app không gọi được app.fn_notify) — lỗi gửi không làm hỏng kết quả duyệt
  await ctx.dbAs("luuxa_worker", (tx) => notifyReviewed(tx, r)).catch(() => undefined);
  return { ok: true, status: r.status };
});
