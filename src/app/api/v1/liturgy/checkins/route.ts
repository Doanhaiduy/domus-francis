import { api } from "@/server/http";
import { CheckinSchema, submitCheckin } from "@/server/modules/liturgy-calendar";

/** Check-in đi lễ (hoặc cập nhật check-in chưa được duyệt) cho ngày bắt buộc. Lễ trọng/Bổn mạng ngoài Chúa Nhật cần evidenceFileId
 *  — ảnh tải lên trước qua POST /api/v1/files (bucket "attachments"). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CheckinSchema);
  const c = await ctx.db((tx) => submitCheckin(tx, b));
  return Response.json(c, { status: 201 });
});
