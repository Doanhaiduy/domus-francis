import { api, uuidParam } from "@/server/http";
import { ErrorStatusBody, setErrorStatus } from "@/server/modules/system-status";

export const runtime = "nodejs";

/** Đổi trạng thái một lỗi: new (mở lại) / ack (đã xem) / resolved (đã sửa — tái diễn sẽ tự mở lại). CHỈ Admin (system.monitor). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ErrorStatusBody);
  const [item] = await ctx.db((tx) => setErrorStatus(tx, [id], b.status));
  return item;
});
