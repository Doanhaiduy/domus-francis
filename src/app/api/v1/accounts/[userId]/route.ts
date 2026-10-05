import { z } from "zod";
import { api, uuidParam } from "@/server/http";
import { setAccountStatus } from "@/server/modules/accounts";

const Body = z.object({ action: z.enum(["lock", "unlock", "disable", "enable"], { message: "Thao tác không hợp lệ." }) });

/** Khóa / mở khóa / vô hiệu / kích hoạt lại tài khoản (auth.user.manage; tài khoản đặc quyền cần auth.role.assign; không cho chính mình). */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return setAccountStatus(ctx, uuidParam(ctx, "userId"), b.action);
});
