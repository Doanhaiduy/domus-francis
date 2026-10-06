import "server-only";
import type { Tx } from "../db";
import { notFound } from "../errors";
import type { ArticleRevision } from "@/lib/types/articles";
import { assertCanManage } from "./articles";

// Lịch sử chỉnh sửa bài viết công khai: trigger trg_public_articles__revision lưu bản CŨ mỗi khi tiêu đề/tóm tắt/nội dung đổi.

export async function listRevisions(tx: Tx, articleId: string): Promise<ArticleRevision[]> {
  await assertCanManage(tx);
  const rows = (
    await tx.query(
      `SELECT r.id, r.title, r.summary, r.content, r.created_at,
              (SELECT m.display_name FROM members m WHERE m.user_id = r.saved_by LIMIT 1) AS by_name
         FROM public_article_revisions r WHERE r.article_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 25`,
      [articleId]
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    content: r.content,
    createdAt: new Date(r.created_at).toISOString(),
    savedByName: r.by_name ?? null,
  }));
}

/** Khôi phục một bản cũ: ghi đè tiêu đề/tóm tắt/nội dung hiện tại (bản hiện tại tự được lưu thành một bản cũ mới nhờ trigger). */
export async function restoreRevision(tx: Tx, articleId: string, revisionId: string) {
  await assertCanManage(tx);
  const rev = (await tx.query("SELECT title, summary, content FROM public_article_revisions WHERE id = $1 AND article_id = $2", [revisionId, articleId])).rows[0];
  if (!rev) throw notFound("Không tìm thấy bản chỉnh sửa này.");
  const r = await tx.query("UPDATE public_articles SET title = $2, summary = $3, content = $4 WHERE id = $1 AND deleted_at IS NULL", [articleId, rev.title, rev.summary, rev.content]);
  if (!r.rowCount) throw notFound("Không tìm thấy bài viết.");
}
