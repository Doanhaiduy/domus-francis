import { api } from "@/server/http";
import { AcademicYearCreateSchema, createYear, listYears } from "@/server/modules/academic-config";

/** Năm học (mới nhất trước), mỗi năm kèm danh sách học kỳ. */
export const GET = api({}, (ctx) => ctx.db((tx) => listYears(tx)));

/** Thêm năm học (term.manage) — kèm học kỳ gợi ý; isCurrent=true ⇒ bỏ cờ hiện hành của năm khác. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(AcademicYearCreateSchema);
  const y = await ctx.db((tx) => createYear(tx, b));
  return Response.json(y, { status: 201 });
});
