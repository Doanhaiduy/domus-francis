import { api } from "@/server/http";
import { unauthorized } from "@/server/errors";
import { checkIn } from "@/server/modules/events-attendance";
import { CheckInSchema } from "@/server/modules/events-schema";

/**
 * POST /api/v1/events/checkin — thành viên tự điểm danh: { token } (quét mã QR) hoặc { code, eventId? } (mã 6 số), kèm deviceId.
 * Ghi nhận qua app.fn_checkin_by_qr / app.fn_checkin_by_code (giờ máy chủ, present/late do DB tính).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CheckInSchema);
  if (!ctx.userId) throw unauthorized();
  return checkIn((fn) => ctx.db(fn), ctx.userId, b);
});
