import "server-only";
import { batch, type Tx } from "../db";
import { ApiError, notFound } from "../errors";
import type {
  AcademicAction,
  AcademicMetaDto,
  AcademicRecordDto,
  AcademicStatus,
  AcademicSummaryDto,
  GoalsVisibility,
  SemesterDto,
  SubjectDto,
} from "@/lib/types/academic";
import type { RecordInput } from "./academic-schema";

// =====================================================================
// Học tập — mọi quyền đọc/ghi do RLS + trigger của DB quyết định:
//   • đọc: chính chủ; Ban điều hành (academic.read_all) chỉ thấy bảng điểm đã nộp/xác minh của người còn đồng ý
//     academic_share_leadership (app.can_view_academic);
//   • ghi: chỉ chính chủ (bảng điểm, điểm môn, minh chứng, nguyện vọng, yêu cầu phụ đạo);
//   • tổng kết môn/điểm chữ/điểm hệ 4/đạt-nợ do trg_grade_records__compute tính theo thang của bảng điểm;
//   • GPA học kỳ/tích lũy do app.fn_recompute_gpa ghi vào gpa_snapshots khi nộp/xác minh;
//   • trả lại/mở lại của người xác minh đi qua app.fn_academic_review (db/app/93_academic.sql).
// =====================================================================

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

type Q = [sql: string, params?: unknown[]];

