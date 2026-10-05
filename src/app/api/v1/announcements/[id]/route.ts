import { api, uuidParam } from "@/server/http";
import { deleteAnnouncement, getAnnouncement } from "@/server/modules/announcements";

export const GET = api({}, (ctx) => ctx.db((tx) => getAnnouncement(tx, uuidParam(ctx, "id"))));

/** Xóa (ẩn mềm) — người đăng hoặc announcement.pin (RLS announcements__update). */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteAnnouncement(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
