import { api } from "@/server/http";
import { listApplications } from "@/server/modules/members";
import { ApiError } from "@/server/errors";

export const GET = api({}, (ctx) =>
  ctx.db(async (tx) => {
    const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('application.review') AS ok")).rows[0].ok;
    if (!ok) throw new ApiError(403, "FORBIDDEN", "Chỉ Ban điều hành được xem đơn đăng ký.");
    return listApplications(tx, ctx.query.get("all") === "1");
  })
);
