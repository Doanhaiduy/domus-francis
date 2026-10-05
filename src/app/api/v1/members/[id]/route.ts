import { api, uuidParam } from "@/server/http";
import { getMemberDetail, saveMemberProfile } from "@/server/modules/members";
import { MemberProfileSchema } from "@/server/modules/members-schema";

export const GET = api({}, (ctx) => ctx.db((tx) => getMemberDetail(tx, uuidParam(ctx, "id"))));

export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(MemberProfileSchema);
  return ctx.db(async (tx) => {
    await saveMemberProfile(tx, id, b);
    return getMemberDetail(tx, id);
  });
});
