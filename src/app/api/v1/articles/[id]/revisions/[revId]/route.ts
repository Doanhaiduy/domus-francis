import { api, uuidParam } from "@/server/http";
import { getForManage } from "@/server/modules/articles";
import { restoreRevision } from "@/server/modules/articles-revisions";

/** Khôi phục bài về một bản cũ; trả bài sau khi khôi phục. */
export const POST = api({}, (ctx) =>
  ctx.db(async (tx) => {
    const id = uuidParam(ctx, "id");
    await restoreRevision(tx, id, uuidParam(ctx, "revId"));
    return getForManage(tx, id);
  })
);
