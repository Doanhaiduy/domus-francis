import { api, uuidParam } from "@/server/http";
import { deleteSemester, SemesterPatchSchema, updateSemester } from "@/server/modules/academic-config";

/** Sửa mã/tên/ngày học kỳ (phải nằm trong năm học, không chồng học kỳ khác). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(SemesterPatchSchema);
  return ctx.db((tx) => updateSemester(tx, id, b));
});

/** Xóa học kỳ — chỉ khi chưa có bảng điểm/GPA/mục tiêu học tập, ngược lại 409. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteSemester(tx, id));
  return { ok: true };
});
