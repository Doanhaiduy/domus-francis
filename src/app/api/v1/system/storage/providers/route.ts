import { api } from "@/server/http";
import { assertMonitor, getProviders } from "@/server/modules/storage-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Số đo từ nhà cung cấp: Supabase Storage (đếm qua Storage API) + Cloudinary (Admin API /usage). Chỉ Admin. ?refresh=1 bỏ bộ nhớ đệm (≥ 15 giây một lần). */
export const GET = api({}, async (ctx) => {
  await ctx.db(assertMonitor);
  return getProviders({ refresh: ctx.query.get("refresh") === "1" });
});
