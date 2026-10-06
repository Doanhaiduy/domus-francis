import { api } from "@/server/http";
import { createFaq, listFaqs } from "@/server/modules/public-site";
import { FaqSchema } from "@/server/modules/public-site-schema";

/** Mọi câu hỏi (kể cả đang ẩn) cho trang quản lý — người có article.manage. */
export const GET = api({}, (ctx) => ctx.db(async (tx) => ({ faqs: await listFaqs(tx, true) })));

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(FaqSchema);
  return Response.json(await ctx.db((tx) => createFaq(tx, b)), { status: 201 });
});
