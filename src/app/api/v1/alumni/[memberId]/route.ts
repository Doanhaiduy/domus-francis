import { api, uuidParam } from "@/server/http";
import { AlumniSchema, saveAlumni } from "@/server/modules/alumni";

/** Lưu hồ sơ cựu (nghề nghiệp, nơi làm việc, thành phố, còn giữ liên lạc). Quyền: member.update hoặc chính chủ (RLS). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(AlumniSchema);
  await ctx.db((tx) => saveAlumni(tx, uuidParam(ctx, "memberId"), b));
  return { ok: true };
});
