import "server-only";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import type { ContentStatus, ForumCommentDto, ForumListDto, ForumPostDetailDto, ForumPostDto, ForumStatsDto } from "@/lib/types/community";
import { categoryLabel } from "@/lib/community-format";
import { assertCategory, currentMemberId, denyOrMissing, iso, listCategories, permissions, personCols, personJoin, toPerson } from "./community-shared";

type Row = Record<string, any>;

const POST_SELECT = `
  SELECT p.id, p.title, p.content, p.category_id, c.code AS cat_code, c.name AS cat_name, c.color AS cat_color,
         p.is_pinned, p.status::text AS status, p.comments_count, p.reactions_count, p.last_activity_at, p.created_at, p.updated_at, p.version,
         p.author_member_id, ${personCols("au")},
         EXISTS (SELECT 1 FROM forum_reactions fr WHERE fr.post_id = p.id AND fr.member_id = app.current_member_id() AND fr.kind = 'heart') AS liked,
         (SELECT count(*) FROM content_reports cr WHERE cr.entity_type = 'forum_post' AND cr.entity_id = p.id AND cr.status = 'open') AS open_reports,
         EXISTS (SELECT 1 FROM content_reports cr WHERE cr.entity_type = 'forum_post' AND cr.entity_id = p.id
                    AND cr.reporter_member_id = app.current_member_id()) AS my_reported
    FROM forum_posts p
    JOIN categories c ON c.id = p.category_id
    ${personJoin("au", "p.author_member_id")}`;

interface Viewer {
  me: string;
  moderate: boolean;
}

async function viewer(tx: Tx): Promise<Viewer> {
  const me = await currentMemberId(tx);
  const p = await permissions(tx, ["forum.moderate"] as const);
  return { me, moderate: p["forum.moderate"] };
}

function toPost(r: Row, v: Viewer): ForumPostDto {
  const isMine = r.author_member_id === v.me;
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    category: categoryLabel(r.cat_code, r.cat_name),
    categoryId: r.category_id,
    categoryCode: r.cat_code,
    categoryColor: r.cat_color,
    author: toPerson(r, "au"),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    lastActivityAt: iso(r.last_activity_at),
    isPinned: !!r.is_pinned,
    status: r.status as ContentStatus,
    commentsCount: Number(r.comments_count) || 0,
    reactionsCount: Number(r.reactions_count) || 0,
    liked: !!r.liked,
    isMine,
    canEdit: isMine,
    canDelete: isMine || v.moderate,
    openReports: v.moderate ? Number(r.open_reports) : null,
    myReported: !!r.my_reported,
  };
}

