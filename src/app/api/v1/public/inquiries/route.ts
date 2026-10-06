import { z } from "zod";
import { api } from "@/server/http";
import { ApiError, forbidden } from "@/server/errors";
import { submitInquiry } from "@/server/modules/public-site";

export const runtime = "nodejs";

const text = (max: number) => z.string().trim().max(max).optional().nullable();
const Body = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ tên.").max(120),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email("Email không hợp lệ.").max(200).optional().nullable().or(z.literal("")),
  school: text(200),
  yearOfStudy: text(60),
  parish: text(200),
  message: text(1500),
  preferredVisit: text(200),
  // chống spam: ô ẩn (người thật không điền) + thời gian từ lúc mở form (người máy gửi ngay lập tức)
  website: z.string().max(200).optional(),
  startedAt: z.number().int().optional(),
  turnstileToken: z.string().max(4096).optional(),
});

async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // chưa bật CAPTCHA
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** Người ngoài gửi đăng ký tìm hiểu / xin vào ở (không cần tài khoản). Chống spam: ô ẩn, thời gian điền, giới hạn theo IP, CAPTCHA tùy chọn. */
export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  const origin = ctx.req.headers.get("origin");
  if (origin) {
    const host = ctx.req.headers.get("x-forwarded-host") || ctx.req.headers.get("host");
    try {
      if (new URL(origin).host !== host) throw forbidden("Yêu cầu bị chặn (Origin không hợp lệ).");
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw forbidden("Yêu cầu bị chặn (Origin không hợp lệ).");
    }
  }
  const b = await ctx.body(Body);
  // Người máy: giả vờ thành công (không báo lý do để khó né)
  const tooFast = b.startedAt !== undefined && Date.now() - b.startedAt < 2500;
  if (b.website || tooFast) return { ok: true };
  if (!(b.phone?.trim() || b.email?.trim())) throw new ApiError(400, "VALIDATION_FAILED", "Vui lòng để lại số điện thoại hoặc email để chúng tôi liên hệ.");
  if (!(await verifyTurnstile(b.turnstileToken, ctx.ip))) throw new ApiError(400, "CAPTCHA_FAILED", "Không xác minh được bạn là người thật. Hãy tải lại trang và thử lại.");
  await ctx.db((tx) => submitInquiry(tx, { ...b, email: b.email || null }, ctx.ip, ctx.req.headers.get("user-agent")));
  return { ok: true };
});
