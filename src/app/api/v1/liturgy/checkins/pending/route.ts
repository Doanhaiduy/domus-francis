import { api } from "@/server/http";
import { listPendingCheckins } from "@/server/modules/liturgy-calendar";

/** Hàng đợi check-in đi lễ CHỜ DUYỆT của mọi ngày (mới → cũ, tối đa 60 ngày lễ / 300 bản) kèm cảnh báo ảnh trùng / sai ngày / thiếu ảnh.
 *  Quyền: liturgy.calendar.manage (Trưởng nhà, Ban Phụng vụ, Admin). */
export const GET = api({}, (ctx) => ctx.db((tx) => listPendingCheckins(tx)));
