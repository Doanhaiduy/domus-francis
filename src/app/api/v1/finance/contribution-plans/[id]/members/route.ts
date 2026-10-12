import { api, uuidParam } from "@/server/http";
import { badRequest } from "@/server/errors";
import { syncPlanMembers } from "@/server/modules/finance-contributions";
import { PlanMembersSchema } from "@/server/modules/finance-schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Xem trước "Cập nhật người phải đóng": những ai SẼ được thêm khoản phải thu (không ghi gì).
 * ?members=<id>,<id> — chỉ xét những người này (bắt buộc với khoản thu một lần).
 */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  const raw = ctx.query.get("members");
  const ids = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : null;
  if (ids && (ids.length > 200 || ids.some((x) => !UUID.test(x)))) throw badRequest("Danh sách thành viên không hợp lệ.");
  return ctx.db((tx) => syncPlanMembers(tx, id, ids, true));
});

/**
 * "Cập nhật người phải đóng": thêm khoản phải thu cho người còn thiếu — quỹ định kỳ: mọi người đang ở chưa có khoản (kể cả người vào
 * sau hạn nộp); khoản thu một lần: những người được chọn (memberIds). Không sửa/xóa khoản đã có (bấm lại không sinh trùng).
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(PlanMembersSchema);
  return ctx.db((tx) => syncPlanMembers(tx, id, b.memberIds ?? null, false));
});
