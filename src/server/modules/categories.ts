import "server-only";
import type { Tx } from "../db";
import { ApiError, conflict, forbidden, notFound } from "../errors";
import type { CategoryDto, CategoryInput, CategoryKind } from "@/lib/types/settings";

interface CategoryRow {
  id: string;
  kind: CategoryKind;
  code: string;
  name: string;
  description: string | null;
  color: string;
  icon_name: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  usage_count: number;
  updated_at: Date;
  version: number;
}

// Số bản ghi nghiệp vụ tham chiếu danh mục (FK phức hợp category_id, category_kind) — đếm dưới RLS của người gọi.
const USAGE = `
  SELECT category_id, count(*)::int AS n FROM (
    SELECT category_id FROM expense_vouchers
    UNION ALL SELECT category_id FROM events WHERE deleted_at IS NULL
    UNION ALL SELECT category_id FROM event_recurrence_rules
    UNION ALL SELECT category_id FROM announcements WHERE deleted_at IS NULL
    UNION ALL SELECT category_id FROM forum_posts WHERE deleted_at IS NULL
    UNION ALL SELECT category_id FROM maintenance_issues
    UNION ALL SELECT category_id FROM albums WHERE deleted_at IS NULL
  ) x GROUP BY category_id`;

const SELECT_CATEGORY = `
  SELECT c.id, c.kind::text AS kind, c.code, c.name, c.description, c.color, c.icon_name, c.sort_order,
         c.is_active, c.is_system, c.updated_at, c.version, COALESCE(u.n, 0)::int AS usage_count
    FROM categories c
    LEFT JOIN (${USAGE}) u ON u.category_id = c.id`;

const toDto = (r: CategoryRow): CategoryDto => ({
  id: r.id,
  kind: r.kind,
  code: r.code,
  name: r.name,
  description: r.description,
  color: r.color,
  iconName: r.icon_name,
  sortOrder: r.sort_order,
  isActive: r.is_active,
  isSystem: r.is_system,
  usageCount: r.usage_count,
  updatedAt: new Date(r.updated_at).toISOString(),
  version: r.version,
});

export async function listCategories(tx: Tx, opts: { kind?: CategoryKind | null; activeOnly?: boolean } = {}): Promise<CategoryDto[]> {
  const rows = (
    await tx.query<CategoryRow>(
      `${SELECT_CATEGORY}
        WHERE c.deleted_at IS NULL
          AND ($1::category_kind_t IS NULL OR c.kind = $1::category_kind_t)
          AND (NOT $2::boolean OR c.is_active)
        ORDER BY array_position(ARRAY['expense','event','announcement','forum','maintenance','album']::category_kind_t[], c.kind),
                 c.sort_order, c.name`,
      [opts.kind ?? null, !!opts.activeOnly],
    )
  ).rows;
  return rows.map(toDto);
}

async function getCategory(tx: Tx, id: string): Promise<CategoryRow> {
  const r = (await tx.query<CategoryRow>(`${SELECT_CATEGORY} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy danh mục (có thể đã bị xóa).");
  return r;
}

async function assertCanManage(tx: Tx) {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('category.manage') AS ok")).rows[0]?.ok;
  if (!ok) throw forbidden("Chỉ Ban điều hành có quyền Quản lý danh mục (category.manage) mới thêm/sửa/xóa danh mục.");
}

async function assertCodeFree(tx: Tx, kind: CategoryKind, code: string, exceptId?: string) {
  const dup = (
    await tx.query<{ name: string }>(
      "SELECT name FROM categories WHERE kind = $1::category_kind_t AND code = $2 AND deleted_at IS NULL AND ($3::uuid IS NULL OR id <> $3::uuid)",
      [kind, code, exceptId ?? null],
    )
  ).rows[0];
  if (dup) throw conflict(`Mã "${code}" đã được dùng cho danh mục "${dup.name}" trong cùng phân hệ.`, "DUPLICATE_CODE");
}

export async function createCategory(tx: Tx, i: Required<Pick<CategoryInput, "kind" | "code" | "name">> & CategoryInput): Promise<CategoryDto> {
  await assertCanManage(tx);
  await assertCodeFree(tx, i.kind, i.code);
  const r = await tx.query<{ id: string }>(
    `INSERT INTO categories (kind, code, name, description, color, is_active, sort_order)
     VALUES ($1::category_kind_t, $2, $3, $4, COALESCE($5, '#64748b'), COALESCE($6, true),
             (SELECT COALESCE(max(sort_order), 0) + 10 FROM categories WHERE kind = $1::category_kind_t))
     RETURNING id`,
    [i.kind, i.code, i.name, i.description || null, i.color ?? null, i.isActive ?? null],
  );
  return toDto(await getCategory(tx, r.rows[0].id));
}

export async function updateCategory(tx: Tx, id: string, i: CategoryInput): Promise<CategoryDto> {
  await assertCanManage(tx);
  const cur = await getCategory(tx, id);
  if (i.version !== undefined && i.version !== cur.version)
    throw conflict(`Danh mục "${cur.name}" vừa được người khác sửa — tải lại để xem bản mới.`, "STALE_VERSION");

  const kind = i.kind ?? cur.kind;
  const code = i.code ?? cur.code;
  if (cur.is_system && (code !== cur.code || kind !== cur.kind))
    throw new ApiError(
      422,
      "BR-CAT-01",
      `"${cur.name}" là danh mục hệ thống — không được đổi mã hoặc phân hệ áp dụng (vẫn đổi được tên, mô tả, màu, trạng thái).`,
    );
  if (kind !== cur.kind && cur.usage_count > 0)
    throw conflict(
      `Danh mục đang được dùng bởi ${cur.usage_count} bản ghi — không thể chuyển sang phân hệ khác. Hãy tạo danh mục mới.`,
      "CATEGORY_IN_USE",
    );
  if (code !== cur.code || kind !== cur.kind) await assertCodeFree(tx, kind, code, id);

  const sets: string[] = [];
  const vals: unknown[] = [id, cur.version];
  const set = (col: string, v: unknown, cast = "") => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}${cast}`);
  };
  if (i.name !== undefined && i.name !== cur.name) set("name", i.name);
  if (code !== cur.code) set("code", code);
  if (kind !== cur.kind) set("kind", kind, "::category_kind_t");
  if (i.description !== undefined && (i.description || null) !== cur.description) set("description", i.description || null);
  if (i.color !== undefined && i.color.toLowerCase() !== cur.color.toLowerCase()) set("color", i.color);
  if (i.isActive !== undefined && i.isActive !== cur.is_active) set("is_active", i.isActive);
  if (sets.length) {
    const r = await tx.query(`UPDATE categories SET ${sets.join(", ")} WHERE id = $1 AND version = $2`, vals);
    if (!r.rowCount) throw conflict(`Danh mục "${cur.name}" vừa được người khác sửa — tải lại rồi thử lại.`, "STALE_VERSION");
  }
  return toDto(await getCategory(tx, id));
}

/** Xóa mềm (giữ nguyên tham chiếu của dữ liệu cũ); danh mục hệ thống chỉ được tạm ẩn. */
export async function deleteCategory(tx: Tx, id: string): Promise<void> {
  await assertCanManage(tx);
  const cur = await getCategory(tx, id);
  if (cur.is_system)
    throw new ApiError(422, "BR-CAT-02", `"${cur.name}" là danh mục hệ thống — không thể xóa. Hãy chuyển sang "Tạm ẩn" nếu không muốn dùng nữa.`);
  const r = await tx.query("UPDATE categories SET deleted_at = now(), is_active = false WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền xóa danh mục.");
}
