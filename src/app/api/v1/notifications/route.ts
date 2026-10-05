import { api } from "@/server/http";
import { listNotifications } from "@/server/modules/notifications";

/** Hộp thư trong ứng dụng của chính mình + thông báo bảng tin gần đây + số chưa đọc. */
export const GET = api({}, (ctx) => ctx.db((tx) => listNotifications(tx)));
