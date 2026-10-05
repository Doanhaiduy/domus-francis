import { api, uuidParam } from "@/server/http";
import { forbidden } from "@/server/errors";
import { dutyWeekEntryById } from "@/server/modules/duty-weeks";
import { buildWeekText } from "@/lib/duty-format";
import { postToZaloGroup } from "@/server/integrations/zalo";

/** Gửi lịch trực của tuần vào nhóm Zalo (thủ công, người có quyền xếp trực). */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const { entry, house, ok } = await ctx.db(async (tx) => {
    const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('duty.manage') AS ok")).rows[0].ok;
    const house = (await tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'")).rows[0]?.v ?? null;
    return { entry: await dutyWeekEntryById(tx, id), house, ok };
  });
  if (!ok) throw forbidden("Chỉ Trưởng nhà/Admin mới gửi lịch trực vào nhóm Zalo.");
  return postToZaloGroup(ctx, null, buildWeekText(entry, house));
});
