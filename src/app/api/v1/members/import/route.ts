import { api } from "@/server/http";
import { ImportSchema, importMembers } from "@/server/modules/members-import";

/**
 * Nhập hàng loạt thành viên từ tệp (đã được trình duyệt đọc thành các dòng).
 * dryRun = true: chỉ kiểm tra và trả kết quả từng dòng; false: tạo các dòng hợp lệ (mỗi dòng một điểm lưu). Quyền: member.create.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ImportSchema);
  return ctx.db((tx) => importMembers(tx, b.rows, b.dryRun !== false));
});
