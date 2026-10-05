import { api } from "@/server/http";
import { listSuggestions } from "@/server/modules/ai";

/** AIX-SUG-01: hàng chờ gợi ý (?status=pending|accepted|rejected|expired). */
export const GET = api({}, (ctx) => {
  const s = ctx.query.get("status");
  return ctx.db((tx) => listSuggestions(tx, s && ["pending", "accepted", "rejected", "expired"].includes(s) ? s : null));
});
