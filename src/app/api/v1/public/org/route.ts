import { api } from "@/server/http";
import { publicOrgInfo } from "@/server/modules/articles";

export const runtime = "nodejs";

/** Thông tin giới thiệu cộng đoàn (tên, khẩu hiệu, địa chỉ, hotline) — KHÔNG cần đăng nhập; dùng cho chân trang. */
export const GET = api({ auth: "public" }, async (ctx) => {
  const org = await ctx.db((tx) => publicOrgInfo(tx));
  return new Response(JSON.stringify(org), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300, stale-while-revalidate=3600" } });
});
