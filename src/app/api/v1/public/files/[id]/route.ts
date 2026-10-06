import { api, uuidParam } from "@/server/http";
import { servePublicFile } from "@/server/storage";

export const runtime = "nodejs";

/** Ảnh của bài viết công khai đã đăng — KHÔNG cần đăng nhập (tệp khác trả 404). */
export const GET = api({ auth: "public" }, (ctx) => servePublicFile(ctx, uuidParam(ctx, "id"), ctx.query.get("v")));
