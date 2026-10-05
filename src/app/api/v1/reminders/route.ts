import { api } from "@/server/http";
import { createReminder, listReminders, ReminderSchema } from "@/server/modules/reminders";

/** Lịch nhắc lặp hằng tuần (event.manage). */
export const GET = api({}, (ctx) => ctx.db((tx) => listReminders(tx)));

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ReminderSchema);
  return Response.json(await ctx.db((tx) => createReminder(tx, b)), { status: 201 });
});
