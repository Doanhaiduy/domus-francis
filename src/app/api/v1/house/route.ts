import { api } from "@/server/http";
import { getHouse } from "@/server/modules/house";

export const GET = api({}, (ctx) => ctx.db(getHouse));
