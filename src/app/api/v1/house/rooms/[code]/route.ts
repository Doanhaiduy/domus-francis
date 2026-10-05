import { api } from "@/server/http";
import { deleteRoom, getHouse, updateRoom } from "@/server/modules/house";
import { RoomSchema } from "@/server/modules/house-schema";

const code = (p: Record<string, string>) => decodeURIComponent(p.code ?? "");

export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(RoomSchema);
  return ctx.db(async (tx) => {
    await updateRoom(tx, code(ctx.params), b);
    return getHouse(tx);
  });
});

export const DELETE = api({}, (ctx) =>
  ctx.db(async (tx) => {
    await deleteRoom(tx, code(ctx.params));
    return getHouse(tx);
  })
);
