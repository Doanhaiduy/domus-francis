import { api } from "@/server/http";
import { listPeriods } from "@/server/modules/finance-periods";

/**
 * Sổ quỹ theo tháng (mới → cũ): trạng thái (đang mở / chờ xác nhận / đã chốt), người chốt / xác nhận / mở lại, số liệu từng túi quỹ
 * (ảnh chụp khi chốt hoặc tính trực tiếp khi đang mở), biên bản đối soát, việc còn thiếu trước khi chốt, kiểm chứng chuỗi băm sổ quỹ.
 * Cần quyền xem sổ quỹ hoặc một trong các quyền chốt sổ / xác nhận / mở lại / đối soát.
 */
export const GET = api({}, (ctx) => ctx.db((tx) => listPeriods(tx)));
