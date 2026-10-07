import { api } from "@/server/http";
import { BoardTermCreateSchema, createBoardTerm, listBoardTerms } from "@/server/modules/academic-config";

/** Nhiệm kỳ người quản lý (mới nhất trước). */
export const GET = api({}, (ctx) => ctx.db((tx) => listBoardTerms(tx)));

/** Thêm nhiệm kỳ (term.manage) — trạng thái Sắp tới hoặc Đang hiệu lực (chỉ một nhiệm kỳ hiệu lực). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BoardTermCreateSchema);
  const t = await ctx.db((tx) => createBoardTerm(tx, b));
  return Response.json(t, { status: 201 });
});
