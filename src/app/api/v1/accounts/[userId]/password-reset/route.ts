import { api, uuidParam } from "@/server/http";
import { resetUserPassword } from "@/server/modules/accounts";

/** Đặt lại mật khẩu: mật khẩu tạm (hiện MỘT lần) + bắt đổi ở lần đăng nhập sau + đăng xuất mọi thiết bị. */
export const POST = api({}, (ctx) => resetUserPassword(ctx, { userId: uuidParam(ctx, "userId") }));
