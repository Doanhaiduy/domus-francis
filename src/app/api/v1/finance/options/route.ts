import { api } from "@/server/http";
import { getOptions } from "@/server/modules/finance";

/** Túi quỹ, danh mục chi, ngưỡng duyệt/hóa đơn, cấu hình quỹ định kỳ + điện nước, kỳ quỹ hiện tại/kế tiếp — cho form lập phiếu chi / ghi thu / lập kế hoạch. */
export const GET = api({}, (ctx) => ctx.db((tx) => getOptions(tx)));
