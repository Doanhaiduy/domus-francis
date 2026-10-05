import { z } from "zod";
import { api } from "@/server/http";
import { forbidden } from "@/server/errors";
import { runDailyJobs } from "@/server/cron/daily";

export const maxDuration = 60;

const Schema = z.object({ slot: z.enum(["morning", "evening"]).default("morning"), dry: z.boolean().default(true) });

/** Admin/Trưởng nhà chạy thử tác vụ hằng ngày: dry=true chỉ liệt kê tin sẽ gửi; dry=false chạy thật (vẫn chống gửi trùng theo ngày). */
export const POST = api({}, async (ctx) => {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_permission('setting.write') AS ok")).rows[0]?.ok);
  if (!ok) throw forbidden("Chỉ Admin / Trưởng nhà mới chạy thử được tác vụ hằng ngày.");
  const b = await ctx.body(Schema);
  return runDailyJobs(b.slot, { dry: b.dry });
});
