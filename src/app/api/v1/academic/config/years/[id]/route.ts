import { api, uuidParam } from "@/server/http";
import { AcademicYearPatchSchema, deleteYear, updateYear } from "@/server/modules/academic-config";

/** Sửa mã/tên/ngày; isCurrent=true ⇒ đặt làm năm học hiện hành (bỏ cờ năm khác trong cùng giao dịch). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(AcademicYearPatchSchema);
  return ctx.db((tx) => updateYear(tx, id, b));
});

/** Xóa năm học (kèm học kỳ trống) — chỉ khi chưa có dữ liệu tham chiếu, ngược lại 409. */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteYear(tx, id));
  return { ok: true };
});
