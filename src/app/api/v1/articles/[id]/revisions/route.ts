import { api, uuidParam } from "@/server/http";
import { listRevisions } from "@/server/modules/articles-revisions";

/** Lịch sử chỉnh sửa (25 bản gần nhất) của một bài. */
export const GET = api({}, (ctx) => ctx.db(async (tx) => ({ revisions: await listRevisions(tx, uuidParam(ctx, "id")) })));
