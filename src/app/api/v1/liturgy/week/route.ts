import { api } from "@/server/http";
import { getWeek } from "@/server/modules/liturgy";

/** GET ?from=YYYY-MM-DD — lịch phụng vụ 7 ngày (mặc định từ hôm nay, giờ VN) + thẻ "Kinh tối hôm nay", "Thánh lễ sắp tới". */
export const GET = api({}, (ctx) => ctx.db((tx) => getWeek(tx, ctx.query.get("from"))));
