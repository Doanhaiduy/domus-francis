import { api } from "@/server/http";
import { emailConfigured } from "@/server/email";

/** Tính năng đăng nhập khả dụng (để trang đăng nhập hiện/ẩn "Quên mật khẩu"). */
export const GET = api({ auth: "public" }, async () => ({ passwordReset: emailConfigured() }));
