import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { assignRoom } from "@/server/modules/house";

const Body = z.object({
  note: z.string().trim().max(500).nullable().optional(),
  roomCode: z.string().trim().max(14).nullable().optional(),
});

/** Duyệt đơn: app.fn_approve_member_application tạo hồ sơ + kích hoạt tài khoản + gán vai trò member (kiểm quyền application.review trong hàm). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    const memberId = (await tx.query<{ m: string }>("SELECT app.fn_approve_member_application($1, $2) AS m", [id, b.note ?? null])).rows[0].m;
    if (b.roomCode) await assignRoom(tx, memberId, b.roomCode, "Thành viên mới");
    return { memberId };
  });
});
