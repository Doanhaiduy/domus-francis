import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { zDate, zUuid } from "../http";
import { badRequest, forbidden, notFound } from "../errors";
import { denyOrMissing, permissions, personCols, personJoin, toPerson, iso, isoOrNull } from "./community-shared";
import type { DisciplineListDto, DisciplineQuery, DisciplineRecordDto, DisciplineRuleDto, DisciplineSummary, PenaltyKind } from "@/lib/types/discipline";
import { PENALTY_KINDS, penaltyText } from "@/lib/types/discipline";

// Vi phạm & kỷ luật. Quyền nằm ở CSDL (RLS): thành viên chỉ đọc vi phạm của chính mình; discipline.read xem cả nhà; discipline.manage ghi/sửa/xóa.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const kindEnum = z.enum(PENALTY_KINDS as [PenaltyKind, ...PenaltyKind[]]);
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const optDate = zDate.nullable().optional().transform((v) => v ?? null);
const optQty = z.number().int().min(1, "Số lượng tối thiểu là 1.").max(365, "Số lượng tối đa 365.").nullable().optional().transform((v) => v ?? null);
// Dùng cho PATCH: vắng mặt = giữ nguyên (undefined); gửi null/"" = xóa giá trị
const pText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v === undefined ? undefined : v ? v : null));
const pQty = z.number().int().min(1, "Số lượng tối thiểu là 1.").max(365, "Số lượng tối đa 365.").nullable().optional();
const pDate = zDate.nullable().optional();

// ---------------------------------------------------------------------
// Điều luật
// ---------------------------------------------------------------------
export const RuleSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_.-]{0,19}$/, "Mã chỉ gồm chữ không dấu, số, . _ - (tối đa 20 ký tự)."),
  title: z.string().trim().min(2, "Tên điều luật tối thiểu 2 ký tự.").max(200),
  description: optText(1000),
  defaultPenaltyKind: kindEnum.default("none"),
  defaultPenaltyQty: optQty,
  defaultPenaltyNote: optText(200),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});
export type RuleInput = z.infer<typeof RuleSchema>;
export const RulePatchSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_.-]{0,19}$/, "Mã chỉ gồm chữ không dấu, số, . _ - (tối đa 20 ký tự).").optional(),
  title: z.string().trim().min(2, "Tên điều luật tối thiểu 2 ký tự.").max(200).optional(),
  description: pText(1000),
  defaultPenaltyKind: kindEnum.optional(),
  defaultPenaltyQty: pQty,
  defaultPenaltyNote: pText(200),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

function checkPenaltyDefaults(kind: PenaltyKind, qty: number | null) {
  if ((kind === "rosary" || kind === "mass" || kind === "duty") && qty === null) throw badRequest("Hình phạt gợi ý cần có số lượng.");
}

const toRule = (r: Row, withUsage: boolean): DisciplineRuleDto => ({
  id: r.id,
  code: r.code,
  title: r.title,
  description: r.description,
  defaultPenaltyKind: r.default_penalty_kind,
  defaultPenaltyQty: r.default_penalty_qty,
  defaultPenaltyNote: r.default_penalty_note,
  sortOrder: r.sort_order,
  isActive: r.is_active,
  usageCount: withUsage ? Number(r.usage_count ?? 0) : 0,
});

export async function listRules(tx: Tx): Promise<{ canManage: boolean; rules: DisciplineRuleDto[] }> {
  const p = await permissions(tx, ["discipline.manage"] as const);
  const rows = (
    await tx.query(
      `SELECT r.*, (SELECT count(*) FROM discipline_records x WHERE x.rule_id = r.id)::int AS usage_count
         FROM discipline_rules r ORDER BY r.sort_order, r.code`
    )
  ).rows;
  return { canManage: p["discipline.manage"], rules: rows.map((r) => toRule(r, p["discipline.manage"])) };
}

