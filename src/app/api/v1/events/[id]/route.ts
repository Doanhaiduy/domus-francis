import { api, uuidParam } from "@/server/http";
import { deleteEvent, getEvent, updateEvent } from "@/server/modules/events";
import { EventPatchSchema } from "@/server/modules/events-schema";

/** GET /api/v1/events/:id */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db((tx) => getEvent(tx, id));
});

/** PATCH /api/v1/events/:id — sửa sự kiện. Quyền: event.manage hoặc ban tổ chức (RLS); đổi ban tổ chức cần event.manage. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(EventPatchSchema);
  return ctx.db(async (tx) => {
    await updateEvent(tx, id, b);
    return getEvent(tx, id);
  });
});

/** DELETE /api/v1/events/:id — xóa mềm. Quyền: event.manage. */
export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    await deleteEvent(tx, id);
    return { ok: true };
  });
});
