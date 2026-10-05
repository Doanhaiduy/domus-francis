import { api } from "@/server/http";
import { createIssue, listIssues } from "@/server/modules/facilities";
import { IssueCreateSchema } from "@/server/modules/duty-schema";
import { notifyRoles } from "@/server/modules/duty";
import { postToZaloGroup } from "@/server/integrations/zalo";
import { URGENCY_LABEL } from "@/lib/duty-format";

/** Danh sách sự cố (issue.read) + danh mục + khu vực chung để chọn vị trí. */
export const GET = api({}, (ctx) => ctx.db((tx) => listIssues(tx)));

/** Báo hỏng (issue.create): ảnh hiện trạng gắn bằng media_attachments (before_photo, bucket maintenance). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(IssueCreateSchema);
  const r = await ctx.db((tx) => createIssue(tx, b));
  await notifyRoles(ctx, ["house_head"], "facility.issue_new", `Báo hỏng mới ${r.code}`, b.title, { table: "maintenance_issues", id: r.id });
  await postToZaloGroup(
    ctx,
    "facility_new",
    `🔧 BÁO HỎNG MỚI ${r.code}\n• ${b.title}\n• Mức độ: ${URGENCY_LABEL[b.urgency] ?? b.urgency}${b.locationText ? `\n• Vị trí: ${b.locationText}` : b.roomCode ? `\n• Phòng: ${b.roomCode}` : ""}\nAnh em Ban Hậu cần chú ý xử lý nhé.`,
  );
  return Response.json(r, { status: 201 });
});
