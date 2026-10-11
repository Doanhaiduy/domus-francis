import { api } from "@/server/http";
import { getOverview } from "@/server/modules/storage-monitor";

export const runtime = "nodejs";

/** Theo dõi dung lượng — số liệu CSDL + tệp (chỉ Admin, quyền system.monitor; kiểm trong hàm CSDL). ?days=7..365 (mặc định 30) cho biểu đồ theo ngày. */
export const GET = api({}, async (ctx) => {
  const n = Number(ctx.query.get("days"));
  const days = Number.isFinite(n) && n > 0 ? Math.min(365, Math.max(7, Math.round(n))) : 30;
  return ctx.db((tx) => getOverview(tx, days));
});
