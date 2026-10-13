import { z } from "zod";
import { api, zUuid } from "@/server/http";
import { badRequest } from "@/server/errors";
import { assertCanManage } from "@/server/modules/articles";
import { readStoredFile, storeUpload } from "@/server/storage";

const Schema = z.object({ fileId: zUuid });

/**
 * Chọn một ảnh của Khoảnh khắc (bucket moments) làm ảnh bìa / ảnh trong bài: sao chép sang bucket `attachments` thành một ảnh MỚI của người soạn
 * (ảnh công khai chỉ phục vụ tệp thuộc attachments đang được bài đã đăng dùng — xem app.fn_public_article_file). Cần article.manage và quyền xem ảnh gốc (RLS).
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Schema);
  await ctx.db((tx) => assertCanManage(tx));
  const f = await readStoredFile(ctx, b.fileId);
  if (f.bucket !== "moments" || !/^image\/(jpeg|png|webp)$/.test(f.mime)) throw badRequest("Chỉ chọn được ảnh từ Khoảnh khắc.");
  const ext = f.mime === "image/png" ? "png" : f.mime === "image/webp" ? "webp" : "jpg";
  const file = new File([new Uint8Array(f.data)], (f.name ?? `khoanh-khac.${ext}`).slice(0, 120), { type: f.mime });
  const stored = await storeUpload(ctx, file, "attachments");
  return Response.json({ fileId: stored.id }, { status: 201 });
});
