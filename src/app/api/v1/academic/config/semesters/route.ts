import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { createSemester, listSemesters, SemesterCreateSchema } from "@/server/modules/academic-config";

/** GET ?yearId= — học kỳ (của một năm học hoặc tất cả). */
export const GET = api({}, (ctx) => {
  const yearId = ctx.query.get("yearId");
  if (yearId && !/^[0-9a-f-]{36}$/i.test(yearId)) throw badRequest("Mã năm học không hợp lệ.");
  return ctx.db((tx) => listSemesters(tx, yearId));
});

/** Thêm học kỳ vào một năm học (term.manage). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SemesterCreateSchema);
  const s = await ctx.db((tx) => createSemester(tx, b));
  return Response.json(s, { status: 201 });
});
