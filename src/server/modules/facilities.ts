import "server-only";
import type { Tx } from "../db";
import { ApiError, conflict, forbidden, notFound } from "../errors";
import { addDays, issueCode, mondayOf } from "@/lib/duty-format";
import type { IssueDto, IssueStatus, IssuesDto, IssueUrgency } from "@/lib/types/duty";

// =====================================================================
// Cơ sở vật chất: báo hỏng (maintenance_issues + phân công + chi phí + nhật ký).
// Luật nghiệp vụ ở DB: 37_fn_facilities_community.sql, RLS 48.
// =====================================================================

const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
const isoReq = (v: Date | string): string => new Date(v).toISOString();
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------
// Báo hỏng & sự cố
// ---------------------------------------------------------------------
export async function listIssues(tx: Tx, opts: { id?: string } = {}): Promise<IssuesDto> {
  const me = (await tx.query<{ me: string | null }>("SELECT app.current_member_id() AS me")).rows[0].me;
  const rows = (
    await tx.query(
      `SELECT i.id, i.issue_no, i.title, i.description, i.location_text, r.code AS room_code, r.name AS room_name,
              i.category_id, c.name AS category_name, i.urgency::text AS urgency, i.status::text AS status,
              i.created_at, i.sla_due_at, i.accepted_at, i.resolved_at, i.verified_at,
              m.id AS rep_id, m.display_name AS rep_name, m.full_name AS rep_full,
              (SELECT rr.code FROM room_assignments ra JOIN rooms rr ON rr.id = ra.room_id
                WHERE ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
                ORDER BY ra.starts_on DESC LIMIT 1) AS rep_room,
              (SELECT vm.display_name FROM members vm WHERE vm.user_id = i.verified_by LIMIT 1) AS verified_by_name
         FROM maintenance_issues i
         JOIN members m ON m.id = i.reporter_member_id
         LEFT JOIN rooms r ON r.id = i.location_room_id
         LEFT JOIN categories c ON c.id = i.category_id
        WHERE ($1::uuid IS NULL OR i.id = $1)
        ORDER BY (i.status IN ('new', 'in_progress', 'waiting_parts')) DESC, i.created_at DESC
        LIMIT 200`,
      [opts.id ?? null]
    )
  ).rows;
  const ids = rows.map((r) => r.id);
  const [assignees, costs, photos, history] = ids.length
    ? await Promise.all([
        tx
          .query(
            `SELECT ia.id, ia.issue_id, ia.assignee_member_id, ia.role_label, ia.note, ia.assigned_at,
                    COALESCE(m.display_name, v.name, 'Thợ bên ngoài') AS name
               FROM issue_assignments ia
               LEFT JOIN members m ON m.id = ia.assignee_member_id
               LEFT JOIN vendors v ON v.id = ia.vendor_id
              WHERE ia.issue_id = ANY($1::uuid[]) AND ia.unassigned_at IS NULL
              ORDER BY (ia.role_label = 'lead') DESC, ia.assigned_at`,
            [ids]
          )
          .then((r) => r.rows),
        tx
          .query(
            `SELECT rc.id, rc.issue_id, rc.cost_kind, rc.amount_vnd, rc.description, rc.created_at,
                    (SELECT cm.display_name FROM members cm WHERE cm.user_id = rc.created_by LIMIT 1) AS by_name
               FROM repair_costs rc WHERE rc.issue_id = ANY($1::uuid[]) ORDER BY rc.created_at`,
            [ids]
          )
          .then((r) => r.rows),
        tx
          .query(
            `SELECT entity_id, file_id, purpose::text AS purpose FROM media_attachments
              WHERE entity_type = 'maintenance_issue' AND entity_id = ANY($1::uuid[]) ORDER BY position, created_at`,
            [ids]
          )
          .then((r) => r.rows),
        tx
          .query(
            `SELECT h.issue_id, h.from_status, h.to_status, h.changed_at, h.reason,
                    (SELECT hm.display_name FROM members hm WHERE hm.user_id = h.changed_by LIMIT 1) AS by_name
               FROM issue_status_history h WHERE h.issue_id = ANY($1::uuid[]) ORDER BY h.changed_at`,
            [ids]
          )
          .then((r) => r.rows),
      ])
    : [[], [], [], []];
  const now = Date.now();
  const issues: IssueDto[] = rows.map((r: Row) => {
    const cs = costs.filter((c: Row) => c.issue_id === r.id);
    const status = r.status as IssueStatus;
    return {
      id: r.id,
      issueNo: Number(r.issue_no),
      code: issueCode(Number(r.issue_no)),
      title: r.title,
      description: r.description,
      location: r.room_name ? `${r.room_name}${r.location_text ? ` – ${r.location_text}` : ""}` : r.location_text ?? "—",
      roomCode: r.room_code,
      categoryId: r.category_id,
      categoryName: r.category_name,
      urgency: r.urgency as IssueUrgency,
      status,
      reporter: { id: r.rep_id, name: r.rep_name, fullName: r.rep_full, roomCode: r.rep_room },
      createdAt: isoReq(r.created_at),
      slaDueAt: iso(r.sla_due_at),
      acceptedAt: iso(r.accepted_at),
      resolvedAt: iso(r.resolved_at),
      verifiedAt: iso(r.verified_at),
      verifiedByName: r.verified_by_name,
      isOverdue: !!r.sla_due_at && ["new", "in_progress", "waiting_parts"].includes(status) && new Date(r.sla_due_at).getTime() < now,
      assignees: assignees
        .filter((a: Row) => a.issue_id === r.id)
        .map((a: Row) => ({ id: a.id, memberId: a.assignee_member_id, name: a.name, roleLabel: a.role_label, note: a.note, assignedAt: isoReq(a.assigned_at) })),
      costs: cs.map((c: Row) => ({
        id: c.id,
        kind: c.cost_kind,
        amount: Number(c.amount_vnd),
        description: c.description,
        createdAt: isoReq(c.created_at),
        createdByName: c.by_name,
      })),
      estimateTotal: cs.filter((c: Row) => c.cost_kind === "estimate").reduce((s: number, c: Row) => s + Number(c.amount_vnd), 0),
      actualTotal: cs.filter((c: Row) => c.cost_kind === "actual").reduce((s: number, c: Row) => s + Number(c.amount_vnd), 0),
      photos: photos.filter((p: Row) => p.entity_id === r.id).map((p: Row) => ({ fileId: p.file_id, purpose: p.purpose })),
      history: history
        .filter((h: Row) => h.issue_id === r.id)
        .map((h: Row) => ({ from: h.from_status, to: h.to_status, at: isoReq(h.changed_at), byName: h.by_name, reason: h.reason })),
      isMine: !!me && r.rep_id === me,
    };
  });
  const categories = (await tx.query("SELECT id, code, name FROM categories WHERE kind = 'maintenance' AND is_active AND deleted_at IS NULL ORDER BY sort_order, name")).rows;
  const areas = (await tx.query("SELECT code, name, COALESCE(icon, '🧹') AS icon FROM cleaning_areas WHERE is_active AND NOT is_whole_house ORDER BY sort_order")).rows;
  return { issues, categories, areas };
}

