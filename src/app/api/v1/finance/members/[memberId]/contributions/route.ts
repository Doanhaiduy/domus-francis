import { api, uuidParam } from "@/server/http";
import { getMemberContributions } from "@/server/modules/finance";

/** Lịch sử đóng quỹ của một thành viên, mới nhất trước: ?months=N. Chính chủ hoặc finance.contribution.read_all (khác ⇒ 403). */
export const GET = api({}, (ctx) =>
  ctx.db((tx) => getMemberContributions(tx, uuidParam(ctx, "memberId"), Number(ctx.query.get("months") ?? 3)))
);
