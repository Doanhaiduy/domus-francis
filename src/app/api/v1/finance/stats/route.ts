import { z } from "zod";
import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getFinanceStats } from "@/server/modules/finance-ops";

const Query = z.object({
  granularity: z.enum(["month", "quarter", "year"]).default("month"),
  count: z.coerce.number().int().min(1).max(24).optional(),
});

/** Thống kê thu chi theo tháng / quý / năm (?granularity=month|quarter|year&count=N kỳ gần nhất). */
export const GET = api({}, async (ctx) => {
  const q = Query.safeParse(Object.fromEntries(ctx.query));
  if (!q.success) throw badRequest(q.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  return ctx.db((tx) => getFinanceStats(tx, q.data.granularity, q.data.count ?? null));
});
