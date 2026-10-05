import { api } from "@/server/http";
import { getDay } from "@/server/modules/liturgy-calendar";

/** Chi tiết một ngày: toàn văn Lời Chúa, ý lễ của nhà, ghi chú phụng vụ, check-in của tôi; người quản lý xem thêm danh sách check-in. */
export const GET = api({}, (ctx) => ctx.db((tx) => getDay(tx, ctx.params.date ?? "")));
