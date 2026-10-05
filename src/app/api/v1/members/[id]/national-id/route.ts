import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { revealNationalId } from "@/server/modules/members";

const Body = z.object({ reason: z.string().trim().min(5, "Nêu lý do xem CCCD (tối thiểu 5 ký tự).").max(300) });

/** Xem CCCD đầy đủ — có kiểm quyền và ghi nhật ký kiểm toán READ_SENSITIVE (vá C-016 / BR-MEM-21). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  const nationalId = await ctx.db((tx) => revealNationalId(tx, uuidParam(ctx, "id"), b.reason));
  return { nationalId };
});
