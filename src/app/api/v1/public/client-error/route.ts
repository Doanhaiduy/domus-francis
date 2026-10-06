import { z } from "zod";
import { api } from "@/server/http";

export const runtime = "nodejs";

const Body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
  stack: z.string().max(2000).optional(),
});

// Lỗi phía trình duyệt (error boundary) báo về để có trong log Vercel. Không lưu DB; cắt ngắn; giới hạn tốc độ mỗi instance.
let windowStart = 0;
let count = 0;

export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  if (++count > 30) return { ok: true };
  const b = await ctx.body(Body);
  console.error("[client-error]", JSON.stringify({ ...b, ua: ctx.req.headers.get("user-agent")?.slice(0, 120), requestId: ctx.requestId }));
  return { ok: true };
});
