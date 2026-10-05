import { api } from "@/server/http";
import { loadSessionInfo } from "@/server/modules/me";

export const GET = api({ auth: "user" }, (ctx) => ctx.db(loadSessionInfo));
