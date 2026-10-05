import { api } from "@/server/http";
import { DayNoteSchema, saveDayNote } from "@/server/modules/liturgy-calendar";

/** Ý lễ + ghi chú của nhà cho một ngày (liturgy.calendar.manage). Gửi cả hai trống ⇒ xóa. */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(DayNoteSchema);
  return ctx.db((tx) => saveDayNote(tx, ctx.params.date ?? "", b));
});
