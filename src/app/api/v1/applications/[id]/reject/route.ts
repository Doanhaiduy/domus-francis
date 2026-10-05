import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { ApiError } from "@/server/errors";

const Body = z.object({ note: z.string().trim().min(5, "Ghi rõ lý do (tối thiểu 5 ký tự).").max(500) });

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  const id = uuidParam(ctx, "id");
  await ctx.db(async (tx) => {
    const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('application.review') AS ok")).rows[0].ok;
    if (!ok) throw new ApiError(403, "FORBIDDEN", "Không có quyền duyệt đơn.");
    const r = await tx.query(
      `UPDATE member_applications SET status = 'rejected', reviewed_by = app.current_user_id(), reviewed_at = now(), review_note = $2
        WHERE id = $1 AND status IN ('submitted', 'under_review')`,
      [id, b.note]
    );
    if (!r.rowCount) throw new ApiError(409, "ALREADY_DECIDED", "Đơn đã được xử lý hoặc không tồn tại.");
  });
  return { ok: true };
});
