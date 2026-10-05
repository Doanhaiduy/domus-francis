import { z } from "zod";
import { api } from "@/server/http";
import { updateBudget } from "@/server/modules/ai";

const Patch = z.object({
  limitVnd: z.number().int().min(0).max(1_000_000_000).optional(),
  alertThresholdPct: z.number().int().min(1).max(100).optional(),
  hardStop: z.boolean().optional(),
});

/** AIX-BUD-02: đổi hạn mức/ngưỡng cảnh báo/dừng cứng của tháng hiện tại (cần ai.manage). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(Patch);
  return ctx.db((tx) => updateBudget(tx, b));
});
