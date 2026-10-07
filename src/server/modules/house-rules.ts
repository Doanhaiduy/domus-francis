import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { forbidden, notFound } from "../errors";
import type { HouseRuleInput, HouseRuleSectionDto, HouseRulesDto } from "@/lib/types/house-rules";

// =====================================================================
// Luật nhà (db/app/1011_house_rules.sql): mọi thành viên đọc; Trưởng nhà/Admin (house.rules.manage) soạn, sửa, sắp xếp.
// Ghi trực tiếp dưới RLS — chính sách chặn người không có quyền.
// =====================================================================

const itemSchema = z.object({
  time: z.string().trim().max(30, "Giờ tối đa 30 ký tự.").nullable().optional().transform((v) => v || null),
  text: z.string().trim().min(1, "Điều khoản không được để trống.").max(400, "Mỗi điều khoản tối đa 400 ký tự."),
  red: z.boolean().nullable().optional().transform((v) => (v ? true : undefined)),
  sub: z.boolean().nullable().optional().transform((v) => (v ? true : undefined)),
  note: z.boolean().nullable().optional().transform((v) => (v ? true : undefined)),
});

export const RuleSectionSchema = z.object({
  title: z.string().trim().min(2, "Tên mục tối thiểu 2 ký tự.").max(120, "Tên mục tối đa 120 ký tự."),
  icon: z.string().trim().max(8, "Biểu tượng tối đa 8 ký tự.").nullable().optional().transform((v) => v || null),
  description: z.string().trim().max(500, "Mô tả tối đa 500 ký tự.").nullable().optional().transform((v) => v || null),
  items: z.array(itemSchema).max(60, "Mỗi mục tối đa 60 điều khoản."),
  isActive: z.boolean().optional(),
});
export const RuleReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toDto = (r: Row): HouseRuleSectionDto => ({
  id: r.id,
  title: r.title,
  icon: r.icon ?? null,
  description: r.description ?? null,
  items: Array.isArray(r.items) ? r.items.map((i: Row) => ({ time: i.time || null, text: String(i.text ?? ""), ...(i.red === true ? { red: true } : {}), ...(i.sub === true ? { sub: true } : {}), ...(i.note === true ? { note: true } : {}) })) : [],
  sortOrder: r.sort_order,
  isActive: r.is_active,
  updatedAt: new Date(r.updated_at).toISOString(),
  updatedByName: r.updated_by_name ?? null,
});

export async function listHouseRules(tx: Tx): Promise<HouseRulesDto> {
  const manage = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('house.rules.manage') AS ok")).rows[0].ok;
  const rows = (
    await tx.query(
      `SELECT s.id, s.title, s.icon, s.description, s.items, s.sort_order, s.is_active, s.updated_at,
              (SELECT m.display_name FROM members m WHERE m.user_id = s.updated_by LIMIT 1) AS updated_by_name
         FROM house_rule_sections s ORDER BY s.sort_order, s.created_at`,
    )
  ).rows;
  const house = (await tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'")).rows[0]?.v ?? null;
  const sections = rows.map(toDto);
  const last = sections.reduce<string | null>((a, s) => (!a || s.updatedAt > a ? s.updatedAt : a), null);
  return { sections, canManage: manage, updatedAt: last, houseName: house };
}

export async function createRuleSection(tx: Tx, b: z.infer<typeof RuleSectionSchema>): Promise<HouseRuleSectionDto> {
  const r = (
    await tx.query(
      `INSERT INTO house_rule_sections (title, icon, description, items, sort_order, is_active)
       VALUES ($1, $2, $3, $4::jsonb, COALESCE((SELECT max(sort_order) + 1 FROM house_rule_sections), 0), $5)
       RETURNING id, title, icon, description, items, sort_order, is_active, updated_at, NULL::text AS updated_by_name`,
      [b.title, b.icon, b.description, JSON.stringify(b.items), b.isActive ?? true],
    )
  ).rows[0];
  return toDto(r);
}

export async function updateRuleSection(tx: Tx, id: string, b: z.infer<typeof RuleSectionSchema>): Promise<HouseRuleSectionDto> {
  const r = (
    await tx.query(
      `UPDATE house_rule_sections SET title = $2, icon = $3, description = $4, items = $5::jsonb, is_active = COALESCE($6, is_active)
        WHERE id = $1
    RETURNING id, title, icon, description, items, sort_order, is_active, updated_at, NULL::text AS updated_by_name`,
      [id, b.title, b.icon, b.description, JSON.stringify(b.items), b.isActive ?? null],
    )
  ).rows[0];
  if (!r) {
    const exists = (await tx.query("SELECT 1 FROM house_rule_sections WHERE id = $1", [id])).rowCount;
    throw exists ? forbidden("Chỉ Trưởng nhà hoặc Admin mới sửa được luật nhà.") : notFound("Không tìm thấy mục luật nhà.");
  }
  return toDto(r);
}

export async function deleteRuleSection(tx: Tx, id: string) {
  const r = await tx.query("DELETE FROM house_rule_sections WHERE id = $1", [id]);
  if (!r.rowCount) {
    const exists = (await tx.query("SELECT 1 FROM house_rule_sections WHERE id = $1", [id])).rowCount;
    throw exists ? forbidden("Chỉ Trưởng nhà hoặc Admin mới xóa được mục luật nhà.") : notFound("Không tìm thấy mục luật nhà.");
  }
}

/** Sắp xếp lại theo thứ tự `ids` (mục không nêu giữ nguyên ở cuối). */
export async function reorderRuleSections(tx: Tx, ids: string[]) {
  const manage = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('house.rules.manage') AS ok")).rows[0].ok;
  if (!manage) throw forbidden("Chỉ Trưởng nhà hoặc Admin mới sắp xếp được luật nhà.");
  await tx.query(
    `UPDATE house_rule_sections s SET sort_order = x.ord
       FROM (SELECT id, (ordinality - 1)::int AS ord FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ordinality)) x
      WHERE s.id = x.id`,
    [ids],
  );
}
