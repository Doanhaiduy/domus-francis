import "server-only";
import { z } from "zod";
import { batch, type Tx } from "../db";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../errors";
import { zDate, zText, zUuid } from "../http";
import {
  ACADEMIC_YEAR_CODE_RE,
  SEMESTER_CODES,
  SEMESTER_LABEL,
  TERM_STATUS_LABEL,
  UNIVERSITY_CODE_RE,
  fmtRange,
  type AcademicConfigDto,
  type AcademicConfigPermissions,
  type AcademicYearDto,
  type AcademicYearInput,
  type AcademicYearPatch,
  type BoardTermDto,
  type BoardTermInput,
  type BoardTermPatch,
  type ConfigSemesterDto,
  type SemesterCode,
  type SemesterInput,
  type SemesterPatch,
  type TermStatus,
  type UniversityDto,
  type UniversityInput,
  type UniversityPatch,
} from "@/lib/types/academic-config";

// =====================================================================
// Cài đặt → Danh mục học tập: trường đại học, năm học (+ học kỳ), nhiệm kỳ người quản lý.
//   • Quyền: trường — academic.university.manage (db/app/997, Admin + Trưởng nhà) hoặc academic.scale.manage;
//            năm học/học kỳ/nhiệm kỳ — term.manage; đóng/mở lại nhiệm kỳ — thêm term.handover.
//     Kiểm trước để trả 403 rõ ràng; RLS của thiết kế (46_rls_policies_1 + 997) là lớp thứ hai.
//   • Xóa: trường = xóa mềm (deleted_at; trường đang được dùng bị trigger chặn ⇒ "Tạm ẩn" is_active=false);
//          năm học/học kỳ/nhiệm kỳ = xóa thật khi CHƯA có dữ liệu tham chiếu (trigger 997 + khóa ngoại ⇒ 409).
//   • Đặt năm học hiện hành: bỏ cờ năm khác rồi đặt cờ năm được chọn trong CÙNG giao dịch (chỉ mục duy nhất ux_academic_years__current).
// =====================================================================

type Row = Record<string, any>;
type Q = [sql: string, params?: unknown[]];

// ---------------------------------------------------------------------
// Quyền + mức sử dụng
// ---------------------------------------------------------------------
const PERMS_SQL = `SELECT app.has_permission('academic.university.manage') OR app.has_permission('academic.scale.manage') AS universities,
                          app.has_permission('term.manage') AS terms, app.has_permission('term.handover') AS handover`;

async function permissions(tx: Tx): Promise<AcademicConfigPermissions> {
  const r = (await tx.query(PERMS_SQL)).rows[0] ?? {};
  return { universities: !!r.universities, terms: !!r.terms, handover: !!r.handover };
}

function assertUniversities(p: AcademicConfigPermissions) {
  if (!p.universities) throw forbidden("Bạn không có quyền quản lý danh mục trường đại học (Admin hoặc Trưởng nhà).");
}
function assertTerms(p: AcademicConfigPermissions) {
  if (!p.terms) throw forbidden("Bạn không có quyền quản lý năm học, học kỳ, nhiệm kỳ (cần quyền \"Quản lý năm học, học kỳ, nhiệm kỳ\").");
}

type Usage = Map<string, number>;
async function loadUsage(tx: Tx, p: AcademicConfigPermissions): Promise<Usage | null> {
  if (!p.universities && !p.terms) return null;
  const rows = (await tx.query("SELECT entity, id, refs FROM app.fn_academic_lookup_usage()")).rows;
  return new Map(rows.map((r) => [`${r.entity}:${r.id}`, Number(r.refs)]));
}
const use = (u: Usage | null, entity: string, id: string) => (u ? (u.get(`${entity}:${id}`) ?? 0) : null);

