import { api, uuidParam } from "@/server/http";
import { ReactivateSchema, reactivateMember } from "@/server/modules/members-lifecycle";

/** Người đã rời / cựu thành viên quay lại: "Đang ở" + mở lại tài khoản + (tùy chọn) xếp phòng — một thao tác (member.status.change). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ReactivateSchema);
  return ctx.db((tx) => reactivateMember(tx, uuidParam(ctx, "id"), b.roomCode));
});