async function stats(tx: Tx): Promise<ForumStatsDto> {
  const s = (
    await tx.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE p.created_at >= now() - interval '7 days')::int AS week,
              COALESCE(sum(p.comments_count), 0)::int AS comments,
              count(*) FILTER (WHERE p.comments_count > 0)::int AS answered
         FROM forum_posts p WHERE p.deleted_at IS NULL AND p.status <> 'hidden'`
    )
  ).rows[0];
  const cw = (
    await tx.query(
      `SELECT count(*)::int AS n FROM forum_comments c JOIN forum_posts p ON p.id = c.post_id
        WHERE c.deleted_at IS NULL AND c.status = 'published' AND p.deleted_at IS NULL AND c.created_at >= now() - interval '7 days'`
    )
  ).rows[0];
  const hot = (
    await tx.query(
      `SELECT p.id, p.title, c.code AS cat_code, c.name AS cat_name, (p.comments_count + p.reactions_count) AS interactions,
              (SELECT count(DISTINCT x.m) FROM (
                 SELECT fc.author_member_id AS m FROM forum_comments fc WHERE fc.post_id = p.id AND fc.deleted_at IS NULL AND fc.status = 'published'
                 UNION SELECT p.author_member_id) x) AS participants
         FROM forum_posts p JOIN categories c ON c.id = p.category_id
        WHERE p.deleted_at IS NULL AND p.status <> 'hidden' AND p.last_activity_at >= now() - interval '30 days'
        ORDER BY (p.comments_count + p.reactions_count) DESC, p.last_activity_at DESC
        LIMIT 1`
    )
  ).rows[0];
  return {
    totalPosts: s.total,
    newThisWeek: s.week,
    totalComments: s.comments,
    commentsThisWeek: cw.n,
    responseRate: s.total ? Math.round((100 * s.answered) / s.total) : 0,
    hot: hot
      ? {
          id: hot.id,
          title: hot.title,
          interactions: Number(hot.interactions),
          participants: Number(hot.participants),
          category: categoryLabel(hot.cat_code, hot.cat_name),
        }
      : null,
  };
}

export async function listPosts(tx: Tx): Promise<ForumListDto> {
  const v = await viewer(tx);
  const rows = (await tx.query(`${POST_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.is_pinned DESC, p.last_activity_at DESC LIMIT 200`)).rows;
  return { posts: rows.map((r) => toPost(r, v)), categories: await listCategories(tx, "forum"), stats: await stats(tx) };
}

export async function getPost(tx: Tx, id: string): Promise<ForumPostDetailDto> {
  const v = await viewer(tx);
  const r = (await tx.query(`${POST_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy chủ đề.");
  const comments = (
    await tx.query(
      `SELECT fc.id, fc.post_id, fc.parent_id, fc.content, fc.status::text AS status, fc.created_at, fc.updated_at, fc.author_member_id,
              ${personCols("ca")},
              (SELECT count(*) FROM content_reports cr WHERE cr.entity_type = 'forum_comment' AND cr.entity_id = fc.id AND cr.status = 'open') AS open_reports,
              EXISTS (SELECT 1 FROM content_reports cr WHERE cr.entity_type = 'forum_comment' AND cr.entity_id = fc.id
                         AND cr.reporter_member_id = app.current_member_id()) AS my_reported
         FROM forum_comments fc
         ${personJoin("ca", "fc.author_member_id")}
        WHERE fc.post_id = $1 AND fc.deleted_at IS NULL
        ORDER BY fc.created_at`,
      [id]
    )
  ).rows.map(
    (c): ForumCommentDto => ({
      id: c.id,
      postId: c.post_id,
      parentId: c.parent_id,
      author: toPerson(c, "ca"),
      content: c.content,
      createdAt: iso(c.created_at),
      status: c.status,
      isMine: c.author_member_id === v.me,
      canDelete: c.author_member_id === v.me || v.moderate,
      openReports: v.moderate ? Number(c.open_reports) : null,
      myReported: !!c.my_reported,
    })
  );
  return { ...toPost(r, v), comments };
}

export interface PostInput {
  title: string;
  content: string;
  categoryId: string;
}

export async function createPost(tx: Tx, b: PostInput): Promise<string> {
  await currentMemberId(tx);
  await assertCategory(tx, b.categoryId, "forum");
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO forum_posts (title, content, category_id, author_member_id) VALUES ($1, $2, $3, app.current_member_id()) RETURNING id`,
      [b.title.trim(), b.content.trim(), b.categoryId]
    )
  ).rows[0].id;
}

export interface PostPatch {
  title?: string;
  content?: string;
  categoryId?: string;
  isPinned?: boolean;
  status?: ContentStatus;
}

/** Tác giả sửa nội dung; người kiểm duyệt ghim/khóa/ẩn (trigger BR-COM-06 chặn tác giả tự ghim hay bỏ ẩn). */
export async function updatePost(tx: Tx, id: string, b: PostPatch) {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.categoryId !== undefined) {
    await assertCategory(tx, b.categoryId, "forum");
    set("category_id", b.categoryId);
  }
  if (b.title !== undefined) set("title", b.title.trim());
  if (b.content !== undefined) set("content", b.content.trim());
  if (b.isPinned !== undefined) set("is_pinned", b.isPinned);
  if (b.status !== undefined) set("status", b.status);
  if (!sets.length) return;
  // Sửa nội dung chỉ dành cho tác giả (RLS cho cả người kiểm duyệt UPDATE — API giữ nội dung là của tác giả)
  if (b.title !== undefined || b.content !== undefined || b.categoryId !== undefined) {
    const own = (await tx.query("SELECT 1 FROM forum_posts WHERE id = $1 AND author_member_id = app.current_member_id() AND deleted_at IS NULL", [id])).rowCount;
    if (!own) await denyOrMissing(tx, "forum_posts", id, "Chỉ tác giả được sửa nội dung chủ đề.");
  }
  const r = await tx.query(`UPDATE forum_posts SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, vals);
  if (!r.rowCount) await denyOrMissing(tx, "forum_posts", id, "Bạn không có quyền sửa chủ đề này.");
  if (b.status === "hidden") await resolveReports(tx, "forum_post", id, "actioned", "Đã ẩn chủ đề");
}

export async function deletePost(tx: Tx, id: string) {
  const r = await tx.query("UPDATE forum_posts SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) await denyOrMissing(tx, "forum_posts", id, "Chỉ tác giả hoặc người kiểm duyệt được xóa chủ đề này.");
  await resolveReports(tx, "forum_post", id, "actioned", "Đã xóa chủ đề", true);
}

/** Thả/bỏ tim (mỗi người một lượt — partial unique index ux_forum_reactions__post). `desired` = trạng thái mong muốn (idempotent). */
export async function toggleLike(tx: Tx, id: string, desired?: boolean): Promise<{ liked: boolean; reactionsCount: number }> {
  await currentMemberId(tx);
  const post = (await tx.query("SELECT status::text AS status FROM forum_posts WHERE id = $1 AND deleted_at IS NULL", [id])).rows[0];
  if (!post || post.status === "hidden") throw notFound("Không tìm thấy chủ đề.");
  const del =
    desired === true
      ? { rowCount: 0 }
      : await tx.query("DELETE FROM forum_reactions WHERE post_id = $1 AND member_id = app.current_member_id() AND kind = 'heart'", [id]);
  let liked = false;
  if (desired === true || (desired === undefined && !del.rowCount)) {
    await tx.query(
      `INSERT INTO forum_reactions (post_id, member_id, kind) VALUES ($1, app.current_member_id(), 'heart')
       ON CONFLICT (post_id, member_id, kind) WHERE post_id IS NOT NULL DO NOTHING`,
      [id]
    );
    liked = true;
  }
  const n = (await tx.query("SELECT reactions_count FROM forum_posts WHERE id = $1", [id])).rows[0]?.reactions_count ?? 0;
  return { liked, reactionsCount: Number(n) };
}

export async function addComment(tx: Tx, postId: string, content: string, parentId: string | null): Promise<string> {
  await currentMemberId(tx);
  const visible = (await tx.query("SELECT 1 FROM forum_posts WHERE id = $1 AND deleted_at IS NULL", [postId])).rowCount;
  if (!visible) throw notFound("Không tìm thấy chủ đề.");
  // Trigger BR-COM-03: bài bị khóa/ẩn không nhận bình luận; trả lời lồng tối đa 1 cấp
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO forum_comments (post_id, parent_id, author_member_id, content) VALUES ($1, $2, app.current_member_id(), $3) RETURNING id`,
      [postId, parentId, content.trim()]
    )
  ).rows[0].id;
  await tx.query("SELECT app.fn_notify_forum_reply($1)", [id]);
  return id;
}

export async function updateComment(tx: Tx, id: string, b: { content?: string; status?: ContentStatus }) {
  if (b.content !== undefined) {
    const own = (await tx.query("SELECT 1 FROM forum_comments WHERE id = $1 AND author_member_id = app.current_member_id() AND deleted_at IS NULL", [id])).rowCount;
    if (!own) await denyOrMissing(tx, "forum_comments", id, "Chỉ tác giả được sửa bình luận.");
    await tx.query("UPDATE forum_comments SET content = $2 WHERE id = $1", [id, b.content.trim()]);
  }
  if (b.status !== undefined) {
    const r = await tx.query("UPDATE forum_comments SET status = $2 WHERE id = $1 AND deleted_at IS NULL", [id, b.status]);
    if (!r.rowCount) await denyOrMissing(tx, "forum_comments", id, "Chỉ người kiểm duyệt được ẩn bình luận.");
    if (b.status === "hidden") await resolveReports(tx, "forum_comment", id, "actioned", "Đã ẩn bình luận");
  }
}

export async function deleteComment(tx: Tx, id: string) {
  const r = await tx.query("UPDATE forum_comments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) await denyOrMissing(tx, "forum_comments", id, "Chỉ tác giả hoặc người kiểm duyệt được xóa bình luận này.");
  await resolveReports(tx, "forum_comment", id, "actioned", "Đã xóa bình luận", true);
}

// ---------------------------------------------------------------------
// Báo cáo vi phạm (content_reports) — dùng chung cho diễn đàn và ý cầu nguyện
// ---------------------------------------------------------------------
export type ReportEntity = "forum_post" | "forum_comment" | "prayer_intention";

export async function reportContent(tx: Tx, entity: ReportEntity, id: string, reason: string) {
  await currentMemberId(tx);
  try {
    // Trigger C-003/C-022: nội dung phải tồn tại và người báo nhìn thấy được
    await tx.query(
      `INSERT INTO content_reports (entity_type, entity_id, reporter_member_id, reason) VALUES ($1, $2, app.current_member_id(), $3)`,
      [entity, id, reason.trim()]
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "ALREADY_REPORTED", "Bạn đã báo cáo nội dung này, người quản lý đang xem xét.");
    throw e;
  }
}

/** Đóng các báo cáo đang mở của một nội dung (người kiểm duyệt). `quiet` = bỏ qua nếu người gọi không phải người kiểm duyệt. */
export async function resolveReports(tx: Tx, entity: ReportEntity, id: string, status: "actioned" | "dismissed", note: string | null, quiet = false) {
  const p = await permissions(tx, ["forum.moderate", "prayer.moderate", "album.moderate"] as const);
  if (!p["forum.moderate"] && !p["prayer.moderate"] && !p["album.moderate"]) {
    if (quiet) return 0;
    throw forbidden("Chỉ người kiểm duyệt được xử lý báo cáo vi phạm.");
  }
  const r = await tx.query(
    `UPDATE content_reports SET status = $3, handled_by = app.current_user_id(), handled_at = now(), resolution_note = $4
      WHERE entity_type = $1 AND entity_id = $2 AND status = 'open'`,
    [entity, id, status, note]
  );
  return r.rowCount ?? 0;
}
