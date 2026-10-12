import { NextResponse } from "next/server";
import { z } from "zod";
import { api, zText } from "@/server/http";
import { register, setSessionCookies } from "@/server/auth/session";

const Body = z.object({
  fullName: zText(2, 120, "Họ và tên"),
  email: z.string().trim().email("Email không hợp lệ.").max(200),
  phone: z.string().trim().max(20).regex(/^[+\d\s.-]*$/, "Số điện thoại không hợp lệ.").optional().nullable(),
  password: z.string().max(128),
  universityName: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().max(1000).optional().nullable(),
  /**
   * Tick "Tôi đã đọc và đồng ý Điều khoản sử dụng và Chính sách bảo mật" — BẮT BUỘC true (kiểm trong register() SAU bước kiểm mở đăng ký +
   * giới hạn tần suất ⇒ đăng ký đang đóng vẫn trả 403, quá nhiều lượt vẫn trả 429; thiếu đồng ý trả 400 TERMS_REQUIRED).
   */
  acceptTerms: z.boolean().optional(),
});

export const POST = api({ auth: "public" }, async (ctx) => {
  const b = await ctx.body(Body);
  const r = await register(b, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
  return setSessionCookies(NextResponse.json({ pending: true }, { status: 201 }), { userId: r.userId, sid: r.sid, pending: true, refresh: r.refresh });
});
