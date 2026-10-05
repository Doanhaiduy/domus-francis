import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getOverview } from "@/server/modules/finance";
import { RangeQuery } from "@/server/modules/finance-schema";

/** Tổng quan một kỳ: ?from=YYYY-MM-DD&to=YYYY-MM-DD (mặc định tháng hiện tại) hoặc ?all=1. */
export const GET = api({}, (ctx) => {
  const parsed = RangeQuery.safeParse(Object.fromEntries(ctx.query));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  const { from, to, all } = parsed.data;
  return ctx.db((tx) => getOverview(tx, { from, to, all: all === "1" }));
});