/**
 * Chạy các câu SQL ĐỘC LẬP trong MỘT vòng mạng (DB ở xa). Phần tử null = câu không cần chạy (như code cũ bỏ qua)
 * ⇒ trả về mảng rỗng ở đúng vị trí đó.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchRows(tx: Tx, items: (Q | null)[]): Promise<any[][]> {
  const res = await batch(tx, items.filter((x): x is Q => x !== null));
  let k = 0;
  return items.map((x) => (x ? res[k++].rows : []));
}

function toSemester(r: Record<string, any>): SemesterDto {
  return {
    id: r.sem_id,
    code: r.sem_code,
    name: r.sem_name,
    yearCode: r.year_code,
    startsOn: r.sem_starts_on,
    endsOn: r.sem_ends_on,
    isCurrent: r.sem_is_current,
  };
}

// ---------------------------------------------------------------------
// Danh mục cho biểu mẫu
// ---------------------------------------------------------------------
const SEMESTER_COLS = `s.id AS sem_id, s.code AS sem_code, s.name AS sem_name, s.starts_on AS sem_starts_on, s.ends_on AS sem_ends_on,
       y.code AS year_code, (app.local_today() BETWEEN s.starts_on AND s.ends_on) AS sem_is_current`;

export async function getMeta(tx: Tx): Promise<AcademicMetaDto> {
  // Gộp các truy vấn độc lập (học kỳ, trường, thang điểm mặc định, hồ sơ của tôi): 1 vòng mạng thay vì 4
  const [semR, uniR, scaleR, meR] = await batch(tx, [
    // Học kỳ đã bắt đầu (không nhập điểm cho học kỳ tương lai) — mới nhất trước
    [
      `SELECT ${SEMESTER_COLS}
         FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id
        WHERE s.starts_on <= app.local_today()
        ORDER BY s.starts_on DESC`,
    ],
    ["SELECT id, code, name, short_name FROM universities WHERE deleted_at IS NULL AND is_active ORDER BY name"], // trường "Tạm ẩn" không hiện trong danh sách chọn
    [
      `SELECT id, name, max_score, process_weight_pct, final_weight_pct FROM grade_scales
        WHERE id = app.fn_scale_for(NULL, app.local_today())`,
    ],
    ["SELECT m.id, m.full_name FROM members m WHERE m.id = app.current_member_id()"],
  ]);
  const semesters = semR.rows.map(toSemester);
  const universities = uniR.rows.map((u) => ({ id: u.id, code: u.code, name: u.name, shortName: u.short_name }));
  const scaleRow = scaleR.rows[0];
  const me = meR.rows[0];

  // Gộp các truy vấn cần id thang điểm / id thành viên (bậc điểm, xếp loại, hồ sơ sinh viên): 1 vòng mạng thay vì 3
  const [bands, ranks, profileRows] = await batchRows(tx, [
    scaleRow ? ["SELECT letter, min_score, gpa_points, is_pass FROM grade_scale_bands WHERE scale_id = $1 ORDER BY min_score DESC", [scaleRow.id]] : null,
    scaleRow ? ["SELECT label_vi, min_gpa4 FROM grade_rank_bands WHERE scale_id = $1 ORDER BY min_gpa4 DESC", [scaleRow.id]] : null,
    me
      ? [
          `SELECT university_id, major, student_code FROM student_profiles
            WHERE member_id = $1 AND is_current AND deleted_at IS NULL LIMIT 1`,
          [me.id],
        ]
      : null,
  ]);
  let defaultScale: AcademicMetaDto["defaultScale"] = null;
  if (scaleRow) {
    defaultScale = {
      id: scaleRow.id,
      name: scaleRow.name,
      maxScore: Number(scaleRow.max_score),
      processWeightPct: scaleRow.process_weight_pct,
      finalWeightPct: scaleRow.final_weight_pct,
      bands: bands.map((b) => ({ letter: b.letter, minScore: Number(b.min_score), gpaPoints: Number(b.gpa_points), isPass: b.is_pass })),
      ranks: ranks.map((r) => ({ label: r.label_vi, minGpa4: Number(r.min_gpa4) })),
    };
  }

  const profile = me ? profileRows[0] : null;

  return {
    semesters,
    universities,
    defaultScale,
    profile: profile ? { universityId: profile.university_id, major: profile.major, studentCode: profile.student_code } : null,
    me: me ? { memberId: me.id, fullName: me.full_name } : null,
  };
}

// ---------------------------------------------------------------------
// Đọc bảng điểm (RLS lọc hàng)
// ---------------------------------------------------------------------
const RECORD_SELECT = `
  SELECT ar.id, ar.member_id, m.full_name, m.display_name, app.is_self(ar.member_id) AS is_own,
         r.code AS room_code,
         ${SEMESTER_COLS},
         u.id AS uni_id, u.name AS uni_name, u.short_name AS uni_short,
         ar.major_snapshot, ar.student_code_snapshot,
         gs.id AS scale_id, gs.name AS scale_name, gs.max_score, gs.process_weight_pct, gs.final_weight_pct,
         ar.status::text AS status, ar.submitted_at, ar.verified_at, vm.full_name AS verified_by_name, ar.reject_reason,
         ar.has_scholarship, ar.scholarship_note, ar.updated_at,
         snap.gpa10, snap.gpa4, snap.rank_label, snap.credits_attempted, snap.credits_passed, snap.failed_courses,
         cum.gpa10 AS cum_gpa10, cum.gpa4 AS cum_gpa4, cum.rank_label AS cum_rank,
         pv.g10 AS pv_gpa10, pv.g4 AS pv_gpa4, pv.att AS pv_att, pv.pas AS pv_pas, pv.failed AS pv_failed, pv.incomplete AS pv_incomplete,
         (SELECT rb.label_vi FROM grade_rank_bands rb
           WHERE rb.scale_id = ar.scale_id AND pv.g4_raw IS NOT NULL AND rb.min_gpa4 <= pv.g4_raw
           ORDER BY rb.min_gpa4 DESC LIMIT 1) AS pv_rank,
         ev.file_id AS evidence_file_id, ev.mime AS evidence_mime,
         sg.goals, sg.difficulties, sg.visibility AS goals_visibility, (sg.member_id IS NOT NULL) AS has_goals,
         COALESCE(sub.items, '[]'::json) AS subjects
    FROM academic_records ar
    JOIN members m ON m.id = ar.member_id
    JOIN semesters s ON s.id = ar.semester_id
    JOIN academic_years y ON y.id = s.academic_year_id
    JOIN universities u ON u.id = ar.university_id
    JOIN grade_scales gs ON gs.id = ar.scale_id
    LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                  AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
    LEFT JOIN rooms r ON r.id = ra.room_id
    LEFT JOIN members vm ON vm.user_id = ar.verified_by
    LEFT JOIN gpa_snapshots snap ON snap.member_id = ar.member_id AND snap.as_of_semester_id = ar.semester_id AND snap.scope = 'semester'
    LEFT JOIN gpa_snapshots cum  ON cum.member_id = ar.member_id AND cum.as_of_semester_id = ar.semester_id AND cum.scope = 'cumulative'
    LEFT JOIN LATERAL (
      -- GPA tạm tính cho bản nháp: cùng công thức với app.fn_recompute_gpa (trọng số tín chỉ, chỉ môn counts_in_gpa)
      SELECT CASE WHEN x.att > 0 THEN round(x.w10 / x.att, 2) END AS g10,
             CASE WHEN x.att > 0 THEN round(x.w4 / x.att, 2) END AS g4,
             CASE WHEN x.att > 0 THEN x.w4 / x.att END AS g4_raw,
             x.att, x.pas, x.failed, x.incomplete
        FROM (SELECT COALESCE(SUM(g.credits) FILTER (WHERE g.counts_in_gpa), 0) AS att,
                     COALESCE(SUM(g.credits) FILTER (WHERE g.counts_in_gpa AND g.is_pass), 0) AS pas,
                     COUNT(*) FILTER (WHERE g.is_pass = false) AS failed,
                     COUNT(*) FILTER (WHERE g.total_score IS NULL) AS incomplete,
                     COALESCE(SUM(g.total_score * g.credits) FILTER (WHERE g.counts_in_gpa), 0) AS w10,
                     COALESCE(SUM((CASE WHEN gs.gpa4_mode = 'linear' THEN g.total_score / gs.max_score * 4 ELSE g.gpa_points END) * g.credits)
                              FILTER (WHERE g.counts_in_gpa), 0) AS w4
                FROM grade_records g WHERE g.record_id = ar.id) x
    ) pv ON true
    LEFT JOIN LATERAL (
      SELECT ma.file_id, f.detected_mime AS mime
        FROM media_attachments ma JOIN storage_files f ON f.id = ma.file_id
       WHERE ma.entity_type = 'academic_record' AND ma.entity_id = ar.id AND ma.purpose = 'transcript'
       ORDER BY ma.created_at DESC LIMIT 1
    ) ev ON true
    LEFT JOIN study_goals sg ON sg.member_id = ar.member_id AND sg.semester_id = ar.semester_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', g.id, 'courseId', g.course_id, 'name', c.name, 'credits', g.credits,
               'processScore', g.process_score, 'finalScore', g.final_score, 'officialTotalScore', g.official_total_score,
               'totalScore', g.total_score, 'letterGrade', g.letter_grade, 'gpaPoints', g.gpa_points,
               'isPass', g.is_pass, 'countsInGpa', g.counts_in_gpa) ORDER BY g.created_at, g.id) AS items
        FROM grade_records g JOIN courses c ON c.id = g.course_id
       WHERE g.record_id = ar.id
    ) sub ON true`;

function toRecord(r: Record<string, any>, canVerify: boolean): AcademicRecordDto {
  const status = r.status as AcademicStatus;
  const own: boolean = r.is_own;
  const snap = r.gpa4 !== null && r.gpa4 !== undefined;
  const subjects = (r.subjects as any[]).map(
    (s): SubjectDto => ({
      id: s.id,
      courseId: s.courseId,
      name: s.name,
      credits: Number(s.credits),
      processScore: num(s.processScore),
      finalScore: num(s.finalScore),
      officialTotalScore: num(s.officialTotalScore),
      totalScore: num(s.totalScore),
      letterGrade: s.letterGrade ?? null,
      gpaPoints: num(s.gpaPoints),
      isPass: s.isPass ?? null,
      countsInGpa: !!s.countsInGpa,
    })
  );
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: r.full_name,
    displayName: r.display_name,
    room: r.room_code ?? "Chưa xếp phòng",
    isOwn: own,
    semester: toSemester(r),
    university: { id: r.uni_id, name: r.uni_name, shortName: r.uni_short },
    major: r.major_snapshot,
    studentCode: r.student_code_snapshot,
    scale: {
      id: r.scale_id,
      name: r.scale_name,
      maxScore: Number(r.max_score),
      processWeightPct: r.process_weight_pct,
      finalWeightPct: r.final_weight_pct,
    },
    status,
    submittedAt: iso(r.submitted_at),
    verifiedAt: iso(r.verified_at),
    verifiedByName: r.verified_by_name ?? null,
    rejectReason: r.reject_reason ?? null,
    hasScholarship: r.has_scholarship,
    scholarshipNote: r.scholarship_note ?? null,
    gpa10: snap ? num(r.gpa10) : num(r.pv_gpa10),
    gpa4: snap ? num(r.gpa4) : num(r.pv_gpa4),
    rank: snap ? r.rank_label ?? null : r.pv_rank ?? null,
    gpaPreview: !snap,
    creditsAttempted: Number(snap ? r.credits_attempted : r.pv_att) || 0,
    creditsPassed: Number(snap ? r.credits_passed : r.pv_pas) || 0,
    failedCourses: Number(snap ? r.failed_courses : r.pv_failed) || 0,
    cumulative: r.cum_gpa4 !== null && r.cum_gpa4 !== undefined ? { gpa10: num(r.cum_gpa10), gpa4: num(r.cum_gpa4), rank: r.cum_rank ?? null } : null,
    subjects,
    incompleteCount: Number(r.pv_incomplete) || 0,
    evidence: r.evidence_file_id ? { fileId: r.evidence_file_id, mime: r.evidence_mime ?? null } : null,
    goals: r.has_goals ? { goals: r.goals ?? null, difficulties: r.difficulties ?? null, visibility: r.goals_visibility as GoalsVisibility } : null,
    support: null,
    updatedAt: iso(r.updated_at) ?? new Date().toISOString(),
    can: {
      edit: own && (status === "draft" || status === "rejected"),
      delete: own && (status === "draft" || status === "rejected"),
      submit: own && (status === "draft" || status === "rejected"),
      withdraw: own && status === "submitted",
      verify: !own && canVerify && status === "submitted",
      reject: !own && canVerify && status === "submitted",
      reopen: !own && canVerify && status === "verified",
    },
  };
}

export async function listRecords(tx: Tx, opts: { id?: string } = {}): Promise<AcademicRecordDto[]> {
  // Gộp các truy vấn độc lập (quyền xác minh, bảng điểm): 1 vòng mạng thay vì 2
  const [vR, rowsR] = await batch(tx, [
    ["SELECT app.has_permission('academic.verify') AS v"],
    [`${RECORD_SELECT} WHERE ($1::uuid IS NULL OR ar.id = $1) ORDER BY s.starts_on DESC, m.full_name`, [opts.id ?? null]],
  ]);
  const canVerify = (vR.rows[0] as { v: boolean }).v;
  const rows = rowsR.rows;
  const records = rows.map((r) => toRecord(r, canVerify));
  if (!records.length) return records;

  // Yêu cầu phụ đạo đang mở (RLS: chính chủ, người có tutoring.manage, người kèm đã được ghép) — gắn vào bảng điểm
  // học kỳ mới nhất của thành viên trong danh sách nhìn thấy được
  const memberIds = Array.from(new Set(records.map((r) => r.memberId)));
  const reqs = (
    await tx.query(
      `SELECT DISTINCT ON (mentee_member_id) id, mentee_member_id, subject_text, status::text AS status
         FROM tutoring_requests
        WHERE mentee_member_id = ANY($1::uuid[]) AND status IN ('open', 'matched')
        ORDER BY mentee_member_id, created_at DESC`,
      [memberIds]
    )
  ).rows;
  if (reqs.length) {
    const latest = new Map<string, AcademicRecordDto>();
    for (const rec of records) {
      const cur = latest.get(rec.memberId);
      if (!cur || rec.semester.startsOn > cur.semester.startsOn) latest.set(rec.memberId, rec);
    }
    for (const q of reqs) {
      const rec = latest.get(q.mentee_member_id);
      if (rec) rec.support = { id: q.id, subject: q.subject_text, status: q.status };
    }
  }
  return records;
}

export async function getRecord(tx: Tx, id: string): Promise<AcademicRecordDto> {
  const [rec] = await listRecords(tx, { id });
  if (!rec) throw notFound("Không tìm thấy bảng điểm hoặc bạn không được xem bảng điểm này.");
  return rec;
}

// ---------------------------------------------------------------------
// Ghi (chỉ chính chủ)
// ---------------------------------------------------------------------
async function currentMemberId(tx: Tx): Promise<string> {
  const id = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
  if (!id) throw new ApiError(403, "NO_MEMBER_PROFILE", "Tài khoản chưa gắn hồ sơ thành viên nên chưa nhập được bảng điểm.");
  return id;
}

async function semesterLabel(tx: Tx, semesterId: string): Promise<{ startsOn: string; label: string }> {
  const s = (
    await tx.query(
      `SELECT s.starts_on, s.name || ' • ' || y.code AS label, (s.starts_on <= app.local_today()) AS started
         FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id WHERE s.id = $1`,
      [semesterId]
    )
  ).rows[0];
  if (!s) throw new ApiError(400, "BAD_SEMESTER", "Học kỳ không tồn tại.");
  if (!s.started) throw new ApiError(422, "FUTURE_SEMESTER", `${s.label} chưa bắt đầu — chưa thể nhập điểm.`);
  return { startsOn: s.starts_on, label: s.label };
}

async function ensureNoDuplicate(tx: Tx, memberId: string, semesterId: string, exceptId: string | null, label: string) {
  const dup = (
    await tx.query("SELECT id FROM academic_records WHERE member_id = $1 AND semester_id = $2 AND ($3::uuid IS NULL OR id <> $3)", [
      memberId,
      semesterId,
      exceptId,
    ])
  ).rows[0];
  if (dup) {
    throw new ApiError(409, "RECORD_EXISTS", `Bạn đã có bảng điểm ${label} — mở bảng điểm đó để cập nhật thay vì tạo mới.`);
  }
}

/** Tìm môn theo tên đã chuẩn hóa (bỏ dấu) trong trường; chưa có thì tạo (courses__insert cho mọi thành viên). */
async function resolveCourse(tx: Tx, universityId: string, name: string, credits: number): Promise<string> {
  const ins = (
    await tx.query<{ id: string }>(
      `INSERT INTO courses (university_id, name, default_credits) VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT ux_courses__university_name DO NOTHING RETURNING id`,
      [universityId, name, credits >= 0.5 ? credits : null]
    )
  ).rows[0];
  if (ins) return ins.id;
  const found = (
    await tx.query<{ id: string }>("SELECT id FROM courses WHERE university_id = $1 AND name_norm = app.norm_text($2)", [universityId, name])
  ).rows[0];
  if (!found) throw new ApiError(422, "COURSE_UNAVAILABLE", `Không tạo được môn "${name}".`);
  return found.id;
}

