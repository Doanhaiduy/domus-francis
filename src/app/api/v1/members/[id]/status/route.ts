import { z } from "zod";
import { api, uuidParam, zDate } from "@/server/http";
import { changeMemberStatus } from "@/server/modules/members";

const Body = z.object({
  status: z.enum(["active", "on_leave", "alumni", "left"]),
  leftOn: zDate.nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  await ctx.db((tx) => changeMemberStatus(tx, uuidParam(ctx, "id"), b.status, b.leftOn ?? null, b.reason ?? null));
  return { ok: true };
});
