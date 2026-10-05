import { api, uuidParam } from "@/server/http";
import { notFound } from "@/server/errors";
import { listIssues, updateIssue } from "@/server/modules/facilities";
import { IssueUpdateSchema } from "@/server/modules/duty-schema";
import { notifyMembers } from "@/server/modules/duty";
import { ISSUE_STATUS_LABEL } from "@/lib/duty-format";

export const GET = api({}, async (ctx) => {
  const r = await ctx.db((tx) => listIssues(tx, { id: uuidParam(ctx, "id") }));
  if (!r.issues[0]) throw notFound("Không tìm thấy sự cố.");
  return r.issues[0];
});

/**
 * Cập nhật sự cố: trạng thái (tiếp nhận/chờ vật tư/xong/mở lại — issue.triage|issue.resolve; người báo chỉ được hủy phiếu của mình),
 * mức khẩn/danh mục (issue.triage), nội dung (người báo). Nhật ký trạng thái do trigger ghi (kèm lý do).
 */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(IssueUpdateSchema);
  const out = await ctx.db(async (tx) => {
    const u = await updateIssue(tx, id, b);
    return { u, issue: (await listIssues(tx, { id })).issues[0] };
  });
  if (b.status) {
    await notifyMembers(ctx, [out.u.reporterId], "facility.issue_updated", `${out.u.code}: ${ISSUE_STATUS_LABEL[out.u.status]}`, out.u.title, {
      table: "maintenance_issues",
      id,
    });
  }
  return out.issue;
});
