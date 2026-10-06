import { api } from "@/server/http";
import { countPendingLeave } from "@/server/modules/leave";

/** Số đơn xin phép chờ duyệt (huy hiệu thanh bên) — 0 nếu không có quyền duyệt. */
export const GET = api({}, async (ctx) => ({ pending: await ctx.db((tx) => countPendingLeave(tx)) }));
