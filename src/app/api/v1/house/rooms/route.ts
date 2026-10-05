import { api } from "@/server/http";
import { createRoom, getHouse } from "@/server/modules/house";
import { RoomSchema } from "@/server/modules/house-schema";
import { ApiError } from "@/server/errors";

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RoomSchema);
  if (!b.id) throw new ApiError(400, "VALIDATION_FAILED", "Nhập mã phòng (ví dụ P.6).");
  return ctx.db(async (tx) => {
    const code = await createRoom(tx, b);
    return { code, house: await getHouse(tx) };
  });
});
