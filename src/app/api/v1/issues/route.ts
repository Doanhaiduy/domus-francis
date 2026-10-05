import { api } from "@/server/http";
import { createIssue, listIssues } from "@/server/modules/facilities";
import { IssueCreateSchema } from "@/server/modules/duty-schema";
import { notifyRoles } from "@/server/modules/duty";

/** Danh sách sự cố (issue.read) + danh mục + khu vực chung để chọn vị trí. */
export const GET = api({}, (ctx) => ctx.db((tx) => listIssues(tx)));

/** Báo hỏng (issue.create): ảnh hiện trạng gắn bằng media_attachments (before_photo, bucket maintenance). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(IssueCreateSchema);
  const r = await ctx.db((tx) => createIssue(tx, b));
  await notifyRoles(ctx, ["house_head", "vice_head"], "facility.issue_new", `Báo hỏng mới ${r.code}`, b.title, { table: "maintenance_issues", id: r.id });
  return Response.json(r, { status: 201 });
});