async function syncSubjects(tx: Tx, recordId: string, universityId: string, subjects: RecordInput["subjects"], force: boolean) {
  const seen = new Map<string, string>();
  const keep: string[] = [];
  for (const s of subjects) {
    const courseId = await resolveCourse(tx, universityId, s.name, s.credits);
    if (seen.has(courseId)) {
      throw new ApiError(400, "DUPLICATE_SUBJECT", `Môn "${s.name}" bị nhập trùng với "${seen.get(courseId)}".`);
    }
    seen.set(courseId, s.name);
    keep.push(courseId);
    // Chỉ ghi điểm thành phần; total/letter/gpa_points/is_pass/counts_in_gpa do trigger DB tính.
    await tx.query(
      `INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score, official_total_score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (record_id, course_id) DO UPDATE
          SET credits = EXCLUDED.credits, process_score = EXCLUDED.process_score,
              final_score = EXCLUDED.final_score, official_total_score = EXCLUDED.official_total_score
        WHERE $7::boolean
           OR (grade_records.credits, grade_records.process_score, grade_records.final_score, grade_records.official_total_score)
              IS DISTINCT FROM (EXCLUDED.credits, EXCLUDED.process_score, EXCLUDED.final_score, EXCLUDED.official_total_score)`,
      [recordId, courseId, s.credits, s.processScore ?? null, s.finalScore ?? null, s.officialTotalScore ?? null, force]
    );
  }
  await tx.query("DELETE FROM grade_records WHERE record_id = $1 AND NOT (course_id = ANY($2::uuid[]))", [recordId, keep]);
}

