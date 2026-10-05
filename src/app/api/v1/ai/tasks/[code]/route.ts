import { z } from "zod";
import { api } from "@/server/http";
import { updateTask } from "@/server/modules/ai";

const Patch = z.object({
  enabled: z.boolean().optional(),
  monthlyBudgetVnd: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

/** AIX-TASK-02: bật/tắt tác vụ, đặt trần ngân sách riêng (cần ai.manage). */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(Patch);
  return ctx.db((tx) => updateTask(tx, ctx.params.code, b));
});
