import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getContributionMatrix } from "@/server/modules/finance-contributions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ma trận đóng quỹ thành viên × kế hoạch thu:
 *   ?to=YYYY-MM (tháng cuối, mặc định tháng hiện tại)&months=12 — các kế hoạch có thời gian giao với khoảng này
 *   ?plan=<id>   — chỉ một kế hoạch (danh sách thu của kế hoạch đó)
 *   &member=<id> — chỉ một thành viên (hộp thoại ghi thu)
 */
export const GET = api({}, (ctx) => {
  const to = ctx.query.get("to") ?? undefined;
  if (to && !/^\d{4}-(0[1-9]|1[0-2])$/.test(to)) throw badRequest("Tháng phải có dạng YYYY-MM.");
  const months = Number(ctx.query.get("months") ?? 12);
  if (!Number.isInteger(months) || months < 1 || months > 24) throw badRequest("Số tháng phải từ 1 đến 24.");
  const planId = ctx.query.get("plan") ?? undefined;
  const memberId = ctx.query.get("member") ?? undefined;
  if ((planId && !UUID.test(planId)) || (memberId && !UUID.test(memberId))) throw badRequest("Mã định danh không hợp lệ.");
  return ctx.db((tx) => getContributionMatrix(tx, { toMonth: to, monthsCount: months, planId, memberId }));
});