/** Minh chứng bảng điểm = media_attachments(academic_record, transcript); trigger kiểm bucket + người tải lên. */
async function syncEvidence(tx: Tx, recordId: string, fileId: string | null | undefined) {
  if (fileId === undefined) return;
  const cur = (
    await tx.query<{ file_id: string }>(
      "SELECT file_id FROM media_attachments WHERE entity_type = 'academic_record' AND entity_id = $1 AND purpose = 'transcript'",
      [recordId]
    )
  ).rows.map((r) => r.file_id);
  if (fileId && cur.length === 1 && cur[0] === fileId) return;
  if (cur.length) {
    await tx.query(
      "DELETE FROM media_attachments WHERE entity_type = 'academic_record' AND entity_id = $1 AND purpose = 'transcript' AND ($2::uuid IS NULL OR file_id <> $2)",
      [recordId, fileId]
    );
  }
  if (fileId && !cur.includes(fileId)) {
    await tx.query(
      `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by)
       VALUES ($1, 'academic_record', $2, 'transcript', app.current_user_id())`,
      [fileId, recordId]
    );
  }
}

/** Nguyện vọng / khó khăn theo (thành viên, học kỳ) — study_goals; để trống cả hai thì xóa. */
async function syncGoals(tx: Tx, memberId: string, semesterId: string, i: RecordInput) {
  if (!i.goals && !i.difficulties) {
    await tx.query("DELETE FROM study_goals WHERE member_id = $1 AND semester_id = $2", [memberId, semesterId]);
    return;
  }
  await tx.query(
    `INSERT INTO study_goals (member_id, semester_id, goals, difficulties, visibility) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (member_id, semester_id) DO UPDATE
        SET goals = EXCLUDED.goals, difficulties = EXCLUDED.difficulties, visibility = EXCLUDED.visibility`,
    [memberId, semesterId, i.goals, i.difficulties, i.goalsVisibility]
  );
}

