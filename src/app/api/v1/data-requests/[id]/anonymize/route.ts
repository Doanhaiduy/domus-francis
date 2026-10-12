import { api, uuidParam } from "@/server/http";
import { DataRequestAnonymizeSchema, anonymizeForRequest } from "@/server/modules/data-requests";

/**
 * Người quản lý (privacy.manage) ẩn danh hóa hồ sơ của người gửi yêu cầu — CHỈ người đã rời nhà; phải gõ lại đúng họ tên + nêu căn cứ.
 * Xóa dữ liệu cá nhân, khóa tài khoản, giữ sổ quỹ/chứng từ; yêu cầu tự đóng (completed). Không gửi thông báo (tài khoản đã bị khóa).
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(DataRequestAnonymizeSchema);
  const r = await ctx.db((tx) => anonymizeForRequest(tx, id, b));
  return { ok: true, ...r };
});
