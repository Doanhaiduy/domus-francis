import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { listMemberRoles, setMemberRole, ASSIGNABLE_ROLES } from "@/server/modules/accounts";

export const GET = api({}, (ctx) => listMemberRoles(ctx, uuidParam(ctx, "id")));

const Body = z.object({ role: z.enum(ASSIGNABLE_ROLES), grant: z.boolean() });

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  const id = uuidParam(ctx, "id");
  await setMemberRole(ctx, id, b.role, b.grant);
  return listMemberRoles(ctx, id);
});
