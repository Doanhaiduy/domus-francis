import { api } from "@/server/http";
import { startEnroll } from "@/server/auth/mfa";

/** Bắt đầu bật xác thực 2 bước: trả mã QR (data URL) + khóa nhập tay. Chưa có hiệu lực cho tới khi /confirm đúng. */
export const POST = api({ auth: "user" }, async (ctx) => {
  const email = ctx.session ? ((await ctx.dbAs("luuxa_auth", (tx) => tx.query<{ email: string | null }>("SELECT email::text FROM users WHERE id = $1", [ctx.userId])).then((r) => r.rows[0]?.email)) ?? "tai-khoan") : "tai-khoan";
  return startEnroll(ctx.userId!, email, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent"), requestId: ctx.requestId });
});
