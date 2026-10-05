import { api, uuidParam } from "@/server/http";
import { getAlbum, respondTag } from "@/server/modules/moments";
import { TagResponseSchema } from "@/server/modules/moments-schema";

/** POST người được gắn thẻ xác nhận (accepted) hoặc gỡ (declined) thẻ tên của mình trong album. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(TagResponseSchema);
  return ctx.db(async (tx) => {
    await respondTag(tx, id, b.status);
    return getAlbum(tx, id);
  });
});
