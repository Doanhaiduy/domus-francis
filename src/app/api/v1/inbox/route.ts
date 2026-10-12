import { api } from "@/server/http";
import { getInbox } from "@/server/modules/inbox";

/**
 * Hộp "Việc cần xử lý" của người quản lý: đếm từng loại việc đang chờ (đơn xin phép, phiếu chi, sự cố…) theo quyền của người xem,
 * dưới RLS, trong MỘT vòng mạng. Thành viên thường: eligible = false, không có mục nào.
 */
export const GET = api({}, (ctx) => ctx.db((tx) => getInbox(tx)));
