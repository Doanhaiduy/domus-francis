import { api, uuidParam } from "@/server/http";
import { assignIssue, listIssues, notifyIssue } from "@/server/modules/facilities";
import { IssueAssignSchema } from "@/server/modules/duty-schema";
import { URGENCY_LABEL } from "@/lib/duty-format";

/** Phân công người phụ trách chính (issue_assignments). Quyền: issue.triage (RLS). Giao cho người MỚI ⇒ báo người được giao (mở thẳng sự cố). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(IssueAssignSchema);
  const { changed, issue } = await ctx.db(async (tx) => {
    const r = await assignIssue(tx, id, b.memberId, b.note ?? null);
    return { changed: r.changed, issue: (await listIssues(tx, { id })).issues[0] };
  });
  if (changed && issue) {
    const lines = [
      issue.title,
      `Vị trí: ${issue.location}`,
      `Mức độ: ${URGENCY_LABEL[issue.urgency] ?? issue.urgency}${issue.slaDueAt ? ` · hạn xử lý ${new Date(issue.slaDueAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}`,
      b.note?.trim() ? `Ghi chú: ${b.note.trim()}` : null,
    ].filter(Boolean);
    await notifyIssue(ctx, { members: [b.memberId] }, "facility.issue_assigned", `Bạn được giao xử lý sự cố ${issue.code}`, lines.join("\n"), id);
  }
  return issue;
});
