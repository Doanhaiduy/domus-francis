import { api } from "@/server/http";
import { getPublicSettings } from "@/server/modules/settings";

/** Cấu hình công khai (is_public) cho mọi thành viên đã đăng nhập: tên nhà, khẩu hiệu, địa chỉ, bổn mạng, mức quỹ… */
export const GET = api({}, (ctx) => ctx.db(getPublicSettings));
