import { z } from "zod";
import { api } from "@/server/http";
import { forbidden } from "@/server/errors";
import { postToZaloGroup } from "@/server/integrations/zalo";

const Schema = z.object({ text: z.string().trim().min(1, "Nội dung trống.").max(6000, "Nội dung quá dài.") });

/**
 * Gửi một văn bản có sẵn (báo cáo, danh sách, kết quả bình chọn…) vào nhóm Zalo bằng bot. Chỉ Admin / Trưởng nhà (setting.write).
 * Tin được ghi chú "Thao tác bởi <tên>". Trả về {sent, reason}; khi chưa gửi được, giao diện tự sao chép nội dung để dán tay.
 */
export const POST = api({}, async (ctx) => {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_permission('setting.write') AS ok")).rows[0]?.ok);
  if (!ok) throw forbidden("Chỉ Admin / Trưởng nhà mới gửi được tin vào nhóm Zalo.");
  const b = await ctx.body(Schema);
  return postToZaloGroup(ctx, null, b.text);
});
