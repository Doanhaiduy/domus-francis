import { api } from "@/server/http";
import { getOpsSummary, getSystemStatus } from "@/server/modules/system-status";

export const runtime = "nodejs";

/**
 * Tình trạng hệ thống — CHỈ Admin (quyền system.monitor).
 *   ?summary=1  bản nhẹ cho dải cảnh báo dưới thanh tiêu đề (MỘT vòng CSDL): cron sáng/tối, sao lưu, số lỗi mới trong 24 giờ.
 *   (mặc định)  bản đầy đủ cho Quản trị → Hệ thống: tác vụ nền, sao lưu, đếm lỗi, kênh gửi, hạ tầng, biến môi trường (CHỈ cờ có/không).
 */
export const GET = api({}, async (ctx) => {
  if (ctx.query.get("summary") === "1") return ctx.db(getOpsSummary);
  return getSystemStatus(ctx);
});
