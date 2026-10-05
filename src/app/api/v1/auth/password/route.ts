import { z } from "zod";
import { api } from "@/server/http";
import { changePassword } from "@/server/auth/session";

const Body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(128) });

export const POST = api({ auth: "user" }, async (ctx) => {
  const b = await ctx.body(Body);
  await changePassword(ctx.userId!, ctx.session!.sid, b.currentPassword, b.newPassword, { ip: ctx.ip, userAgent: null, requestId: ctx.requestId });
  return { ok: true };
});
