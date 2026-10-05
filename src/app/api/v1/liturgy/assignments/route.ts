import { api } from "@/server/http";
import { addAssignment } from "@/server/modules/liturgy";
import { AssignmentSchema } from "@/server/modules/community-schema";

/** Phân công phục vụ (liturgy.manage) + thông báo cho người được phân công. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(AssignmentSchema);
  const id = await ctx.db((tx) => addAssignment(tx, b));
  return Response.json({ id }, { status: 201 });
});
