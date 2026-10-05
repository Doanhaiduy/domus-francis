import { api } from "@/server/http";
import { announcementMeta } from "@/server/modules/announcements";

/** Dữ liệu cho form đăng thông báo: chuyên mục, tầng/phòng/vai trò (đối tượng nhận), sự kiện sắp tới (liên kết RSVP). */
export const GET = api({}, (ctx) => ctx.db((tx) => announcementMeta(tx)));
