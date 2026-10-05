import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { deleteFloor, getHouse, updateFloor } from "@/server/modules/house";
import { FloorSchema } from "@/server/modules/house-schema";

function level(p: Record<string, string>) {
  const n = Number(p.level);
  if (!Number.isInteger(n)) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tầng.");
  return n;
}

export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(FloorSchema.partial());
  return ctx.db(async (tx) => {
    await updateFloor(tx, level(ctx.params), b);
    return getHouse(tx);
  });
});

export const DELETE = api({}, (ctx) =>
  ctx.db(async (tx) => {
    await deleteFloor(tx, level(ctx.params));
    return getHouse(tx);
  })
);
