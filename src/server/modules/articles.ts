import "server-only";
import type { Tx } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { permissions } from "./community-shared";
import { readMinutes } from "@/lib/articles-format";
import type { ArticleDetail, ArticleListItem, ArticleStatus, PublicArticleListDto, PublicOrgInfo } from "@/lib/types/articles";

type Row = Record<string, any>;

// Bài viết công khai. Mọi truy vấn chạy dưới RLS của luuxa_app: người chưa đăng nhập chỉ thấy bài đã đăng,
// người có article.manage thấy cả bản nháp (xem db/app/1018_public_articles.sql).

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

const COLS = `a.id, a.slug, a.title, a.summary, a.category, a.cover_file_id, a.byline, a.is_featured, a.status, a.tags,
              a.published_at, a.updated_at, a.view_count`;

// ~200 từ/phút: đếm từ bằng SQL để danh sách không phải tải toàn bộ nội dung
const READ_MIN = `GREATEST(1, round(COALESCE(array_length(regexp_split_to_array(btrim(a.content), '\\s+'), 1), 0) / 200.0))::int AS read_minutes`;

function toItem(r: Row): ArticleListItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    category: r.category,
    coverFileId: r.cover_file_id,
    byline: r.byline,
    isFeatured: !!r.is_featured,
    status: r.status as ArticleStatus,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    publishedAt: iso(r.published_at),
    updatedAt: iso(r.updated_at) ?? "",
    views: Number(r.view_count) || 0,
    readMinutes: r.content != null ? readMinutes(r.content) : Math.max(1, Number(r.read_minutes) || 1),
  };
}

const toDetail = (r: Row): ArticleDetail => ({ ...toItem(r), content: r.content ?? "" });

export async function publicOrgInfo(tx: Tx): Promise<PublicOrgInfo> {
  const o = ((await tx.query("SELECT app.fn_public_org_info() AS o")).rows[0]?.o ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  return {
    houseName: str("org.house_name") ?? "Lưu Xá Phanxicô",
    motto: str("org.motto"),
    address: str("org.address"),
    phone: str("org.contact_phone"),
    orderName: str("org.order_name"),
    patronName: str("org.patron_name"),
    about: str("org.about"),
    patronFeast: str("org.patron_feast"),
  };
}

export interface ListQuery {
  category?: string;
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

const PUBLISHED = "a.status = 'published' AND a.published_at <= now() AND a.deleted_at IS NULL";

/** Danh sách bài đã đăng (mới nhất trước). Trang công khai chỉ hiện bài đã đăng, kể cả với người có quyền quản lý. */
export async function listPublished(tx: Tx, query: ListQuery = {}): Promise<PublicArticleListDto> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 9, 1), 30);
  const page = Math.max(query.page ?? 1, 1);
  const where = [PUBLISHED];
  const params: unknown[] = [];
  if (query.category) {
    params.push(query.category);
    where.push(`a.category = $${params.length}`);
  }
  if (query.tag) {
    params.push(query.tag);
    where.push(`$${params.length} = ANY (a.tags)`);
  }
  if (query.q?.trim()) {
    params.push(`%${query.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(a.title ILIKE $${params.length} OR a.summary ILIKE $${params.length})`);
  }
  const w = where.join(" AND ");
  const total = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM public_articles a WHERE ${w}`, params)).rows[0].n;
  const rows = (
    await tx.query(
      `SELECT ${COLS}, ${READ_MIN} FROM public_articles a WHERE ${w}
        ORDER BY a.published_at DESC, a.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params
    )
  ).rows;
  return { articles: rows.map(toItem), total, page, pageSize };
}

/** Các bài đã đăng (chỉ slug + ngày cập nhật) cho sitemap. */
export async function sitemapArticles(tx: Tx): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = (await tx.query(`SELECT a.slug, a.updated_at FROM public_articles a WHERE ${PUBLISHED} ORDER BY a.published_at DESC LIMIT 2000`)).rows;
  return rows.map((r) => ({ slug: r.slug as string, updatedAt: iso(r.updated_at) ?? "" }));
}

/** Bài nổi bật mới nhất (hiện lớn ở đầu trang công khai). */
export async function featuredArticle(tx: Tx): Promise<ArticleListItem | null> {
  const r = (
    await tx.query(`SELECT ${COLS}, ${READ_MIN} FROM public_articles a WHERE ${PUBLISHED} AND a.is_featured ORDER BY a.published_at DESC LIMIT 1`)
  ).rows[0];
  return r ? toItem(r) : null;
}

/** Chi tiết bài theo slug + vài bài khác. `preview`: người quản lý xem trước cả bản nháp. */
export async function getPublishedBySlug(tx: Tx, slug: string, preview = false): Promise<{ article: ArticleDetail; related: ArticleListItem[] } | null> {
  const r = (
    await tx.query(
      `SELECT ${COLS}, a.content FROM public_articles a
        WHERE a.slug = $1 AND a.deleted_at IS NULL ${preview ? "" : "AND a.status = 'published' AND a.published_at <= now()"}`,
      [slug]
    )
  ).rows[0];
  if (!r) return null;
  const related = (
    await tx.query(
      `SELECT ${COLS}, ${READ_MIN} FROM public_articles a
        WHERE ${PUBLISHED} AND a.id <> $1
        ORDER BY (a.category = $2) DESC, a.published_at DESC LIMIT 3`,
      [r.id, r.category]
    )
  ).rows.map(toItem);
  return { article: toDetail(r), related };
}

