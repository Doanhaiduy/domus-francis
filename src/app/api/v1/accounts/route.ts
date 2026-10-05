import { z } from "zod";
import { api, zUuid } from "@/server/http";
import { createAccountForMember, listAccounts } from "@/server/modules/accounts";

/** Danh sách thành viên + tài khoản đăng nhập (auth.user.read — Trưởng nhà/Admin): trạng thái, email, vai trò, lần đăng nhập cuối. */
export const GET = api({}, (ctx) => listAccounts(ctx));

const Body = z.object({ memberId: zUuid, email: z.string().trim().email("Email không hợp lệ.").max(200) });

/** Cấp tài khoản cho thành viên chưa có (auth.user.manage) ⇒ trả mật khẩu tạm hiển thị MỘT lần. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return Response.json(await createAccountForMember(ctx, b.memberId, b.email), { status: 201 });
});
