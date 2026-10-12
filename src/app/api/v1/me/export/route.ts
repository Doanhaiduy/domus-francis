import { api } from "@/server/http";
import { exportMyData } from "@/server/modules/data-export";

/**
 * "Tải dữ liệu của tôi": tệp JSON gồm dữ liệu cá nhân của CHÍNH người đang đăng nhập (đọc dưới RLS của người đó).
 * Có ghi nhật ký kiểm toán EXPORT ⇒ transaction ghi (writes: true). Tối đa 10 lần/giờ/người.
 */
export const GET = api({ writes: true }, async (ctx) => {
  const r = await ctx.db((tx) => exportMyData(tx, ctx.userId!));
  return new Response(r.json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${r.fileName}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
