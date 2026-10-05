import { api } from "@/server/http";
import { createFloor, getHouse } from "@/server/modules/house";
import { FloorSchema } from "@/server/modules/house-schema";

export const POST = api({}, async (ctx) => {
  const b = await ctx.body(FloorSchema);
  return ctx.db(async (tx) => {
    const level = await createFloor(tx, b);
    return { level, house: await getHouse(tx) };
  });
});
