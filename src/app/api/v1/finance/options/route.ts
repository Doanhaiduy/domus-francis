import { api } from "@/server/http";
import { getOptions } from "@/server/modules/finance";

/** Túi quỹ, danh mục chi, ngưỡng duyệt/hóa đơn, mức quỹ — cho form lập phiếu chi / ghi thu. */
export const GET = api({}, (ctx) => ctx.db((tx) => getOptions(tx)));
