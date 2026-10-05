import { z } from "zod";
import { api } from "@/server/http";
import { assignRoom } from "@/server/modules/house";

const Body = z.object({
  memberId: z.string().uuid(),
  roomCode: z.string().trim().min(3).max(14),
  reason: z.string().trim().max(300).nullable().optional(),
});

/** Xếp / chuyển phòng (house.assign; sức chứa, giới tính, loại phòng do trigger DB kiểm). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  await ctx.db((tx) => assignRoom(tx, b.memberId, b.roomCode, b.reason ?? null));
  return { ok: true };
});
