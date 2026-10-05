import { api, uuidParam } from "@/server/http";
import { deleteReminder, ReminderSchema, updateReminder } from "@/server/modules/reminders";

export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReminderSchema);
  return ctx.db((tx) => updateReminder(tx, id, b));
});

export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteReminder(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
