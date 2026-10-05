import { api, uuidParam } from "@/server/http";
import { deleteDocument, getDocument, LiturgyDocumentPatchSchema, updateDocument } from "@/server/modules/liturgy-documents";

/** Chi tiết tài liệu (lời văn đầy đủ, tệp PDF, người nhập). */
export const GET = api({}, (ctx) => ctx.db((tx) => getDocument(tx, uuidParam(ctx, "id"))));

/** Sửa / ghim / bỏ ghim — liturgy.document.manage; gửi kèm version để tránh ghi đè bản người khác vừa sửa. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(LiturgyDocumentPatchSchema);
  return ctx.db((tx) => updateDocument(tx, id, b));
});

/** Xóa mềm — liturgy.document.manage. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteDocument(tx, id));
  return { ok: true };
});
