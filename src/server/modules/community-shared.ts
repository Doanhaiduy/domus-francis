import "server-only";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import { categoryIcon, categoryLabel, initialsOf } from "@/lib/community-format";
import type { CategoryDto, PersonRef } from "@/lib/types/community";

// ---------------------------------------------------------------------
// Tiện ích dùng chung cho các module Cộng đoàn (thông báo, diễn đàn, cầu nguyện, phụng vụ, hộp thư)
// ---------------------------------------------------------------------

/**
 * JOIN thông tin người (tên, chức vụ hiện hành, phòng hiện tại) cho một cột members.id.
 * Dùng cùng `personCols(alias)`; đọc dưới RLS của người gọi (danh bạ thành viên đọc được với mọi thành viên).
 */
export const personJoin = (alias: string, idExpr: string) => `
  LEFT JOIN members ${alias} ON ${alias}.id = ${idExpr}
  LEFT JOIN v_member_current_position ${alias}_pos ON ${alias}_pos.member_id = ${alias}.id
  LEFT JOIN LATERAL (
    SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
     WHERE ra.member_id = ${alias}.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
     ORDER BY ra.starts_on DESC LIMIT 1) ${alias}_room ON true`;

export const personCols = (alias: string) =>
  `${alias}.id AS ${alias}_id, ${alias}.full_name AS ${alias}_full, ${alias}.display_name AS ${alias}_name,
   ${alias}.avatar_file_id AS ${alias}_avatar, ${alias}_pos.position_name AS ${alias}_pos, ${alias}_room.code AS ${alias}_room`;

type Row = Record<string, any>;

export function toPerson(r: Row, alias: string): PersonRef {
  const name = r[`${alias}_name`] ?? r[`${alias}_full`] ?? "Thành viên";
  return {
    id: r[`${alias}_id`],
    name,
    fullName: r[`${alias}_full`] ?? name,
    role: r[`${alias}_pos`] ?? "Thành viên",
    room: r[`${alias}_room`] ?? null,
    initials: initialsOf(name),
    avatarFileId: r[`${alias}_avatar`] ?? null,
  };
}

export const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
export const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

/** Nội dung rút gọn một dòng làm "preview" (thiết kế: preview suy ra từ content ở API). */
export function previewOf(content: string, max = 140): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function toCategory(r: Row): CategoryDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    label: categoryLabel(r.code, r.name),
    color: r.color,
    icon: categoryIcon(r.code),
  };
}

export async function listCategories(tx: Tx, kind: "announcement" | "forum"): Promise<CategoryDto[]> {
  const rows = (
    await tx.query(
      `SELECT id, code, name, color FROM categories
        WHERE kind = $1 AND is_active AND deleted_at IS NULL ORDER BY sort_order, name`,
      [kind]
    )
  ).rows;
  return rows.map(toCategory);
}

export async function assertCategory(tx: Tx, id: string, kind: "announcement" | "forum") {
  const ok = (await tx.query("SELECT 1 FROM categories WHERE id = $1 AND kind = $2 AND is_active AND deleted_at IS NULL", [id, kind])).rowCount;
  if (!ok) throw new ApiError(400, "BAD_CATEGORY", "Chuyên mục không hợp lệ.");
}

/** members.id của người gọi; tài khoản kỹ thuật không có hồ sơ thành viên thì không dùng được phân hệ này. */
export async function currentMemberId(tx: Tx): Promise<string> {
  const id = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0]?.id;
  if (!id) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  return id;
}

/** Một tập quyền của người gọi (đọc từ DB — cùng nguồn với RLS). */
export async function permissions<K extends string>(tx: Tx, codes: readonly K[]): Promise<Record<K, boolean>> {
  const r = (
    await tx.query<{ code: K; ok: boolean }>("SELECT c AS code, app.has_permission(c) AS ok FROM unnest($1::text[]) AS c", [codes as unknown as string[]])
  ).rows;
  return Object.fromEntries(r.map((x) => [x.code, x.ok])) as Record<K, boolean>;
}

/**
 * UPDATE không ảnh hưởng dòng nào: phân biệt "không có quyền" (dòng vẫn nhìn thấy) với "không tồn tại".
 */
export async function denyOrMissing(tx: Tx, table: string, id: string, msg: string): Promise<never> {
  const visible = (await tx.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount;
  if (visible) throw forbidden(msg);
  throw notFound();
}

export const TZ_SQL = "Asia/Ho_Chi_Minh";
