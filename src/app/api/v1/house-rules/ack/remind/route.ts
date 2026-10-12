import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { hashKey, rateLimit } from "@/server/ops";
import { pendingAckInfo, remindPendingAck } from "@/server/modules/house-rules-ack";

/**
 * Người có house.rules.manage nhắc mọi thành viên đang ở CHƯA xác nhận phiên bản Luật nhà hiện hành (thông báo system.house_rules_ack).
 * Mỗi phiên bản nhắc tối đa một lần mỗi 12 giờ (cả nhà dùng chung giới hạn) để không làm phiền anh em.
 */
export const POST = api({}, async (ctx) => {
  const info = await ctx.db(async (tx) => {
    const i = await pendingAckInfo(tx);
    if (!i.version) throw new ApiError(422, "NO_HOUSE_RULES", "Nhà chưa có luật nhà để nhắc xác nhận.");
    if (i.pending === 0) return { ...i, allowed: true };
    return { ...i, allowed: await rateLimit(tx, `house-rules-remind:${hashKey(i.version)}`, 12 * 3600, 1) };
  });
  if (info.pending === 0) return { reminded: 0, pending: 0 };
  if (!info.allowed) throw new ApiError(429, "RATE_LIMITED", "Đã nhắc anh em xác nhận phiên bản này trong 12 giờ qua — để mọi người kịp đọc rồi nhắc lại sau.");
  const reminded = await ctx.dbAs("luuxa_worker", (tx) => remindPendingAck(tx, info.version!, info.updatedAt));
  return { reminded, pending: info.pending };
});