/** "Cần phụ đạo kèm" = tutoring_requests của chính mình (một yêu cầu đang mở); bỏ chọn thì hủy yêu cầu đang mở. */
async function syncSupport(tx: Tx, memberId: string, universityId: string, i: RecordInput) {
  const open = (
    await tx.query<{ id: string; status: string; subject_text: string }>(
      `SELECT id, status::text AS status, subject_text FROM tutoring_requests
        WHERE mentee_member_id = $1 AND status IN ('open', 'matched') ORDER BY created_at DESC LIMIT 1`,
      [memberId]
    )
  ).rows[0];
  if (!i.supportNeeded) {
    await tx.query("UPDATE tutoring_requests SET status = 'cancelled' WHERE mentee_member_id = $1 AND status = 'open'", [memberId]);
    return;
  }
  const subject = (i.supportSubject ?? "").trim();
  if (subject.length < 2) throw new ApiError(400, "SUPPORT_SUBJECT_REQUIRED", "Nhập môn học cần phụ đạo (tối thiểu 2 ký tự).");
  const course = (
    await tx.query<{ id: string }>("SELECT id FROM courses WHERE university_id = $1 AND name_norm = app.norm_text($2)", [universityId, subject])
  ).rows[0];
  if (open) {
    // Cặp đã ghép (matched) giữ nguyên môn để không làm lệch thỏa thuận với người kèm
    if (open.status === "open" && open.subject_text !== subject) {
      await tx.query("UPDATE tutoring_requests SET subject_text = $2, course_id = $3 WHERE id = $1", [open.id, subject, course?.id ?? null]);
    }
    return;
  }
  await tx.query("INSERT INTO tutoring_requests (mentee_member_id, course_id, subject_text) VALUES ($1, $2, $3)", [
    memberId,
    course?.id ?? null,
    subject,
  ]);
}

