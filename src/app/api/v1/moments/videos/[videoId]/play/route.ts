import { api, uuidParam } from "@/server/http";
import { getVideoForPlay } from "@/server/modules/moments";
import { serveLocalVideo, supabaseSignedPlayUrl } from "@/server/video";

export const runtime = "nodejs";

/**
 * Phát video (chỉ người xem được album — RLS). Supabase: chuyển hướng tới URL ký có hạn 1 giờ (trình duyệt tua / tải từng đoạn trực tiếp,
 * không qua hàm máy chủ). Local: phát từ đĩa có hỗ trợ Range. Cloudinary phát thẳng từ CDN nên không dùng đường này.
 */
export const GET = api({}, async (ctx) => {
  const v = await ctx.db((tx) => getVideoForPlay(tx, uuidParam(ctx, "videoId")));
  if (v.provider === "supabase") {
    const url = await supabaseSignedPlayUrl(v.object_key, 3600);
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=1800" } });
  }
  if (v.provider === "local") return serveLocalVideo(v.object_key, v.mime, ctx.req.headers.get("range"));
  return new Response(null, { status: 404 });
});
