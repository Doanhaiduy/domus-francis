import { api } from "@/server/http";
import { ApiError, notFound } from "@/server/errors";
import { appOrigin } from "@/server/auth/reset";
import { hashKey, rateLimit } from "@/server/ops";
import { buildFeed, isFeedTokenFormat, resolveFeedToken } from "@/server/modules/events-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/calendar/<mã>.ics — lịch cá nhân đăng ký theo đường dẫn bí mật (Google Calendar / Lịch iPhone tự tải lại định kỳ).
 * Không cần đăng nhập: mã 256 bit được băm SHA-256 rồi tra (chỉ mã còn hiệu lực của thành viên đang ở, tài khoản đang hoạt động); mã sai /
 * đã thu hồi ⇒ 404. Giới hạn tần suất theo IP (120 lượt/giờ) và theo mã (60 lượt/giờ). Nội dung đọc dưới RLS của chính chủ đường dẫn.
 */
export const GET = api({ auth: "public", csrf: false }, async (ctx) => {
  const raw = ctx.params.token ?? "";
  const token = raw.replace(/\.ics$/i, "");
  if (!isFeedTokenFormat(token)) throw notFound("Không tìm thấy lịch.");
  if (!(await rateLimit(null, `calfeed:ip:${hashKey(ctx.ip)}`, 3600, 120)) || !(await rateLimit(null, `calfeed:tok:${hashKey(token)}`, 3600, 60))) {
    throw new ApiError(429, "RATE_LIMITED", "Lịch được tải quá nhiều lần — thử lại sau.");
  }
  const owner = await resolveFeedToken(token, ctx.requestId);
  if (!owner) throw notFound("Không tìm thấy lịch (đường dẫn sai hoặc đã bị thu hồi).");
  const body = await buildFeed(owner, { requestId: ctx.requestId, ip: ctx.ip, origin: appOrigin(ctx.req) });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="luu-xa.ics"',
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex, nofollow",
    },
  });
});