export async function createRule(tx: Tx, b: RuleInput): Promise<string> {
  checkPenaltyDefaults(b.defaultPenaltyKind, b.defaultPenaltyQty);
  const r = await tx.query<{ id: string }>(
    `INSERT INTO discipline_rules (code, title, description, default_penalty_kind, default_penalty_qty, default_penalty_note, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [b.code, b.title, b.description, b.defaultPenaltyKind, b.defaultPenaltyKind === "none" ? null : b.defaultPenaltyQty, b.defaultPenaltyNote, b.sortOrder, b.isActive]
  );
  return r.rows[0].id;
}

export async function updateRule(tx: Tx, id: string, b: z.infer<typeof RulePatchSchema>) {
  const map: Record<string, string> = {
    code: "code",
    title: "title",
    description: "description",
    defaultPenaltyKind: "default_penalty_kind",
    defaultPenaltyQty: "default_penalty_qty",
    defaultPenaltyNote: "default_penalty_note",
    sortOrder: "sort_order",
    isActive: "is_active",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in b && (b as Record<string, unknown>)[k] !== undefined) {
      vals.push((b as Record<string, unknown>)[k]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (b.defaultPenaltyKind === "none" && !("defaultPenaltyQty" in b)) sets.push("default_penalty_qty = NULL");
  if (!sets.length) throw badRequest("Không có gì để cập nhật.");
  vals.push(id);
  const r = await tx.query(`UPDATE discipline_rules SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  if (!r.rowCount) await denyOrMissing(tx, "discipline_rules", id, "Chỉ Trưởng nhà hoặc Admin được sửa điều luật.");
}

export async function deleteRule(tx: Tx, id: string) {
  const r = await tx.query("DELETE FROM discipline_rules WHERE id = $1", [id]);
  if (!r.rowCount) await denyOrMissing(tx, "discipline_rules", id, "Chỉ Trưởng nhà hoặc Admin được xóa điều luật.");
}

/** Nhập các điều khoản trong "Luật nhà" (house_rule_sections) làm điều luật phạt; bỏ qua điều đã có (trùng tên). Trả số điều mới. */
export async function importFromHouseRules(tx: Tx): Promise<{ created: number; skipped: number }> {
  const p = await permissions(tx, ["discipline.manage"] as const);
  if (!p["discipline.manage"]) throw forbidden("Chỉ Trưởng nhà hoặc Admin được quản lý danh mục luật phạt.");
  const sections = (await tx.query<{ title: string; items: unknown }>("SELECT title, items FROM house_rule_sections WHERE is_active ORDER BY sort_order, created_at")).rows;
  const existing = await tx.query<{ code: string; title: string }>("SELECT code, title FROM discipline_rules");
  const titles = new Set(existing.rows.map((r) => r.title.trim().toLowerCase()));
  let n = existing.rows.reduce((m, r) => Math.max(m, Number(/^L(\d+)$/.exec(r.code)?.[1] ?? 0)), 0);
  let sort = existing.rows.length * 10;
  let created = 0;
  let skipped = 0;
  for (const s of sections) {
    const items = Array.isArray(s.items) ? (s.items as { text?: string; time?: string }[]) : [];
    for (const it of items) {
      const text = String(it?.text ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 2) continue;
      const title = text.slice(0, 200);
      if (titles.has(title.toLowerCase())) {
        skipped++;
        continue;
      }
      titles.add(title.toLowerCase());
      n++;
      sort += 10;
      await tx.query(
        `INSERT INTO discipline_rules (code, title, description, sort_order) VALUES ($1, $2, $3, $4)`,
        [`L${String(n).padStart(2, "0")}`, title, `Mục “${s.title}” trong Luật nhà${it?.time ? ` (${it.time})` : ""}`, sort]
      );
      created++;
    }
  }
  return { created, skipped };
}

// ---------------------------------------------------------------------
// Ghi nhận vi phạm
// ---------------------------------------------------------------------
export const PHASE_SQL = `CASE WHEN r.status = 'completed' THEN 'completed'
                        WHEN r.status = 'waived' THEN 'waived'
                        WHEN r.penalty_kind = 'none' THEN 'recorded'
                        WHEN r.penalty_starts_on IS NOT NULL AND r.penalty_starts_on > app.local_today() THEN 'upcoming'
                        WHEN r.penalty_ends_on IS NOT NULL AND r.penalty_ends_on < app.local_today() THEN 'overdue'
                        ELSE 'serving' END`;

const penaltyBlock = {
  penaltyKind: kindEnum.default("none"),
  penaltyQty: optQty,
  penaltyDetail: optText(200),
  penaltyStartsOn: optDate,
  penaltyEndsOn: optDate,
};

function refinePenalty(v: { penaltyKind?: PenaltyKind; penaltyQty?: number | null; penaltyDetail?: string | null; penaltyStartsOn?: string | null; penaltyEndsOn?: string | null }, ctx: z.RefinementCtx) {
  const k = v.penaltyKind ?? "none";
  if ((k === "rosary" || k === "mass" || k === "duty") && !v.penaltyQty) ctx.addIssue({ code: "custom", path: ["penaltyQty"], message: "Hình phạt này cần số lượng (từ 1)." });
  if (k === "other" && (v.penaltyDetail ?? "").trim().length < 2) ctx.addIssue({ code: "custom", path: ["penaltyDetail"], message: "Hãy mô tả hình phạt khác." });
  if (v.penaltyStartsOn && v.penaltyEndsOn && v.penaltyEndsOn < v.penaltyStartsOn) ctx.addIssue({ code: "custom", path: ["penaltyEndsOn"], message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu." });
}

export const RecordCreateSchema = z
  .object({
    memberId: zUuid,
    ruleId: zUuid.nullable().optional().transform((v) => v ?? null),
    ruleTitle: optText(200),
    occurredOn: zDate,
    note: optText(1000),
    ...penaltyBlock,
  })
  .superRefine((v, ctx) => {
    if (!v.ruleId && (v.ruleTitle ?? "").trim().length < 2) ctx.addIssue({ code: "custom", path: ["ruleTitle"], message: "Chọn điều luật hoặc ghi tên điều đã vi phạm." });
    refinePenalty(v, ctx);
  });
export type RecordCreateInput = z.infer<typeof RecordCreateSchema>;

export const RecordPatchSchema = z.object({
  action: z.enum(["complete", "waive", "reopen"]).optional(),
  reason: pText(500),
  ruleId: zUuid.nullable().optional(),
  ruleTitle: pText(200),
  occurredOn: zDate.optional(),
  note: pText(1000),
  penaltyKind: kindEnum.optional(),
  penaltyQty: pQty,
  penaltyDetail: pText(200),
  penaltyStartsOn: pDate,
  penaltyEndsOn: pDate,
});
export type RecordPatchInput = z.infer<typeof RecordPatchSchema>;

const SELECT = `
  SELECT r.id, r.member_id, r.rule_id, r.rule_code, r.rule_title, r.occurred_on, r.note, r.penalty_kind, r.penalty_qty, r.penalty_detail,
         r.penalty_starts_on, r.penalty_ends_on, r.status, ${PHASE_SQL} AS phase, r.completed_at, r.waived_at, r.waive_reason, r.created_at,
         (r.member_id = app.current_member_id()) AS is_mine,
         ${personCols("mb")}, COALESCE(rb.display_name, rb.full_name) AS recorder_name
    FROM discipline_records r
    ${personJoin("mb", "r.member_id")}
    LEFT JOIN members rb ON rb.user_id = r.created_by`;

const toRecord = (r: Row): DisciplineRecordDto => ({
  id: r.id,
  memberId: r.member_id,
  memberName: toPerson(r, "mb").name,
  memberRoom: r.mb_room ?? null,
  ruleId: r.rule_id,
  ruleCode: r.rule_code,
  ruleTitle: r.rule_title,
  occurredOn: iso(r.occurred_on).slice(0, 10),
  note: r.note,
  penaltyKind: r.penalty_kind,
  penaltyQty: r.penalty_qty,
  penaltyDetail: r.penalty_detail,
  penaltyStartsOn: r.penalty_starts_on ? iso(r.penalty_starts_on).slice(0, 10) : null,
  penaltyEndsOn: r.penalty_ends_on ? iso(r.penalty_ends_on).slice(0, 10) : null,
  status: r.status,
  phase: r.phase,
  completedAt: isoOrNull(r.completed_at),
  waivedAt: isoOrNull(r.waived_at),
  waiveReason: r.waive_reason,
  recordedByName: r.recorder_name ?? null,
  createdAt: iso(r.created_at),
  isMine: !!r.is_mine,
});

/** Tổng hợp số liệu từ danh sách bản ghi đã lọc. */
export function summarize(records: DisciplineRecordDto[]): DisciplineSummary {
  const byKind = new Map<PenaltyKind, { count: number; qty: number }>();
  let active = 0;
  let overdue = 0;
  let completed = 0;
  let waived = 0;
  for (const r of records) {
    if (r.phase === "upcoming" || r.phase === "serving" || r.phase === "overdue") active++;
    if (r.phase === "overdue") overdue++;
    if (r.phase === "completed") completed++;
    if (r.phase === "waived") waived++;
    if (r.phase !== "waived" && r.penaltyKind !== "none") {
      const cur = byKind.get(r.penaltyKind) ?? { count: 0, qty: 0 };
      cur.count += 1;
      cur.qty += r.penaltyQty ?? 0;
      byKind.set(r.penaltyKind, cur);
    }
  }
  return {
    total: records.length,
    active,
    overdue,
    completed,
    waived,
    byKind: PENALTY_KINDS.filter((k) => byKind.has(k)).map((k) => ({ kind: k, count: byKind.get(k)!.count, qty: byKind.get(k)!.qty })),
  };
}

export async function listRecords(tx: Tx, q: DisciplineQuery): Promise<DisciplineListDto> {
  const p = await permissions(tx, ["discipline.read", "discipline.manage"] as const);
  const canReadAll = p["discipline.read"] || p["discipline.manage"];
  const where: string[] = [];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replace("?", `$${vals.length}`));
  };
  if (q.mine || !canReadAll) where.push("r.member_id = app.current_member_id()");
  else if (q.memberId) add("r.member_id = ?::uuid", q.memberId);
  if (q.from) add("r.occurred_on >= ?::date", q.from);
  if (q.to) add("r.occurred_on <= ?::date", q.to);
  if (q.q?.trim()) {
    vals.push(`%${q.q.trim().replace(/[%_\\]/g, "")}%`);
    const n = vals.length;
    where.push(`(r.rule_title ILIKE $${n} OR COALESCE(r.note, '') ILIKE $${n} OR mb.full_name ILIKE $${n} OR COALESCE(mb.display_name, '') ILIKE $${n})`);
  }
  const sql = `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.occurred_on DESC, r.created_at DESC LIMIT 2000`;
  const rows = (await tx.query(sql, vals)).rows;
  let records = rows.map(toRecord);
  if (q.phase === "active") records = records.filter((r) => r.phase === "upcoming" || r.phase === "serving" || r.phase === "overdue");
  else if (q.phase) records = records.filter((r) => r.phase === q.phase);
  return { canManage: p["discipline.manage"], canReadAll, records, summary: summarize(records) };
}

async function resolveRule(tx: Tx, ruleId: string): Promise<{ code: string; title: string }> {
  const r = (await tx.query<{ code: string; title: string }>("SELECT code, title FROM discipline_rules WHERE id = $1", [ruleId])).rows[0];
  if (!r) throw badRequest("Điều luật không tồn tại hoặc đã bị ẩn.");
  return r;
}

export async function createRecord(tx: Tx, b: RecordCreateInput): Promise<{ id: string; memberId: string }> {
  const p = await permissions(tx, ["discipline.manage"] as const);
  if (!p["discipline.manage"]) throw forbidden("Chỉ Trưởng nhà hoặc Admin được ghi nhận vi phạm.");
  const m = (await tx.query("SELECT 1 FROM members WHERE id = $1 AND deleted_at IS NULL", [b.memberId])).rowCount;
  if (!m) throw badRequest("Không tìm thấy thành viên.");
  const rule = b.ruleId ? await resolveRule(tx, b.ruleId) : null;
  const none = b.penaltyKind === "none";
  const r = await tx.query<{ id: string }>(
    `INSERT INTO discipline_records (member_id, rule_id, rule_code, rule_title, occurred_on, note, penalty_kind, penalty_qty, penalty_detail, penalty_starts_on, penalty_ends_on)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10::date, $11::date) RETURNING id`,
    [
      b.memberId,
      b.ruleId,
      rule?.code ?? null,
      rule?.title ?? b.ruleTitle,
      b.occurredOn,
      b.note,
      b.penaltyKind,
      none || b.penaltyKind === "other" ? null : b.penaltyQty,
      none ? null : b.penaltyDetail,
      none ? null : b.penaltyStartsOn,
      none ? null : b.penaltyEndsOn,
    ]
  );
  return { id: r.rows[0].id, memberId: b.memberId };
}

export async function updateRecord(tx: Tx, id: string, b: RecordPatchInput): Promise<void> {
  const cur = (await tx.query<Row>("SELECT * FROM discipline_records WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy bản ghi vi phạm.");
  const p = await permissions(tx, ["discipline.manage"] as const);
  if (!p["discipline.manage"]) throw forbidden("Chỉ Trưởng nhà hoặc Admin được sửa vi phạm.");

  if (b.action === "complete") {
    if (cur.status === "completed") return;
    await tx.query("UPDATE discipline_records SET status = 'completed' WHERE id = $1", [id]);
    return;
  }
  if (b.action === "waive") {
    if ((b.reason ?? "").trim().length < 5) throw badRequest("Hãy ghi lý do miễn (tối thiểu 5 ký tự).");
    await tx.query("UPDATE discipline_records SET status = 'waived', waive_reason = $2 WHERE id = $1", [id, b.reason]);
    return;
  }
  if (b.action === "reopen") {
    await tx.query("UPDATE discipline_records SET status = 'open' WHERE id = $1", [id]);
    return;
  }

  // Sửa nội dung: gộp với giá trị hiện tại rồi kiểm tra lại cả khối hình phạt
  const merged = {
    penaltyKind: (b.penaltyKind ?? cur.penalty_kind) as PenaltyKind,
    penaltyQty: b.penaltyQty !== undefined ? b.penaltyQty : cur.penalty_qty,
    penaltyDetail: b.penaltyDetail !== undefined ? b.penaltyDetail : cur.penalty_detail,
    penaltyStartsOn: b.penaltyStartsOn !== undefined ? b.penaltyStartsOn : cur.penalty_starts_on ? iso(cur.penalty_starts_on).slice(0, 10) : null,
    penaltyEndsOn: b.penaltyEndsOn !== undefined ? b.penaltyEndsOn : cur.penalty_ends_on ? iso(cur.penalty_ends_on).slice(0, 10) : null,
  };
  const check = z.object({ x: z.any() }).superRefine((_, ctx) => refinePenalty(merged, ctx)).safeParse({ x: 1 });
  if (!check.success) throw badRequest(check.error.issues[0]?.message ?? "Hình phạt không hợp lệ.");
  const none = merged.penaltyKind === "none";

  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown, cast = "") => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}${cast}`);
  };
  if (b.ruleId !== undefined) {
    if (b.ruleId) {
      const rule = await resolveRule(tx, b.ruleId);
      set("rule_id", b.ruleId);
      set("rule_code", rule.code);
      set("rule_title", rule.title);
    } else {
      if ((b.ruleTitle ?? "").trim().length < 2) throw badRequest("Ghi tên điều đã vi phạm.");
      set("rule_id", null);
      set("rule_code", null);
      set("rule_title", b.ruleTitle);
    }
  } else if (b.ruleTitle && !cur.rule_id) {
    set("rule_title", b.ruleTitle);
  }
  if (b.occurredOn) set("occurred_on", b.occurredOn, "::date");
  if (b.note !== undefined) set("note", b.note);
  set("penalty_kind", merged.penaltyKind);
  set("penalty_qty", none || merged.penaltyKind === "other" ? null : merged.penaltyQty);
  set("penalty_detail", none ? null : merged.penaltyDetail);
  set("penalty_starts_on", none ? null : merged.penaltyStartsOn, "::date");
  set("penalty_ends_on", none ? null : merged.penaltyEndsOn, "::date");
  vals.push(id);
  await tx.query(`UPDATE discipline_records SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
}

