import { api, uuidParam } from "@/server/http";
import { serveFile } from "@/server/storage";

export const runtime = "nodejs";

export const GET = api({}, (ctx) => serveFile(ctx, uuidParam(ctx, "id"), ctx.query.get("v")));
