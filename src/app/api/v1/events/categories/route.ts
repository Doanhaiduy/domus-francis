import { api } from "@/server/http";
import { listCategories } from "@/server/modules/events";

/** GET /api/v1/events/categories — danh mục sự kiện (categories.kind = 'event'). */
export const GET = api({}, (ctx) => ctx.db(listCategories));
