import { api, uuidParam } from "@/server/http";
import { deleteUniversity, updateUniversity, UniversityPatchSchema } from "@/server/modules/academic-config";

/** Sửa / tạm ẩn (isActive=false) / khôi phục (restore=true) trường. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(UniversityPatchSchema);
  return ctx.db((tx) => updateUniversity(tx, id, b));
});

/** Xóa mềm — trường đang được dùng trả 409 (hãy tạm ẩn). */
export const DELETE = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  await ctx.db((tx) => deleteUniversity(tx, id));
  return { ok: true };
});