// ---------------------------------------------------------------------
// Đọc (câu SQL + ánh xạ để gộp vào một batch)
// ---------------------------------------------------------------------
const UNIVERSITIES_Q: Q = [
  `SELECT id, code, name, short_name, city, is_active, deleted_at FROM universities
    ORDER BY (deleted_at IS NOT NULL), NOT is_active, name`,
];
const YEARS_Q: Q = [
  `SELECT id, code, name, starts_on, ends_on, is_current, (app.local_today() BETWEEN starts_on AND ends_on) AS ongoing
     FROM academic_years ORDER BY starts_on DESC`,
];
const SEMESTERS_Q: Q = [
  `SELECT id, academic_year_id, code, name, ordinal, starts_on, ends_on, (app.local_today() BETWEEN starts_on AND ends_on) AS ongoing
     FROM semesters ORDER BY starts_on`,
];
const TERMS_Q: Q = [
  `SELECT b.id, b.academic_year_id, y.name AS year_name, b.name, b.starts_on, b.ends_on, b.status::text AS status, b.closed_at, b.handover_notes
     FROM board_terms b LEFT JOIN academic_years y ON y.id = b.academic_year_id
    ORDER BY b.starts_on DESC`,
];

const isoOrNull = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

function toUniversity(r: Row, u: Usage | null): UniversityDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    shortName: r.short_name ?? null,
    city: r.city ?? null,
    isActive: !!r.is_active,
    deletedAt: isoOrNull(r.deleted_at),
    usage: use(u, "university", r.id),
  };
}

function toSemester(r: Row, u: Usage | null): ConfigSemesterDto {
  return {
    id: r.id,
    academicYearId: r.academic_year_id,
    code: r.code,
    codeLabel: SEMESTER_LABEL[r.code as SemesterCode] ?? r.code,
    name: r.name,
    ordinal: r.ordinal,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    isOngoing: !!r.ongoing,
    usage: use(u, "semester", r.id),
  };
}

function toYears(rows: Row[], sems: Row[], u: Usage | null): AcademicYearDto[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    isCurrent: !!r.is_current,
    isOngoing: !!r.ongoing,
    semesters: sems.filter((s) => s.academic_year_id === r.id).map((s) => toSemester(s, u)),
    usage: use(u, "academic_year", r.id),
  }));
}

function toTerm(r: Row, u: Usage | null): BoardTermDto {
  return {
    id: r.id,
    academicYearId: r.academic_year_id ?? null,
    academicYearName: r.year_name ?? null,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status as TermStatus,
    statusLabel: TERM_STATUS_LABEL[r.status as TermStatus] ?? r.status,
    closedAt: isoOrNull(r.closed_at),
    handoverNotes: r.handover_notes ?? null,
    usage: use(u, "board_term", r.id),
  };
}

/** Toàn bộ danh mục cho tab Cài đặt (1 vòng mạng; người quản lý thêm 1 vòng lấy mức sử dụng). */
export async function getConfig(tx: Tx): Promise<AcademicConfigDto> {
  const [permR, uniR, yearR, semR, termR, todayR] = await batch(tx, [
    [PERMS_SQL],
    UNIVERSITIES_Q,
    YEARS_Q,
    SEMESTERS_Q,
    TERMS_Q,
    ["SELECT app.local_today()::text AS d"],
  ]);
  const p0 = permR.rows[0] ?? {};
  const p: AcademicConfigPermissions = { universities: !!p0.universities, terms: !!p0.terms, handover: !!p0.handover };
  const u = await loadUsage(tx, p);
  // Người không quản lý danh mục trường chỉ thấy trường đang dùng (RLS đã ẩn trường xóa mềm)
  const uniRows = p.universities ? uniR.rows : uniR.rows.filter((r) => r.is_active && !r.deleted_at);
  return {
    universities: uniRows.map((r) => toUniversity(r, u)),
    years: toYears(yearR.rows, semR.rows, u),
    boardTerms: termR.rows.map((r) => toTerm(r, u)),
    today: todayR.rows[0].d,
    permissions: p,
  };
}

export async function listUniversities(tx: Tx): Promise<UniversityDto[]> {
  return (await getConfig(tx)).universities;
}
export async function listYears(tx: Tx): Promise<AcademicYearDto[]> {
  return (await getConfig(tx)).years;
}
export async function listSemesters(tx: Tx, yearId: string | null): Promise<ConfigSemesterDto[]> {
  const years = (await getConfig(tx)).years;
  return years.filter((y) => !yearId || y.id === yearId).flatMap((y) => y.semesters);
}
export async function listBoardTerms(tx: Tx): Promise<BoardTermDto[]> {
  return (await getConfig(tx)).boardTerms;
}

