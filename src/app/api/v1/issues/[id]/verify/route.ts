import { api, uuidParam } from "@/server/http";
import { listIssues, verifyIssue } from "@/server/modules/facilities";

/** Xác nhận đã sửa tốt (app.fn_verify_issue): người báo hoặc người có issue.resolve, chỉ khi sự cố đã xong. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    await verifyIssue(tx, id);
    return (await listIssues(tx, { id })).issues[0];
  });
});
