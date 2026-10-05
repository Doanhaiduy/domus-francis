import { api } from "@/server/http";
import { kdb } from "@/server/modules/kitchen";
import { getPantry } from "@/server/modules/kitchen-pantry";

/** Kho bếp + yêu cầu mua thêm + danh sách cần mua (mọi thành viên đọc được). */
export const GET = api({}, (ctx) => kdb(ctx, getPantry));