// ---------------------------------------------------------------------
// Schema body
// ---------------------------------------------------------------------
const zUniCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Mã trường tối thiểu 2 ký tự.")
      .max(20, "Mã trường tối đa 20 ký tự.")
      .regex(UNIVERSITY_CODE_RE, "Mã trường chỉ gồm chữ in hoa không dấu, số và dấu gạch dưới (VD: HUST, VNU_UET)."),
  );
const zOptText = (max: number, label: string) => z.string().trim().max(max, `${label} tối đa ${max} ký tự.`).nullable().optional();

export const UniversityCreateSchema = z.object({
  code: zUniCode,
  name: zText(2, 200, "Tên trường"),
  shortName: zOptText(100, "Tên viết tắt"),
  city: zOptText(100, "Tỉnh/thành"),
  isActive: z.boolean().optional(),
});
export const UniversityPatchSchema = z.object({
  code: zUniCode.optional(),
  name: zText(2, 200, "Tên trường").optional(),
  shortName: zOptText(100, "Tên viết tắt"),
  city: zOptText(100, "Tỉnh/thành"),
  isActive: z.boolean().optional(),
  restore: z.boolean().optional(),
});

const zYearCode = z
  .string()
  .trim()
  .regex(ACADEMIC_YEAR_CODE_RE, "Mã năm học có dạng YYYY-YYYY (VD: 2027-2028).")
  .refine((s) => Number(s.slice(5, 9)) === Number(s.slice(0, 4)) + 1, "Năm sau trong mã phải lớn hơn năm trước đúng 1 (VD: 2027-2028).");
const zSemCode = z.enum(SEMESTER_CODES, { message: "Mã học kỳ phải là HK1, HK2 hoặc HE (học kỳ hè)." });
const SemesterDraftSchema = z.object({
  code: zSemCode,
  name: zText(2, 60, "Tên học kỳ").nullable().optional(),
  startsOn: zDate,
  endsOn: zDate,
});

export const AcademicYearCreateSchema = z.object({
  code: zYearCode,
  name: zText(2, 100, "Tên năm học"),
  startsOn: zDate,
  endsOn: zDate,
  isCurrent: z.boolean().optional(),
  semesters: z.array(SemesterDraftSchema).max(3, "Một năm học có tối đa 3 học kỳ (HK1, HK2, HE).").optional(),
});
export const AcademicYearPatchSchema = z.object({
  code: zYearCode.optional(),
  name: zText(2, 100, "Tên năm học").optional(),
  startsOn: zDate.optional(),
  endsOn: zDate.optional(),
  isCurrent: z.literal(true, { message: "Chỉ đặt được năm học hiện hành (chọn năm khác làm hiện hành thay vì bỏ cờ)." }).optional(),
});

export const SemesterCreateSchema = SemesterDraftSchema.extend({ academicYearId: zUuid });
export const SemesterPatchSchema = z.object({
  code: zSemCode.optional(),
  name: zText(2, 60, "Tên học kỳ").nullable().optional(),
  startsOn: zDate.optional(),
  endsOn: zDate.optional(),
});

export const BoardTermCreateSchema = z.object({
  name: zText(3, 100, "Tên nhiệm kỳ"),
  academicYearId: zUuid.nullable().optional(),
  startsOn: zDate,
  endsOn: zDate,
  status: z.enum(["planned", "active"], { message: "Trạng thái nhiệm kỳ mới phải là Sắp tới hoặc Đang hiệu lực." }).optional(),
  handoverNotes: zOptText(5000, "Biên bản bàn giao"),
});
export const BoardTermPatchSchema = z.object({
  name: zText(3, 100, "Tên nhiệm kỳ").optional(),
  academicYearId: zUuid.nullable().optional(),
  startsOn: zDate.optional(),
  endsOn: zDate.optional(),
  status: z.enum(["planned", "active", "closed"], { message: "Trạng thái nhiệm kỳ không hợp lệ." }).optional(),
  handoverNotes: zOptText(5000, "Biên bản bàn giao"),
});

// ---------------------------------------------------------------------
// Tiện ích lỗi
// ---------------------------------------------------------------------
const pgCode = (e: unknown) => (e as { code?: string })?.code;
const pgConstraint = (e: unknown) => (e as { constraint?: string })?.constraint;

function assertRange(startsOn: string, endsOn: string, what: string) {
  if (endsOn <= startsOn) throw badRequest(`Ngày kết thúc ${what} phải sau ngày bắt đầu.`, [{ field: "endsOn", message: "Ngày kết thúc phải sau ngày bắt đầu." }]);
}

