import { api } from "@/server/http";
import { getStatus } from "@/server/modules/ai";

/** AIX-GATE-01: trạng thái cổng AI (công tắc, nhà cung cấp đã cấu hình — không lộ khóa, đồng ý, tác vụ dùng được). */
export const GET = api({}, (ctx) => ctx.db(getStatus));
