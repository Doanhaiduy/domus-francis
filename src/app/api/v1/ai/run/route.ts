import { z } from "zod";
import { api } from "@/server/http";
import { runAiTask } from "@/server/ai/gateway";
import { AI_TASK_CODES } from "@/lib/types/ai";

const RunSchema = z.object({ task: z.enum(AI_TASK_CODES), input: z.unknown() });

/** AIX-JOB-01: chạy một tác vụ AI đồng bộ (cổng DB chặn nếu tắt/chưa đồng ý/hết ngân sách → 409; lỗi nhà cung cấp → 503). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RunSchema);
  return runAiTask(ctx, b.task, b.input);
});
