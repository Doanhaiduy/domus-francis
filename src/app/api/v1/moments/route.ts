import { api } from "@/server/http";
import { createAlbum, getAlbum, listAlbums } from "@/server/modules/moments";
import { CreateAlbumSchema } from "@/server/modules/moments-schema";
import type { MomentListFilter } from "@/lib/types/moments";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int = (v: string | null, min: number, max: number) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** GET danh sách album (lọc: category, year, month, day, featured, q) + thống kê + danh mục. Quyền: thành viên (RLS albums__select). */
export const GET = api({}, (ctx) => {
  const q = ctx.query;
  const f: MomentListFilter = {
    category: UUID_RE.test(q.get("category") ?? "") ? q.get("category")! : undefined,
    year: int(q.get("year"), 1990, 2100),
    month: int(q.get("month"), 1, 12),
    day: q.get("day")?.trim().slice(0, 10) || undefined,
    featured: q.get("featured") === "1",
    q: q.get("q")?.trim().slice(0, 100) || undefined,
  };
  return ctx.db((tx) => listAlbums(tx, f));
});

/** POST tạo album (ảnh bìa + nhiều ảnh + thẻ tên). Quyền: album.create (RLS albums__insert). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CreateAlbumSchema);
  const album = await ctx.db(async (tx) => getAlbum(tx, await createAlbum(tx, b)));
  return Response.json(album, { status: 201 });
});
