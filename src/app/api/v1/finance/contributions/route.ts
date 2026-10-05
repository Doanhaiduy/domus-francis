import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getContributionMatrix } from "@/server/modules/finance-contributions";

/** Ma trận đóng quỹ 12 tháng: ?to=YYYY-MM (tháng cuối, mặc định tháng hiện tại)&months=12 */
export const GET = api({}, (ctx) => {
  const to = ctx.query.get("to") ?? undefined;
  if (to && !/^\d{4}-(0[1-9]|1[0-2])$/.test(to)) throw badRequest("Tháng phải có dạng YYYY-MM.");
  const months = Number(ctx.query.get("months") ?? 12);
  if (!Number.isInteger(months) || months < 1 || months > 24) throw badRequest("Số tháng phải từ 1 đến 24.");
  return ctx.db((tx) => getContributionMatrix(tx, to, months));
});
