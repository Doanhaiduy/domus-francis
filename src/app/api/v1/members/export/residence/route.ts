import { api } from "@/server/http";
import { ResidenceExportSchema, residenceExport } from "@/server/modules/members-lifecycle";

/**
 * Danh sách tạm trú (CCCD đầy đủ) của thành viên đang ở — dữ liệu nhạy cảm: cần quyền member.national_id.read và LÝ DO bắt buộc;
 * mỗi CCCD được ghi kiểm toán READ_SENSITIVE. POST vì có ghi nhật ký kiểm toán.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ResidenceExportSchema);
  return ctx.db((tx) => residenceExport(tx, b.reason));
});