/** Chạy một câu ghi; lỗi khóa ngoại có tên ràng buộc (FK thật, không phải trigger 997 đã có câu chữ riêng) ⇒ 409 với thông điệp cho trước. */
async function guard<T>(fn: () => Promise<T>, msgs: { fk?: string; overlap?: string; duplicate?: string }): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = pgCode(e);
    if (code === "23503" && pgConstraint(e) && msgs.fk) throw new ApiError(409, "IN_USE", msgs.fk);
    if (code === "23P01" && msgs.overlap) throw new ApiError(409, "OVERLAP", msgs.overlap);
    if (code === "23505" && msgs.duplicate) throw new ApiError(409, "DUPLICATE", msgs.duplicate);
    throw e;
  }
}

// ---------------------------------------------------------------------
// Trường đại học
// ---------------------------------------------------------------------
async function getUniversity(tx: Tx, id: string): Promise<UniversityDto> {
  const r = (await tx.query("SELECT id, code, name, short_name, city, is_active, deleted_at FROM universities WHERE id = $1", [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy trường.");
  return toUniversity(r, null);
}

async function assertUniversityCodeFree(tx: Tx, code: string, exceptId: string | null) {
  const dup = (
    await tx.query("SELECT name, deleted_at FROM universities WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)", [code, exceptId])
  ).rows[0];
  if (dup)
    throw conflict(
      dup.deleted_at
        ? `Mã "${code}" thuộc trường "${dup.name}" đã xóa — hãy khôi phục trường đó trong mục "Đã xóa" thay vì tạo mới.`
        : `Mã "${code}" đã được dùng cho trường "${dup.name}".`,
      "DUPLICATE_CODE",
    );
}

export async function createUniversity(tx: Tx, b: UniversityInput): Promise<UniversityDto> {
  assertUniversities(await permissions(tx));
  await assertUniversityCodeFree(tx, b.code, null);
  const id = (
    await guard(
      () =>
        tx.query<{ id: string }>(
          "INSERT INTO universities (code, name, short_name, city, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [b.code, b.name.trim(), b.shortName?.trim() || null, b.city?.trim() || null, b.isActive ?? true],
        ),
      { duplicate: `Mã "${b.code}" đã được dùng cho trường khác.` },
    )
  ).rows[0].id;
  return getUniversity(tx, id);
}

export async function updateUniversity(tx: Tx, id: string, p: UniversityPatch): Promise<UniversityDto> {
  assertUniversities(await permissions(tx));
  const cur = (await tx.query("SELECT id, code, name, short_name, city, is_active, deleted_at FROM universities WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy trường.");
  const code = p.code ?? cur.code;
  if (code !== cur.code) await assertUniversityCodeFree(tx, code, id);
  await guard(
    () =>
      tx.query(
        `UPDATE universities SET code = $2, name = $3, short_name = $4, city = $5, is_active = $6,
                deleted_at = CASE WHEN $7::boolean THEN NULL ELSE deleted_at END
          WHERE id = $1`,
        [
          id,
          code,
          (p.name ?? cur.name).trim(),
          p.shortName !== undefined ? p.shortName?.trim() || null : cur.short_name,
          p.city !== undefined ? p.city?.trim() || null : cur.city,
          p.isActive ?? cur.is_active,
          !!p.restore,
        ],
      ),
    { duplicate: `Mã "${code}" đã được dùng cho trường khác.` },
  );
  return getUniversity(tx, id);
}

/** Xóa mềm; trường đang có hồ sơ sinh viên/bảng điểm/môn học/thang điểm ⇒ 409 (trigger 997) — dùng "Tạm ẩn". */
export async function deleteUniversity(tx: Tx, id: string): Promise<void> {
  assertUniversities(await permissions(tx));
  const r = await tx.query("UPDATE universities SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy trường (hoặc trường đã bị xóa).");
}

// ---------------------------------------------------------------------
// Năm học
// ---------------------------------------------------------------------
async function getYear(tx: Tx, id: string): Promise<AcademicYearDto> {
  const [yr, sr] = await batch(tx, [
    [
      `SELECT id, code, name, starts_on, ends_on, is_current, (app.local_today() BETWEEN starts_on AND ends_on) AS ongoing
         FROM academic_years WHERE id = $1`,
      [id],
    ],
    [
      `SELECT id, academic_year_id, code, name, ordinal, starts_on, ends_on, (app.local_today() BETWEEN starts_on AND ends_on) AS ongoing
         FROM semesters WHERE academic_year_id = $1 ORDER BY starts_on`,
      [id],
    ],
  ]);
  if (!yr.rows[0]) throw notFound("Không tìm thấy năm học.");
  return toYears(yr.rows, sr.rows, null)[0];
}

/** Kiểm trùng mã + chồng lấn thời gian với năm học khác (thông điệp nêu tên năm bị trùng). */
async function assertYearFree(tx: Tx, code: string, startsOn: string, endsOn: string, exceptId: string | null) {
  const [dupR, overR] = await batch(tx, [
    ["SELECT name FROM academic_years WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)", [code, exceptId]],
    [
      `SELECT name, starts_on, ends_on FROM academic_years
        WHERE daterange(starts_on, ends_on, '[]') && daterange($1::date, $2::date, '[]') AND ($3::uuid IS NULL OR id <> $3::uuid)
        ORDER BY starts_on LIMIT 1`,
      [startsOn, endsOn, exceptId],
    ],
  ]);
  if (dupR.rows[0]) throw conflict(`Mã năm học "${code}" đã có ("${dupR.rows[0].name}").`, "DUPLICATE_CODE");
  const o = overR.rows[0];
  if (o) throw conflict(`Khoảng thời gian trùng với "${o.name}" (${fmtRange(o.starts_on, o.ends_on)}) — các năm học không được chồng lấn.`, "OVERLAP");
}

async function setCurrentYear(tx: Tx, id: string) {
  // Hai câu nối tiếp trong CÙNG giao dịch: chỉ mục duy nhất ux_academic_years__current kiểm theo từng dòng
  await tx.query("UPDATE academic_years SET is_current = false WHERE is_current AND id <> $1", [id]);
  await tx.query("UPDATE academic_years SET is_current = true WHERE id = $1 AND NOT is_current", [id]);
}

function checkSemesterDrafts(semesters: { code: string; startsOn: string; endsOn: string }[], startsOn: string, endsOn: string) {
  const seen = new Set<string>();
  semesters.forEach((s, i) => {
    if (seen.has(s.code)) throw badRequest(`Học kỳ ${s.code} bị lặp.`, [{ field: `semesters.${i}.code`, message: "Mã học kỳ bị lặp." }]);
    seen.add(s.code);
    assertRange(s.startsOn, s.endsOn, `học kỳ ${s.code}`);
    if (s.startsOn < startsOn || s.endsOn > endsOn)
      throw badRequest(`${SEMESTER_LABEL[s.code as SemesterCode] ?? s.code} phải nằm trong năm học (${fmtRange(startsOn, endsOn)}).`, [
        { field: `semesters.${i}.startsOn`, message: "Học kỳ phải nằm trong năm học." },
      ]);
  });
  const sorted = [...semesters].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].startsOn <= sorted[i - 1].endsOn) throw badRequest(`${sorted[i - 1].code} và ${sorted[i].code} bị chồng thời gian.`);
}

export async function createYear(tx: Tx, b: AcademicYearInput): Promise<AcademicYearDto> {
  assertTerms(await permissions(tx));
  assertRange(b.startsOn, b.endsOn, "năm học");
  const sems = b.semesters ?? [];
  checkSemesterDrafts(sems, b.startsOn, b.endsOn);
  await assertYearFree(tx, b.code, b.startsOn, b.endsOn, null);
  const id = (
    await guard(
      () =>
        tx.query<{ id: string }>("INSERT INTO academic_years (code, name, starts_on, ends_on) VALUES ($1, $2, $3, $4) RETURNING id", [
          b.code,
          b.name.trim(),
          b.startsOn,
          b.endsOn,
        ]),
      { overlap: "Khoảng thời gian trùng với một năm học khác.", duplicate: `Mã năm học "${b.code}" đã có.` },
    )
  ).rows[0].id;
  for (const s of sems) {
    await tx.query(
      `INSERT INTO semesters (academic_year_id, code, name, ordinal, starts_on, ends_on) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, s.code, s.name?.trim() || SEMESTER_LABEL[s.code], SEMESTER_CODES.indexOf(s.code) + 1, s.startsOn, s.endsOn],
    );
  }
  if (b.isCurrent) await setCurrentYear(tx, id);
  return getYear(tx, id);
}

export async function updateYear(tx: Tx, id: string, p: AcademicYearPatch): Promise<AcademicYearDto> {
  assertTerms(await permissions(tx));
  const cur = (await tx.query("SELECT id, code, name, starts_on, ends_on FROM academic_years WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy năm học.");
  const next = {
    code: p.code ?? cur.code,
    name: (p.name ?? cur.name).trim(),
    startsOn: p.startsOn ?? cur.starts_on,
    endsOn: p.endsOn ?? cur.ends_on,
  };
  assertRange(next.startsOn, next.endsOn, "năm học");
  if (next.code !== cur.code || next.startsOn !== cur.starts_on || next.endsOn !== cur.ends_on)
    await assertYearFree(tx, next.code, next.startsOn, next.endsOn, id);
  // Trigger 997 chặn khoảng mới không còn chứa hết học kỳ đã có (422 kèm lý do)
  await guard(
    () => tx.query("UPDATE academic_years SET code = $2, name = $3, starts_on = $4, ends_on = $5 WHERE id = $1", [id, next.code, next.name, next.startsOn, next.endsOn]),
    { overlap: "Khoảng thời gian trùng với một năm học khác.", duplicate: `Mã năm học "${next.code}" đã có.` },
  );
  if (p.isCurrent) await setCurrentYear(tx, id);
  return getYear(tx, id);
}

/** Xóa năm học (kèm học kỳ trống) khi chưa có dữ liệu tham chiếu — trigger 997 nêu lý do (409). */
export async function deleteYear(tx: Tx, id: string): Promise<void> {
  assertTerms(await permissions(tx));
  const r = await guard(() => tx.query("DELETE FROM academic_years WHERE id = $1", [id]), {
    fk: "Đang có bảng điểm/kỳ thu dùng năm học này — không xóa được.",
  });
  if (!r.rowCount) throw notFound("Không tìm thấy năm học.");
}

// ---------------------------------------------------------------------
// Học kỳ
// ---------------------------------------------------------------------
async function getSemester(tx: Tx, id: string): Promise<ConfigSemesterDto> {
  const r = (
    await tx.query(
      `SELECT id, academic_year_id, code, name, ordinal, starts_on, ends_on, (app.local_today() BETWEEN starts_on AND ends_on) AS ongoing
         FROM semesters WHERE id = $1`,
      [id],
    )
  ).rows[0];
  if (!r) throw notFound("Không tìm thấy học kỳ.");
  return toSemester(r, null);
}

async function semesterChecks(tx: Tx, yearId: string, code: string, startsOn: string, endsOn: string, exceptId: string | null) {
  const [yearR, dupR, overR] = await batch(tx, [
    ["SELECT name, starts_on, ends_on FROM academic_years WHERE id = $1", [yearId]],
    ["SELECT name FROM semesters WHERE academic_year_id = $1 AND code = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)", [yearId, code, exceptId]],
    [
      `SELECT name FROM semesters
        WHERE academic_year_id = $1 AND daterange(starts_on, ends_on, '[]') && daterange($2::date, $3::date, '[]')
          AND ($4::uuid IS NULL OR id <> $4::uuid) LIMIT 1`,
      [yearId, startsOn, endsOn, exceptId],
    ],
  ]);
  const y = yearR.rows[0];
  if (!y) throw badRequest("Năm học không tồn tại.", [{ field: "academicYearId", message: "Năm học không tồn tại." }]);
  if (dupR.rows[0]) throw conflict(`${y.name} đã có ${SEMESTER_LABEL[code as SemesterCode] ?? code}.`, "DUPLICATE_CODE");
  if (startsOn < y.starts_on || endsOn > y.ends_on)
    throw badRequest(`Học kỳ phải nằm trong ${y.name} (${fmtRange(y.starts_on, y.ends_on)}).`, [{ field: "startsOn", message: "Học kỳ phải nằm trong năm học." }]);
  if (overR.rows[0]) throw conflict(`Thời gian trùng với "${overR.rows[0].name}" của cùng năm học.`, "OVERLAP");
}

export async function createSemester(tx: Tx, b: SemesterInput): Promise<ConfigSemesterDto> {
  assertTerms(await permissions(tx));
  assertRange(b.startsOn, b.endsOn, "học kỳ");
  await semesterChecks(tx, b.academicYearId, b.code, b.startsOn, b.endsOn, null);
  const id = (
    await guard(
      () =>
        tx.query<{ id: string }>(
          "INSERT INTO semesters (academic_year_id, code, name, ordinal, starts_on, ends_on) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
          [b.academicYearId, b.code, b.name?.trim() || SEMESTER_LABEL[b.code], SEMESTER_CODES.indexOf(b.code) + 1, b.startsOn, b.endsOn],
        ),
      { overlap: "Thời gian trùng với học kỳ khác của cùng năm học.", duplicate: "Năm học này đã có học kỳ cùng mã." },
    )
  ).rows[0].id;
  return getSemester(tx, id);
}

export async function updateSemester(tx: Tx, id: string, p: SemesterPatch): Promise<ConfigSemesterDto> {
  assertTerms(await permissions(tx));
  const cur = (await tx.query("SELECT id, academic_year_id, code, name, starts_on, ends_on FROM semesters WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy học kỳ.");
  const code = (p.code ?? cur.code) as SemesterCode;
  const startsOn = p.startsOn ?? cur.starts_on;
  const endsOn = p.endsOn ?? cur.ends_on;
  const name = p.name !== undefined ? p.name?.trim() || SEMESTER_LABEL[code] : cur.name;
  assertRange(startsOn, endsOn, "học kỳ");
  await semesterChecks(tx, cur.academic_year_id, code, startsOn, endsOn, id);
  await guard(
    () =>
      tx.query("UPDATE semesters SET code = $2, name = $3, ordinal = $4, starts_on = $5, ends_on = $6 WHERE id = $1", [
        id,
        code,
        name,
        SEMESTER_CODES.indexOf(code) + 1,
        startsOn,
        endsOn,
      ]),
    { overlap: "Thời gian trùng với học kỳ khác của cùng năm học.", duplicate: "Năm học này đã có học kỳ cùng mã." },
  );
  return getSemester(tx, id);
}

export async function deleteSemester(tx: Tx, id: string): Promise<void> {
  assertTerms(await permissions(tx));
  const r = await guard(() => tx.query("DELETE FROM semesters WHERE id = $1", [id]), {
    fk: "Đang có bảng điểm dùng học kỳ này — không xóa được.",
  });
  if (!r.rowCount) throw notFound("Không tìm thấy học kỳ.");
}

// ---------------------------------------------------------------------
// Nhiệm kỳ người quản lý
// ---------------------------------------------------------------------
async function getTerm(tx: Tx, id: string): Promise<BoardTermDto> {
  const r = (await tx.query(`${TERMS_Q[0].replace(/ORDER BY[\s\S]*$/, "")} WHERE b.id = $1`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy nhiệm kỳ.");
  return toTerm(r, null);
}

async function termChecks(tx: Tx, t: { academicYearId: string | null; startsOn: string; endsOn: string; status: TermStatus }, exceptId: string | null) {
  const [yearR, overR, activeR] = await batch(tx, [
    ["SELECT 1 FROM academic_years WHERE id = $1", [t.academicYearId]],
    [
      `SELECT name, starts_on, ends_on FROM board_terms
        WHERE daterange(starts_on, ends_on, '[]') && daterange($1::date, $2::date, '[]') AND ($3::uuid IS NULL OR id <> $3::uuid)
        ORDER BY starts_on LIMIT 1`,
      [t.startsOn, t.endsOn, exceptId],
    ],
    ["SELECT name FROM board_terms WHERE status = 'active' AND ($1::uuid IS NULL OR id <> $1::uuid) LIMIT 1", [exceptId]],
  ]);
  if (t.academicYearId && !yearR.rows[0]) throw badRequest("Năm học không tồn tại.", [{ field: "academicYearId", message: "Năm học không tồn tại." }]);
  const o = overR.rows[0];
  if (o) throw conflict(`Thời gian trùng với "${o.name}" (${fmtRange(o.starts_on, o.ends_on)}) — các nhiệm kỳ không được chồng lấn.`, "OVERLAP");
  if (t.status === "active" && activeR.rows[0])
    throw conflict(`"${activeR.rows[0].name}" đang hiệu lực — hãy bàn giao (đóng) nhiệm kỳ đó trước khi kích hoạt nhiệm kỳ mới.`, "ACTIVE_EXISTS");
}

export async function createBoardTerm(tx: Tx, b: BoardTermInput): Promise<BoardTermDto> {
  assertTerms(await permissions(tx));
  assertRange(b.startsOn, b.endsOn, "nhiệm kỳ");
  const status = b.status ?? "planned";
  await termChecks(tx, { academicYearId: b.academicYearId ?? null, startsOn: b.startsOn, endsOn: b.endsOn, status }, null);
  const id = (
    await guard(
      () =>
        tx.query<{ id: string }>(
          `INSERT INTO board_terms (academic_year_id, name, starts_on, ends_on, status, handover_notes)
           VALUES ($1, $2, $3, $4, $5::term_status_t, $6) RETURNING id`,
          [b.academicYearId ?? null, b.name.trim(), b.startsOn, b.endsOn, status, b.handoverNotes?.trim() || null],
        ),
      { overlap: "Thời gian trùng với một nhiệm kỳ khác.", duplicate: "Đang có nhiệm kỳ khác hiệu lực." },
    )
  ).rows[0].id;
  return getTerm(tx, id);
}

export async function updateBoardTerm(tx: Tx, id: string, p: BoardTermPatch): Promise<BoardTermDto> {
  const perms = await permissions(tx);
  assertTerms(perms);
  const cur = (
    await tx.query("SELECT id, academic_year_id, name, starts_on, ends_on, status::text AS status, handover_notes FROM board_terms WHERE id = $1", [id])
  ).rows[0];
  if (!cur) throw notFound("Không tìm thấy nhiệm kỳ.");
  const next = {
    name: (p.name ?? cur.name).trim(),
    academicYearId: p.academicYearId !== undefined ? p.academicYearId : cur.academic_year_id,
    startsOn: p.startsOn ?? cur.starts_on,
    endsOn: p.endsOn ?? cur.ends_on,
    status: (p.status ?? cur.status) as TermStatus,
    handoverNotes: p.handoverNotes !== undefined ? p.handoverNotes?.trim() || null : cur.handover_notes,
  };
  const closing = next.status === "closed" && cur.status !== "closed";
  const reopening = cur.status === "closed" && next.status !== "closed";
  if ((closing || reopening) && !perms.handover)
    throw forbidden(closing ? "Đóng (bàn giao) nhiệm kỳ cần quyền \"Đóng nhiệm kỳ và bàn giao chức vụ\"." : "Mở lại nhiệm kỳ đã bàn giao cần quyền \"Đóng nhiệm kỳ và bàn giao chức vụ\".");
  assertRange(next.startsOn, next.endsOn, "nhiệm kỳ");
  await termChecks(tx, next, id);
  await guard(
    () =>
      tx.query(
        `UPDATE board_terms
            SET name = $2, academic_year_id = $3, starts_on = $4, ends_on = $5, status = $6::term_status_t, handover_notes = $7,
                closed_at = CASE WHEN $6::text = 'closed' THEN COALESCE(closed_at, now()) ELSE NULL END,
                closed_by = CASE WHEN $6::text = 'closed' THEN COALESCE(closed_by, app.current_user_id()) ELSE NULL END
          WHERE id = $1`,
        [id, next.name, next.academicYearId, next.startsOn, next.endsOn, next.status, next.handoverNotes],
      ),
    { overlap: "Thời gian trùng với một nhiệm kỳ khác.", duplicate: "Đang có nhiệm kỳ khác hiệu lực." },
  );
  return getTerm(tx, id);
}

export async function deleteBoardTerm(tx: Tx, id: string): Promise<void> {
  assertTerms(await permissions(tx));
  const cur = (await tx.query("SELECT status::text AS status, name FROM board_terms WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy nhiệm kỳ.");
  if (cur.status === "active") throw conflict(`"${cur.name}" đang hiệu lực — không xóa được (hãy bàn giao trước).`, "TERM_ACTIVE");
  await guard(() => tx.query("DELETE FROM board_terms WHERE id = $1", [id]), {
    fk: "Nhiệm kỳ đang gắn với chức vụ/vai trò của thành viên — không xóa được.",
  });
}
