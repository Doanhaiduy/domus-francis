import { z } from "zod";
import { api } from "@/server/http";
import { hashKey, normalizeRoute, rateLimit, recordErrorEvent } from "@/server/ops";

export const runtime = "nodejs";

const Body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
  stack: z.string().max(2000).optional(),
  /** boundary (error.tsx) | global (global-error.tsx) | window (window.onerror) | promise (unhandledrejection) */
  kind: z.enum(["boundary", "global", "window", "promise"]).optional(),
});

/**
 * Lỗi phía trình duyệt báo về: ghi log (Vercel) + nhật ký lỗi đã gộp (error_events — Admin xem ở Quản trị → Hệ thống).
 * Giới hạn trong CSDL theo IP (20 lần / 10 phút) và toàn hệ thống (300 / giờ) — đúng cả khi chạy nhiều instance serverless.
 */
export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  const b = await ctx.body(Body);
  const okIp = await rateLimit(null, `client-error:${hashKey("ip", ctx.ip ?? "?")}`, 600, 20);
  const okAll = okIp && (await rateLimit(null, "client-error:all", 3600, 300));
  if (!okAll) return { ok: true, dropped: true };
  console.error("[client-error]", JSON.stringify({ ...b, ua: ctx.req.headers.get("user-agent")?.slice(0, 120), requestId: ctx.requestId }));
  // Bỏ lỗi do tiện ích mở rộng trình duyệt / đoạn mã ngoài (không phải lỗi của ứng dụng)
  if (/chrome-extension:|moz-extension:|safari-extension:|ResizeObserver loop/i.test(`${b.message} ${b.stack ?? ""}`)) return { ok: true };
  const top = b.stack?.split(/\r?\n/).find((l) => /\/_next\/|webpack|\.tsx?|\.js/.test(l))?.trim().slice(0, 160);
  await recordErrorEvent({
    source: "client",
    route: b.path ? normalizeRoute(b.path.split("?")[0]) : null,
    code: b.kind ?? (b.digest ? "BOUNDARY" : null),
    message: `${b.message}${top ? ` @ ${top}` : ""}`,
    requestId: b.digest ?? ctx.requestId,
    userId: ctx.userId,
  });
  return { ok: true };
});
