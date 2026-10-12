import { api } from "@/server/http";
import { getLeaveTonight } from "@/server/modules/leave";

/** Tối nay ai vắng / về muộn (đơn đã duyệt) — người quản lý duyệt đơn + người được nhờ giữ cửa tối nay; chỉ tên/loại/giờ. */
export const GET = api({}, (ctx) => ctx.db((tx) => getLeaveTonight(tx)));
