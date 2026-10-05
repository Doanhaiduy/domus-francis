import "server-only";
import type { Tx } from "../db";
import { ApiError, conflict, forbidden, notFound } from "../errors";
import { addDays, issueCode, mondayOf } from "@/lib/duty-format";
import type { AssetDto, IssueDto, IssueStatus, IssuesDto, IssueUrgency, LaundryWeekDto } from "@/lib/types/duty";

// =====================================================================
// Cơ sở vật chất: báo hỏng (maintenance_issues + phân công + chi phí + nhật ký), máy giặt, mượn đồ dùng chung.
// Luật nghiệp vụ ở DB: 37_fn_facilities_community.sql, 70 (G-06 hạn mức giặt), 75 (BR-LAU-04), RLS 48.
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

// ---------------------------------------------------------------------
// Máy giặt
// ---------------------------------------------------------------------
async function laundrySettings(tx: Tx) {
  const r = (
    await tx.query(
      `SELECT app.setting_json('laundry.slots') AS slots, app.setting_int('laundry.max_per_week') AS max_week,
              app.setting_int('laundry.max_days_ahead') AS ahead, app.setting_int('laundry.cancel_min_minutes') AS cancel_min`
    )
  ).rows[0];
  return { slots: r.slots as [string, string][], maxPerWeek: Number(r.max_week), maxDaysAhead: Number(r.ahead), cancelMinMinutes: Number(r.cancel_min) };
}

/** Lịch giặt 7 ngày liên tiếp bắt đầu từ `from` (mặc định hôm nay — tránh lưới toàn ô đã qua vào cuối tuần). */
export async function getLaundryWeek(tx: Tx, from: string | null): Promise<LaundryWeekDto> {
  const base = (await tx.query("SELECT app.local_today()::text AS today, now() AS now, app.current_member_id() AS me")).rows[0];
  const weekStart = from || base.today;
  const st = await laundrySettings(tx);
  const machines = (
    await tx.query("SELECT id, code, name, brand, capacity_kg, status FROM laundry_machines WHERE status <> 'retired' ORDER BY sort_order, name")
  ).rows.map((m) => ({ id: m.id, code: m.code, name: m.name, brand: m.brand, capacityKg: m.capacity_kg === null ? null : Number(m.capacity_kg), status: m.status }));
  const rows = (
    await tx.query(
      `SELECT b.id, b.machine_id, b.starts_at, b.ends_at, b.status::text AS status, app.local_date(b.starts_at)::text AS d,
              to_char(b.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS hm,
              m.id AS mid, m.display_name, m.full_name
         FROM laundry_bookings b JOIN members m ON m.id = b.member_id
        WHERE b.starts_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          AND b.starts_at <  (($1::date + 7)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          AND b.status IN ('booked', 'checked_in', 'completed')
        ORDER BY b.starts_at`,
      [weekStart]
    )
  ).rows;
  const bookings = rows.map((b) => ({
    id: b.id,
    machineId: b.machine_id,
    member: { id: b.mid, name: b.display_name, fullName: b.full_name },
    date: b.d,
    slotIndex: st.slots.findIndex((s) => s[0] === b.hm),
    startsAt: isoReq(b.starts_at),
    endsAt: isoReq(b.ends_at),
    status: b.status,
    isMine: !!base.me && b.mid === base.me,
  }));
  return {
    weekStart,
    days: Array.from({ length: 7 }, (_, k) => addDays(weekStart, k)),
    today: base.today,
    now: isoReq(base.now),
    slots: st.slots,
    machines,
    bookings,
    maxPerWeek: st.maxPerWeek,
    maxDaysAhead: st.maxDaysAhead,
    cancelMinMinutes: st.cancelMinMinutes,
    ...(await myLaundryCounts(tx, base.me, base.today, weekStart)),
  };
}

/** Số lượt (đã đặt/đang giặt/xong) của tôi theo tuần ISO — hạn mức BR-LAU-03 tính theo tuần. */
async function myLaundryCounts(tx: Tx, me: string | null, today: string, from: string) {
  if (!me) return { myCountThisWeek: 0, myWeekCounts: {} as Record<string, number> };
  const rows = (
    await tx.query<{ w: string; n: number }>(
      `SELECT date_trunc('week', app.local_date(b.starts_at))::date::text AS w, count(*)::int AS n
         FROM laundry_bookings b
        WHERE b.member_id = $1 AND b.status IN ('booked', 'checked_in', 'completed')
          AND app.local_date(b.starts_at) BETWEEN LEAST($2::date, date_trunc('week', $3::date)::date) AND $3::date + 13
        GROUP BY 1`,
      [me, mondayOf(today), from]
    )
  ).rows;
  const myWeekCounts = Object.fromEntries(rows.map((r) => [r.w, r.n]));
  return { myCountThisWeek: myWeekCounts[mondayOf(today)] ?? 0, myWeekCounts };
}

