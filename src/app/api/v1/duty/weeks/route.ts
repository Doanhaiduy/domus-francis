import { api } from "@/server/http";
import { getDutyBoard, saveDutyWeek, dutyWeekEntryById } from "@/server/modules/duty-weeks";
import { buildWeekText } from "@/lib/duty-format";
import { SaveWeekSchema } from "@/server/modules/duty-weeks-schema";
import { postToZaloGroup } from "@/server/integrations/zalo";

/** Bảng trực vệ sinh sân nhà theo tuần (?week=YYYY-MM-DD, mặc định tuần này). */
export const GET = api({}, (ctx) => ctx.db((tx) => getDutyBoard(tx, ctx.query.get("week"))));

/** Trưởng nhà/Admin xếp người trực một tuần (tạo mới hoặc sửa). Người được xếp nhận thông báo; tùy chọn gửi nhóm Zalo. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SaveWeekSchema);
  const { entry, house } = await ctx.db(async (tx) => {
    const id = await saveDutyWeek(tx, b.weekStart, b.memberIds, b.note ?? null);
    const house = (await tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'")).rows[0]?.v ?? null;
    return { entry: await dutyWeekEntryById(tx, id), house };
  });
  const zalo = b.notifyZalo === false ? null : await postToZaloGroup(ctx, "duty_week", buildWeekText(entry, house));
  return { entry, zalo };
});
