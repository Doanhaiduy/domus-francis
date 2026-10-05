import { api, uuidParam } from "@/server/http";
import { assignIssue, listIssues } from "@/server/modules/facilities";
import { IssueAssignSchema } from "@/server/modules/duty-schema";

/** Phân công người phụ trách chính (issue_assignments). Quyền: issue.triage (RLS). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(IssueAssignSchema);
  return ctx.db(async (tx) => {
    await assignIssue(tx, id, b.memberId, b.note ?? null);
    return (await listIssues(tx, { id })).issues[0];
  });
});
