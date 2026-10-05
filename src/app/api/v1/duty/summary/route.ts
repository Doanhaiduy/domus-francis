import { api } from "@/server/http";
import { getDutySummary, runDutyJobs } from "@/server/modules/duty";

/** Tóm tắt cho Tổng quan/Sidebar: ca hôm nay/ngày mai, ca kế tiếp của tôi, số sự cố đang mở, số ca chờ nghiệm thu. */
export const GET = api({}, async (ctx) => {
  await runDutyJobs(ctx);
  return ctx.db((tx) => getDutySummary(tx));
});