export async function recordView(tx: Tx, slug: string) {
  await tx.query("SELECT app.fn_article_view($1)", [slug]);
}

export interface PublicFileMeta {
  bucket: string;
  object_key: string;
  detected_mime: string;
  variants: Record<string, string>;
}

export async function publicFileMeta(tx: Tx, id: string): Promise<PublicFileMeta | null> {
  return (await tx.query<PublicFileMeta>("SELECT * FROM app.fn_public_article_file($1)", [id])).rows[0] ?? null;
}

// ---------------------------------------------------------------------
// Quản lý (article.manage — RLS chặn người không có quyền)
// ---------------------------------------------------------------------

export async function assertCanManage(tx: Tx) {
  if (!(await permissions(tx, ["article.manage"] as const))["article.manage"]) throw forbidden("Bạn không có quyền quản lý bài viết công khai.");
}

const needContent = (b: Partial<ArticleInput>) => {
  if (b.status === "published" && b.content !== undefined && !b.content.trim()) throw badRequest("Bài đã đăng phải có nội dung.");
};

export async function listForManage(tx: Tx): Promise<ArticleListItem[]> {
  await assertCanManage(tx);
  const rows = (
    await tx.query(`SELECT ${COLS}, ${READ_MIN} FROM public_articles a WHERE a.deleted_at IS NULL ORDER BY a.updated_at DESC LIMIT 300`)
  ).rows;
  return rows.map(toItem);
}

export async function getForManage(tx: Tx, id: string): Promise<ArticleDetail> {
  await assertCanManage(tx);
  const r = (await tx.query(`SELECT ${COLS}, a.content FROM public_articles a WHERE a.id = $1 AND a.deleted_at IS NULL`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy bài viết.");
  return toDetail(r);
}

export interface ArticleInput {
  title: string;
  slug: string;
  summary?: string | null;
  content: string;
  category: string;
  coverFileId?: string | null;
  byline?: string | null;
  isFeatured?: boolean;
  status: ArticleStatus;
  tags?: string[];
  /** Hẹn giờ đăng (ISO). Bỏ trống = đăng ngay khi status = published. */
  publishedAt?: string | null;
}

/** Thẻ: chữ thường, bỏ trùng, tối đa 8 thẻ, mỗi thẻ ≤ 30 ký tự. */
export const cleanTags = (tags?: string[] | null): string[] =>
  [...new Set((tags ?? []).map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter((t) => t.length >= 2 && t.length <= 30))].slice(0, 8);

const DUP_SLUG = "Đường dẫn này đã được bài khác dùng — hãy đổi một chút (ví dụ thêm năm).";

export async function createArticle(tx: Tx, b: ArticleInput): Promise<string> {
  await assertCanManage(tx);
  needContent(b);
  try {
    return (
      await tx.query<{ id: string }>(
        `INSERT INTO public_articles (slug, title, summary, content, category, cover_file_id, byline, status, is_featured, tags, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::timestamptz) RETURNING id`,
        [b.slug, b.title, b.summary ?? null, b.content, b.category, b.coverFileId ?? null, b.byline ?? null, b.status, !!b.isFeatured, cleanTags(b.tags), b.status === "published" ? (b.publishedAt ?? null) : null]
      )
    ).rows[0].id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict(DUP_SLUG, "SLUG_TAKEN");
    throw e;
  }
}

const COLUMN_OF: Record<keyof ArticleInput, string> = {
  title: "title",
  slug: "slug",
  summary: "summary",
  content: "content",
  category: "category",
  coverFileId: "cover_file_id",
  byline: "byline",
  isFeatured: "is_featured",
  status: "status",
  tags: "tags",
  publishedAt: "published_at",
};

export async function updateArticle(tx: Tx, id: string, b: Partial<ArticleInput>) {
  await assertCanManage(tx);
  needContent(b);
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [k, col] of Object.entries(COLUMN_OF) as [keyof ArticleInput, string][]) {
    if (b[k] === undefined) continue;
    vals.push(k === "tags" ? cleanTags(b.tags) : (b[k] ?? null));
    const cast = k === "tags" ? "::text[]" : k === "publishedAt" ? "::timestamptz" : "";
    sets.push(`${col} = $${vals.length}${cast}`);
  }
  if (!sets.length) return;
  try {
    const r = await tx.query(`UPDATE public_articles SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, vals);
    if (!r.rowCount) throw notFound("Không tìm thấy bài viết.");
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict(DUP_SLUG, "SLUG_TAKEN");
    throw e;
  }
}

/** Xóa mềm (còn trong CSDL để khôi phục khi cần; đường dẫn được giải phóng). */
export async function deleteArticle(tx: Tx, id: string) {
  await assertCanManage(tx);
  const r = await tx.query("UPDATE public_articles SET deleted_at = now(), status = 'draft', is_featured = false WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy bài viết.");
}
