import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { assertSameOrigin, reportPublicDonation, verifyTurnstile } from "@/server/modules/public-site";
import { PublicDonationSchema } from "@/server/modules/public-site-schema";

export const runtime = "nodejs";

/**
 * Người ngoài báo "tôi đã ủng hộ" từ trang /ung-ho (không cần tài khoản) ⇒ khoản ủng hộ CHỜ Thủ quỹ đối chiếu sao kê và xác nhận
 * (chưa vào sổ quỹ) + thông báo Thủ quỹ/Trưởng nhà. Chống spam như /lien-he: ô bẫy, thời gian điền, giới hạn 3 lần/giờ/IP (băm) trong
 * CSDL, CAPTCHA Turnstile khi có khóa. Trả về `{ ok: true }` (không lộ mã khoản).
 */
export const POST = api({ auth: "public", csrf: false }, async (ctx) => {
  assertSameOrigin(ctx.req.headers);
  const b = await ctx.body(PublicDonationSchema);
  // Người máy: giả vờ thành công (không nói lý do để khó né)
  const tooFast = b.startedAt !== undefined && Date.now() - b.startedAt < 2500;
  if (b.website || tooFast) return { ok: true };
  if (!(await verifyTurnstile(b.turnstileToken, ctx.ip))) throw new ApiError(400, "CAPTCHA_FAILED", "Không xác minh được bạn là người thật. Hãy tải lại trang và thử lại.");
  await ctx.db((tx) =>
    reportPublicDonation(
      tx,
      { donorName: b.anonymous ? null : b.donorName, amountVnd: b.amountVnd, donatedOn: b.donatedOn, message: b.message, contact: b.contact },
      ctx.ip,
    ),
  );
  return { ok: true };
});