export async function createIssue(
  tx: Tx,
  i: { title: string; description?: string | null; roomCode?: string | null; locationText?: string | null; urgency: IssueUrgency; categoryId?: string | null; photoFileId?: string | null }
): Promise<{ id: string; code: string }> {
  const me = (await tx.query<{ me: string | null }>("SELECT app.current_member_id() AS me")).rows[0].me;
  if (!me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  let roomId: string | null = null;
  if (i.roomCode) {
    roomId = (await tx.query<{ id: string }>("SELECT id FROM rooms WHERE code = $1 AND deleted_at IS NULL", [i.roomCode])).rows[0]?.id ?? null;
    if (!roomId) throw notFound(`Không tìm thấy phòng ${i.roomCode}.`);
  }
  const loc = i.locationText?.trim() || null;
  if (!roomId && !loc) throw new ApiError(400, "VALIDATION_FAILED", "Chọn vị trí xảy ra sự cố.");
  const r = (
    await tx.query<{ id: string; issue_no: number }>(
      `INSERT INTO maintenance_issues (title, category_id, location_room_id, location_text, reporter_member_id, description, urgency)
       VALUES ($1, $2, $3, $4, app.current_member_id(), $5, $6::urgency_t) RETURNING id, issue_no`,
      [i.title.trim(), i.categoryId ?? null, roomId, loc, i.description?.trim() || null, i.urgency]
    )
  ).rows[0];
  if (i.photoFileId) await attachIssuePhoto(tx, r.id, i.photoFileId, "before_photo");
  return { id: r.id, code: issueCode(Number(r.issue_no)) };
}

export async function attachIssuePhoto(tx: Tx, issueId: string, fileId: string, purpose: "before_photo" | "after_photo") {
  await tx.query(
    `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, position, attached_by)
     VALUES ($1, 'maintenance_issue', $2, $3::attachment_purpose_t,
             (SELECT count(*) FROM media_attachments WHERE entity_type = 'maintenance_issue' AND entity_id = $2), app.current_user_id())`,
    [fileId, issueId, purpose]
  );
}

const ALLOWED_NEXT: Record<IssueStatus, IssueStatus[]> = {
  new: ["in_progress", "waiting_parts", "cancelled"],
  in_progress: ["waiting_parts", "done", "cancelled"],
  waiting_parts: ["in_progress", "done", "cancelled"],
  done: ["in_progress"],
  cancelled: [],
  duplicate: [],
};

export async function updateIssue(
  tx: Tx,
  id: string,
  i: { status?: IssueStatus; reason?: string | null; urgency?: IssueUrgency; categoryId?: string | null; title?: string; description?: string | null }
): Promise<{ reporterId: string; code: string; title: string; status: IssueStatus }> {
  const cur = (await tx.query("SELECT status::text AS status, reporter_member_id, issue_no, title FROM maintenance_issues WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy sự cố.");
  if (i.status && i.status !== cur.status && !ALLOWED_NEXT[cur.status as IssueStatus].includes(i.status)) {
    throw new ApiError(422, "BAD_TRANSITION", `Không chuyển được sự cố từ trạng thái hiện tại sang trạng thái đã chọn.`);
  }
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown, cast = "") => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}${cast}`);
  };
  if (i.status && i.status !== cur.status) set("status", i.status, "::issue_status_t");
  if (i.urgency) set("urgency", i.urgency, "::urgency_t");
  if (i.categoryId !== undefined) set("category_id", i.categoryId);
  if (i.title !== undefined) set("title", i.title.trim());
  if (i.description !== undefined) set("description", i.description?.trim() || null);
  if (sets.length) {
    if (i.reason) await tx.query("SELECT set_config('app.status_reason', $1, true)", [i.reason.trim().slice(0, 500)]);
    const r = await tx.query(`UPDATE maintenance_issues SET ${sets.join(", ")} WHERE id = $1`, vals);
    if (!r.rowCount) throw forbidden("Bạn không có quyền cập nhật sự cố này.");
  }
  return { reporterId: cur.reporter_member_id, code: issueCode(Number(cur.issue_no)), title: cur.title, status: (i.status ?? cur.status) as IssueStatus };
}

/** Phân công người phụ trách chính (lead): gỡ người phụ trách cũ (ghi unassigned_at), thêm người mới. Cần issue.triage. */
export async function assignIssue(tx: Tx, id: string, memberId: string, note: string | null) {
  const exists = (await tx.query("SELECT 1 FROM maintenance_issues WHERE id = $1", [id])).rowCount;
  if (!exists) throw notFound("Không tìm thấy sự cố.");
  const same = (
    await tx.query("SELECT id FROM issue_assignments WHERE issue_id = $1 AND unassigned_at IS NULL AND role_label = 'lead' AND assignee_member_id = $2", [id, memberId])
  ).rows[0];
  if (same) {
    if (note !== null) await tx.query("UPDATE issue_assignments SET note = $2 WHERE id = $1", [same.id, note]);
    return;
  }
  await tx.query("UPDATE issue_assignments SET unassigned_at = now() WHERE issue_id = $1 AND unassigned_at IS NULL AND role_label = 'lead'", [id]);
  await tx.query(
    `INSERT INTO issue_assignments (issue_id, assignee_member_id, role_label, note, assigned_by)
     VALUES ($1, $2, 'lead', $3, app.current_user_id())`,
    [id, memberId, note]
  );
}

export async function addIssueCost(tx: Tx, id: string, amount: number, description: string) {
  const exists = (await tx.query("SELECT 1 FROM maintenance_issues WHERE id = $1", [id])).rowCount;
  if (!exists) throw notFound("Không tìm thấy sự cố.");
  await tx.query(
    `INSERT INTO repair_costs (issue_id, cost_kind, amount_vnd, description, created_by)
     VALUES ($1, 'estimate', $2, $3, app.current_user_id())`,
    [id, amount, description.trim()]
  );
}

export async function deleteIssueCost(tx: Tx, id: string, costId: string) {
  const r = await tx.query("DELETE FROM repair_costs WHERE id = $1 AND issue_id = $2 AND cost_kind = 'estimate'", [costId, id]);
  if (!r.rowCount) throw forbidden("Không xóa được dòng chi phí này.");
}

export async function verifyIssue(tx: Tx, id: string) {
  await tx.query("SELECT app.fn_verify_issue($1)", [id]);
}
