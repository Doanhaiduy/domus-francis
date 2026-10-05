import { api } from "@/server/http";
import { createDocument, listDocuments, LiturgyDocumentCreateSchema } from "@/server/modules/liturgy-documents";

/** GET ?q=&kind=&category= — thư viện tài liệu phụng vụ (mọi thành viên); q tìm không dấu theo tiêu đề, chuyên mục, thẻ, lời văn. */
export const GET = api({}, (ctx) =>
  ctx.db((tx) => listDocuments(tx, { q: ctx.query.get("q"), kind: ctx.query.get("kind"), category: ctx.query.get("category") }))
);

/** Thêm tài liệu (liturgy.document.manage: Trưởng nhà, Ban Phụng vụ, Admin). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(LiturgyDocumentCreateSchema);
  const doc = await ctx.db((tx) => createDocument(tx, b));
  return Response.json(doc, { status: 201 });
});
