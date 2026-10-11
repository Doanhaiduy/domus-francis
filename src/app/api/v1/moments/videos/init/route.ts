import { api } from "@/server/http";
import { forbidden } from "@/server/errors";
import { startVideoUpload } from "@/server/modules/moments";
import { VideoInitSchema } from "@/server/modules/moments-schema";

export const runtime = "nodejs";

/**
 * Bước 1 tải video: kiểm quyền thêm vào album + loại tệp + dung lượng, rồi trả địa chỉ và tham số để TRÌNH DUYỆT tải thẳng lên nơi lưu trữ
 * (Cloudinary / Supabase Storage / local) — video không đi qua hàm máy chủ nên không vướng giới hạn 4,5 MB của Vercel.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(VideoInitSchema);
  if (!ctx.userId) throw forbidden("Cần đăng nhập.");
  const uid = ctx.userId;
  return ctx.db((tx) => startVideoUpload(tx, uid, b));
});
