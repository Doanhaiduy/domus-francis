import { api, uuidParam } from "@/server/http";
import { attachIssuePhoto, listIssues } from "@/server/modules/facilities";
import { IssuePhotoSchema } from "@/server/modules/duty-schema";

/** Gắn ảnh trước/sau sửa chữa (media_attachments, bucket maintenance). Người báo hoặc người có issue.triage. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(IssuePhotoSchema);
  return ctx.db(async (tx) => {
    await attachIssuePhoto(tx, id, b.fileId, b.purpose);
    return (await listIssues(tx, { id })).issues[0];
  });
});
