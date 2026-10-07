import { api } from "@/server/http";
import { unauthorized } from "@/server/errors";
import { checkInByPhoto } from "@/server/modules/events-attendance";
import { CheckInSchema } from "@/server/modules/events-schema";

/**
 * POST /api/v1/events/checkin { eventId, fileId } — thành viên tự điểm danh bằng ảnh: tải ảnh chụp lên (/api/v1/files, bucket "attachments")
 * rồi gửi mã ảnh. Ghi nhận qua app.fn_checkin_by_photo (giờ máy chủ, có mặt/đi muộn do DB tính, đúng cửa sổ điểm danh + danh sách mời).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CheckInSchema);
  if (!ctx.userId) throw unauthorized();
  return checkInByPhoto((fn) => ctx.db(fn), b);
});