export async function createRecord(tx: Tx, i: RecordInput): Promise<string> {
  const memberId = await currentMemberId(tx);
  const sem = await semesterLabel(tx, i.semesterId);
  await ensureNoDuplicate(tx, memberId, i.semesterId, null, sem.label);
  // scale_id, ngành/MSSV (nếu bỏ trống) do trigger trg_academic_records__defaults điền
  const rec = (
    await tx.query<{ id: string }>(
      `INSERT INTO academic_records (member_id, semester_id, university_id, major_snapshot, student_code_snapshot, has_scholarship, scholarship_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [memberId, i.semesterId, i.universityId, i.major, i.studentCode, i.hasScholarship, i.hasScholarship ? i.scholarshipNote : null]
    )
  ).rows[0];
  await syncSubjects(tx, rec.id, i.universityId, i.subjects, false);
  await syncEvidence(tx, rec.id, i.evidenceFileId);
  await syncGoals(tx, memberId, i.semesterId, i);
  await syncSupport(tx, memberId, i.universityId, i);
  return rec.id;
}

interface OwnRow {
  id: string;
  member_id: string;
  status: AcademicStatus;
  semester_id: string;
  university_id: string;
}
async function loadOwn(tx: Tx, id: string): Promise<OwnRow> {
  const r = (
    await tx.query<OwnRow>(
      "SELECT id, member_id, status::text AS status, semester_id, university_id FROM academic_records WHERE id = $1 AND app.is_self(member_id) FOR UPDATE",
      [id]
    )
  ).rows[0];
  if (!r) throw notFound("Không tìm thấy bảng điểm của bạn.");
  return r;
}

const LOCKED_MSG: Record<string, string> = {
  submitted: "Bảng điểm đang chờ xác minh — bấm \"Rút lại để sửa\" trước khi chỉnh điểm.",
  verified: "Bảng điểm đã được xác minh — chỉ Ban điều hành (người có quyền xác minh) mới mở lại được để chỉnh sửa.",
};

export async function updateRecord(tx: Tx, id: string, i: RecordInput) {
  const cur = await loadOwn(tx, id);
  if (cur.status === "submitted" || cur.status === "verified") throw new ApiError(422, "BR-ACAD-03", LOCKED_MSG[cur.status]);
  const sem = await semesterLabel(tx, i.semesterId);
  if (i.semesterId !== cur.semester_id) await ensureNoDuplicate(tx, cur.member_id, i.semesterId, id, sem.label);
  // Bị trả lại ⇒ sửa = quay về nháp (máy trạng thái: rejected → draft); lý do trả lại vẫn giữ để chính chủ đối chiếu
  if (cur.status === "rejected") await tx.query("UPDATE academic_records SET status = 'draft' WHERE id = $1", [id]);
  const scaleChanged = i.semesterId !== cur.semester_id || i.universityId !== cur.university_id;
  await tx.query(
    `UPDATE academic_records
        SET semester_id = $2, university_id = $3,
            scale_id = CASE WHEN $8::boolean THEN COALESCE(app.fn_scale_for($3, $9::date), scale_id) ELSE scale_id END,
            major_snapshot = $4, student_code_snapshot = $5, has_scholarship = $6, scholarship_note = $7
      WHERE id = $1`,
    [id, i.semesterId, i.universityId, i.major, i.studentCode, i.hasScholarship, i.hasScholarship ? i.scholarshipNote : null, scaleChanged, sem.startsOn]
  );
  await syncSubjects(tx, id, i.universityId, i.subjects, scaleChanged);
  await syncEvidence(tx, id, i.evidenceFileId);
  await syncGoals(tx, cur.member_id, i.semesterId, i);
  await syncSupport(tx, cur.member_id, i.universityId, i);
}

export async function deleteRecord(tx: Tx, id: string) {
  const cur = await loadOwn(tx, id);
  if (cur.status === "submitted" || cur.status === "verified") {
    throw new ApiError(422, "RECORD_LOCKED", "Chỉ xóa được bảng điểm còn ở dạng nháp hoặc bị trả lại.");
  }
  if (cur.status === "rejected") await tx.query("UPDATE academic_records SET status = 'draft' WHERE id = $1", [id]);
  // media_attachments là liên kết đa hình (không FK) ⇒ gỡ trước; điểm môn xóa theo ON DELETE CASCADE
  await tx.query("DELETE FROM media_attachments WHERE entity_type = 'academic_record' AND entity_id = $1", [id]);
  const r = await tx.query("DELETE FROM academic_records WHERE id = $1", [id]);
  if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền xóa bảng điểm này.");
}

// ---------------------------------------------------------------------
// Chuyển trạng thái
// ---------------------------------------------------------------------
export async function transition(tx: Tx, id: string, action: AcademicAction, reason: string | null) {
  switch (action) {
    case "submit": {
      const cur = await loadOwn(tx, id);
      if (cur.status === "submitted" || cur.status === "verified") {
        throw new ApiError(422, "ALREADY_SUBMITTED", cur.status === "verified" ? "Bảng điểm đã được xác minh." : "Bảng điểm đã nộp, đang chờ xác minh.");
      }
      if (cur.status === "rejected") await tx.query("UPDATE academic_records SET status = 'draft' WHERE id = $1", [id]);
      // tg_academic_record_rules: ≥ 1 môn, mọi môn có tổng kết, có minh chứng, minh chứng không trùng người khác ⇒ GPA snapshot
      await tx.query("UPDATE academic_records SET status = 'submitted' WHERE id = $1", [id]);
      return;
    }
    case "withdraw": {
      const cur = await loadOwn(tx, id);
      if (cur.status !== "submitted") {
        throw new ApiError(
          422,
          "NOT_SUBMITTED",
          cur.status === "verified" ? LOCKED_MSG.verified : "Chỉ rút lại được bảng điểm đang chờ xác minh."
        );
      }
      await tx.query("UPDATE academic_records SET status = 'draft' WHERE id = $1", [id]);
      return;
    }
    case "verify": {
      // Dòng kết quả 'verified' vẫn nằm trong chính sách SELECT ⇒ UPDATE trực tiếp dưới RLS (verify + đồng ý của chủ thể)
      const r = await tx.query("UPDATE academic_records SET status = 'verified' WHERE id = $1 AND status = 'submitted'", [id]);
      if (r.rowCount) return;
      const seen = (
        await tx.query<{ status: string; own: boolean }>("SELECT status::text AS status, app.is_self(member_id) AS own FROM academic_records WHERE id = $1", [id])
      ).rows[0];
      if (!seen) throw notFound("Không tìm thấy bảng điểm hoặc bạn không được xem bảng điểm này.");
      if (seen.own) throw new ApiError(422, "BR-ACAD-02", "Không được tự xác minh bảng điểm của chính mình.");
      if (seen.status !== "submitted") throw new ApiError(422, "NOT_SUBMITTED", "Chỉ xác minh được bảng điểm đang chờ xác minh.");
      throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền xác minh bảng điểm.");
    }
    case "reject":
    case "reopen":
      await tx.query("SELECT app.fn_academic_review($1, $2, $3)", [id, action, reason]);
      return;
  }
}

// ---------------------------------------------------------------------
// Tóm tắt cho trang Tổng quan
// ---------------------------------------------------------------------
export async function getSummary(tx: Tx): Promise<AcademicSummaryDto> {
  // Gộp các truy vấn độc lập (học kỳ hiện tại, quyền): 1 vòng mạng thay vì 2
  const [semR, permsR] = await batch(tx, [
    [
      `SELECT s.id, s.name || ' • ' || y.code AS label FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id
        WHERE app.local_today() BETWEEN s.starts_on AND s.ends_on ORDER BY s.starts_on DESC LIMIT 1`,
    ],
    ["SELECT app.has_permission('academic.verify') AS verify, app.has_permission('academic.read_aggregate') AS agg"],
  ]);
  const sem = semR.rows[0];
  const perms = permsR.rows[0] as { verify: boolean; agg: boolean };
  // Gộp các truy vấn cần học kỳ / quyền (bảng điểm của tôi, số chờ xác minh, thống kê ẩn danh): 1 vòng mạng thay vì 3
  const [recRows, pendingRows, aggRows] = await batchRows(tx, [
    sem ? ["SELECT id FROM academic_records WHERE semester_id = $1 AND member_id = app.current_member_id()", [sem.id]] : null,
    perms.verify ? ["SELECT count(*)::int AS n FROM academic_records WHERE status = 'submitted' AND NOT app.is_self(member_id)"] : null,
    perms.agg && sem ? ["SELECT * FROM app.fn_academic_aggregate($1)", [sem.id]] : null,
  ]);
  let mine: AcademicSummaryDto["mine"] = null;
  const [rec] = recRows;
  if (rec) {
    const d = await getRecord(tx, rec.id);
    mine = { recordId: d.id, status: d.status, gpa10: d.gpa10, gpa4: d.gpa4, rank: d.rank };
  }
  const pendingVerification = perms.verify ? (pendingRows[0] as { n: number }).n : null;
  let aggregate: AcademicSummaryDto["aggregate"] = null;
  if (perms.agg && sem) {
    const a = aggRows[0];
    if (a) {
      aggregate = {
        students: a.students,
        avgGpa4: num(a.avg_gpa4),
        excellentOrGood: a.excellent_or_good,
        scholarship: a.scholarship,
        needSupport: a.need_support,
      };
    }
  }
  return { currentSemester: sem ? { id: sem.id, label: sem.label } : null, mine, pendingVerification, aggregate };
}