export async function bookLaundry(tx: Tx, i: { machineId: string; date: string; slotIndex: number }): Promise<string> {
  const me = (await tx.query<{ me: string | null }>("SELECT app.current_member_id() AS me")).rows[0].me;
  if (!me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  const st = await laundrySettings(tx);
  if (i.slotIndex < 0 || i.slotIndex >= st.slots.length) throw new ApiError(400, "VALIDATION_FAILED", "Khung giờ không hợp lệ.");
  const [s, e] = st.slots[i.slotIndex];
  const taken = (
    await tx.query(
      `SELECT m.display_name FROM laundry_bookings b JOIN members m ON m.id = b.member_id
        WHERE b.machine_id = $1 AND b.status IN ('booked', 'checked_in')
          AND b.during && tstzrange(($2::date + $3::time) AT TIME ZONE 'Asia/Ho_Chi_Minh', ($2::date + $4::time) AT TIME ZONE 'Asia/Ho_Chi_Minh', '[)')`,
      [i.machineId, i.date, s, e]
    )
  ).rows[0];
  if (taken) throw conflict(`Khung giờ này đã được ${taken.display_name} đặt. Vui lòng chọn khung khác.`, "OVERLAP");
  const r = (
    await tx.query<{ id: string }>(
      `INSERT INTO laundry_bookings (machine_id, member_id, starts_at, ends_at)
       VALUES ($1, app.current_member_id(), ($2::date + $3::time) AT TIME ZONE 'Asia/Ho_Chi_Minh', ($2::date + $4::time) AT TIME ZONE 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [i.machineId, i.date, s, e]
    )
  ).rows[0];
  return r.id;
}

export async function setLaundryStatus(tx: Tx, id: string, to: "cancelled" | "checked_in" | "completed", reason: string | null) {
  const from = to === "completed" ? "checked_in" : "booked";
  const r = await tx.query(
    `UPDATE laundry_bookings SET status = $2::laundry_status_t, cancel_reason = CASE WHEN $2 = 'cancelled' THEN $3 ELSE cancel_reason END
      WHERE id = $1 AND status = $4::laundry_status_t`,
    [id, to, reason, from]
  );
  if (!r.rowCount) {
    const b = (await tx.query("SELECT status::text AS status, app.is_self(member_id) AS mine FROM laundry_bookings WHERE id = $1", [id])).rows[0];
    if (!b) throw notFound("Không tìm thấy lượt giặt.");
    if (!b.mine) throw forbidden("Chỉ người đặt (hoặc người quản lý máy giặt) mới thay đổi được lượt giặt này.");
    throw new ApiError(422, "BAD_TRANSITION", "Lượt giặt không còn ở trạng thái phù hợp cho thao tác này.");
  }
}

// ---------------------------------------------------------------------
// Mượn đồ dùng chung
// ---------------------------------------------------------------------
export async function listAssets(tx: Tx): Promise<AssetDto[]> {
  const rows = (
    await tx.query(
      `SELECT a.id, a.asset_tag, a.name, a.asset_type, a.location_text, a.status::text AS status, a.is_loanable, a.notes,
              r.name AS room_name,
              l.id AS loan_id, l.borrowed_at, l.due_at, lm.id AS bid, lm.display_name AS bname, lm.full_name AS bfull,
              app.is_self(l.borrower_member_id) AS mine
         FROM assets a
         LEFT JOIN rooms r ON r.id = a.room_id
         LEFT JOIN LATERAL (SELECT * FROM asset_loans x WHERE x.asset_id = a.id AND x.status = 'open' ORDER BY x.borrowed_at DESC LIMIT 1) l ON true
         LEFT JOIN members lm ON lm.id = l.borrower_member_id
        WHERE a.deleted_at IS NULL AND a.status <> 'retired'
        ORDER BY a.is_loanable DESC, a.name`
    )
  ).rows;
  const now = Date.now();
  return rows.map((a) => ({
    id: a.id,
    tag: a.asset_tag,
    name: a.name,
    type: a.asset_type,
    location: a.location_text || a.room_name || "—",
    status: a.status,
    isLoanable: a.is_loanable,
    notes: a.notes,
    currentLoan: a.loan_id
      ? {
          id: a.loan_id,
          borrower: { id: a.bid, name: a.bname, fullName: a.bfull },
          borrowedAt: isoReq(a.borrowed_at),
          dueAt: isoReq(a.due_at),
          isMine: !!a.mine,
          isOverdue: new Date(a.due_at).getTime() < now,
        }
      : null,
  }));
}

export async function borrowAsset(tx: Tx, assetId: string, dueAt: string): Promise<string> {
  const me = (await tx.query<{ me: string | null }>("SELECT app.current_member_id() AS me")).rows[0].me;
  if (!me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  const busy = (
    await tx.query(
      `SELECT m.display_name FROM asset_loans l JOIN members m ON m.id = l.borrower_member_id
        WHERE l.asset_id = $1 AND l.status = 'open'`,
      [assetId]
    )
  ).rows[0];
  if (busy) throw conflict(`Thiết bị đang được ${busy.display_name} mượn — chờ trả rồi mượn sau.`, "ASSET_ON_LOAN");
  const due = new Date(dueAt);
  if (isNaN(due.getTime()) || due.getTime() <= Date.now()) throw new ApiError(400, "VALIDATION_FAILED", "Hạn trả phải sau thời điểm hiện tại.");
  const r = (
    await tx.query<{ id: string }>(
      `INSERT INTO asset_loans (asset_id, borrower_member_id, due_at, checked_out_by)
       VALUES ($1, app.current_member_id(), $2, app.current_user_id()) RETURNING id`,
      [assetId, due.toISOString()]
    )
  ).rows[0];
  return r.id;
}

export async function returnAsset(tx: Tx, loanId: string, note: string | null) {
  const r = await tx.query(
    `UPDATE asset_loans
        SET status = 'returned', returned_at = now(), condition_note = $2,
            received_back_by = CASE WHEN app.has_permission('asset.manage') THEN app.current_user_id() END
      WHERE id = $1 AND status = 'open'`,
    [loanId, note]
  );
  if (!r.rowCount) {
    const l = (await tx.query("SELECT status::text AS status FROM asset_loans WHERE id = $1", [loanId])).rows[0];
    if (!l) throw notFound("Không tìm thấy lượt mượn.");
    if (l.status === "open") throw forbidden("Chỉ người mượn hoặc người quản lý tài sản mới ghi nhận trả được.");
    throw new ApiError(422, "LOAN_CLOSED", "Lượt mượn này đã được trả.");
  }
}

const TAG_PREFIX: Record<string, string> = {
  audio_visual: "AV",
  tool: "DC",
  electrical: "DI",
  appliance: "GD",
  furniture: "NT",
  plumbing: "DN",
  safety: "AT",
  kitchenware: "BEP",
  other: "TB",
};

export async function createAsset(
  tx: Tx,
  i: { name: string; type: string; locationText?: string | null; roomCode?: string | null; isLoanable: boolean; notes?: string | null }
): Promise<string> {
  const prefix = TAG_PREFIX[i.type] ?? "TB";
  const n = (
    await tx.query<{ n: number }>(
      `SELECT COALESCE(max(substring(asset_tag FROM '-([0-9]+)$')::int), 0) + 1 AS n FROM assets WHERE asset_tag LIKE $1 || '-%'`,
      [prefix]
    )
  ).rows[0].n;
  const room = i.roomCode
    ? (await tx.query<{ id: string }>("SELECT id FROM rooms WHERE code = $1 AND deleted_at IS NULL", [i.roomCode])).rows[0]?.id ?? null
    : null;
  const r = (
    await tx.query<{ id: string }>(
      `INSERT INTO assets (asset_tag, name, asset_type, room_id, location_text, is_loanable, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, app.current_user_id()) RETURNING id`,
      [`${prefix}-${String(n).padStart(3, "0")}`, i.name.trim(), i.type, room, i.locationText?.trim() || null, i.isLoanable, i.notes?.trim() || null]
    )
  ).rows[0];
  return r.id;
}
