import { api, uuidParam } from "@/server/http";
import { deleteDraftRoster } from "@/server/modules/duty";

/** Xóa roster NHÁP chưa phát sinh check-in/đơn đổi ca. Quyền: duty.manage. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteDraftRoster(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
