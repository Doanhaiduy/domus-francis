import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { createAccountForMember } from "@/server/modules/accounts";

const Body = z.object({ email: z.string().trim().email("Email không hợp lệ.").max(200) });

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return createAccountForMember(ctx, uuidParam(ctx, "id"), b.email);
});
