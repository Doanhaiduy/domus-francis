import { api, uuidParam } from "@/server/http";
import { ParticipantsSchema, setParticipants } from "@/server/modules/event-funds";

/** Thêm / sửa mức đóng / gỡ người tham gia (người phụ trách quỹ hoặc người quản lý). Người đã đóng tiền chỉ gỡ được sau khi hủy phiếu thu. */
export const PUT = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ParticipantsSchema);
  const changed = await ctx.db((tx) => setParticipants(tx, id, b));
  return { changed };
});
