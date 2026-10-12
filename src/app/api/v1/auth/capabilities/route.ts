import { api } from "@/server/http";
import { emailConfigured } from "@/server/email";
import { registrationOpen } from "@/server/auth/session";

/** Tính năng xác thực đang bật (trang đăng nhập dùng để ẩn/hiện "Quên mật khẩu", "Đăng ký tài khoản"). */
export const GET = api({ auth: "public" }, async (ctx) => ({
  passwordReset: emailConfigured(),
  registrationOpen: await ctx.dbAs("luuxa_auth", registrationOpen),
}));