export async function deleteRecord(tx: Tx, id: string) {
  const r = await tx.query("DELETE FROM discipline_records WHERE id = $1", [id]);
  if (!r.rowCount) await denyOrMissing(tx, "discipline_records", id, "Chỉ Trưởng nhà hoặc Admin được xóa ghi nhận vi phạm.");
}

/** Báo thành viên có ghi nhận mới (vai trò luuxa_worker). Lỗi gửi không làm hỏng việc chính. */
export async function notifyDisciplineRecorded(ctx: Ctx, id: string) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const r = (await tx.query<Row>("SELECT member_id, rule_title, penalty_kind, penalty_qty, penalty_detail, penalty_starts_on, penalty_ends_on FROM discipline_records WHERE id = $1", [id])).rows[0];
      if (!r) return;
      const when = r.penalty_starts_on ? ` · từ ${iso(r.penalty_starts_on).slice(8, 10)}/${iso(r.penalty_starts_on).slice(5, 7)}` : "";
      await tx.query("SELECT app.fn_notify($1, 'system.discipline_recorded', $2, $3, $4::jsonb, 'discipline_records', $5)", [
        r.member_id,
        "Có ghi nhận mới ở mục Vi phạm & kỷ luật",
        `${r.rule_title} — ${penaltyText(r.penalty_kind, r.penalty_qty, r.penalty_detail)}${when}`,
        JSON.stringify({ link: "/ky-luat" }),
        id,
      ]);
    });
  } catch (e) {
    console.error("[discipline] báo thành viên lỗi:", (e as Error).message);
  }
}

