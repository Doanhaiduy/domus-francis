import { api } from "@/server/http";
import { createUniversity, listUniversities, UniversityCreateSchema } from "@/server/modules/academic-config";

/** Trường đại học — người quản lý danh mục trường thấy cả trường đang ẩn/đã xóa. */
export const GET = api({}, (ctx) => ctx.db((tx) => listUniversities(tx)));

/** Thêm trường (academic.university.manage / academic.scale.manage). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(UniversityCreateSchema);
  const u = await ctx.db((tx) => createUniversity(tx, b));
  return Response.json(u, { status: 201 });
});
