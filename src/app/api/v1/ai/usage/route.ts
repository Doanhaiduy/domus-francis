import { api } from "@/server/http";
import { getUsage } from "@/server/modules/ai";

/** AIX-USE-01: chi phí, ngân sách, tỷ lệ chấp nhận, job gần đây (cần ai.manage — RLS). */
export const GET = api({}, (ctx) => ctx.db(getUsage));
