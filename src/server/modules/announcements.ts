import "server-only";
import type { Tx } from "../db";
import { ApiError, notFound } from "../errors";
import type {
  AnnouncementDto,
  AnnouncementMetaDto,
  AnnouncementReaderDto,
  AttachmentDto,
  TargetType,
  UnreadCountDto,
} from "@/lib/types/community";
import { categoryLabel } from "@/lib/community-format";
import {
  assertCategory,
  currentMemberId,
  denyOrMissing,
  iso,
  isoOrNull,
  listCategories,
  permissions,
  personCols,
  personJoin,
  previewOf,
  toPerson,
} from "./community-shared";

// ---------------------------------------------------------------------
// Danh sách / chi tiết
// ---------------------------------------------------------------------

/** Điều kiện "đang hiển thị trên bảng tin" (RLS lo phần ai được xem). */
const LIVE = `a.deleted_at IS NULL AND a.status = 'published' AND (a.expires_at IS NULL OR a.expires_at > now())`;

const SELECT = `
  SELECT a.id, a.title, a.content, a.category_id, c.code AS cat_code, c.name AS cat_name, c.color AS cat_color,
         (a.is_pinned AND (a.pinned_until IS NULL OR a.pinned_until > now())) AS pinned, a.pinned_until,
         a.requires_ack, a.ack_deadline, a.published_at, a.created_at, a.event_id, a.author_member_id,
         ${personCols("au")},
         rd.read_at, rd.acknowledged_at,
         app.is_announcement_target(a.id) AS is_target,
         app.fn_announcement_target_count(a.id) AS target_count,
         rc.read_count, rc.ack_count
    FROM announcements a
    JOIN categories c ON c.id = a.category_id
    ${personJoin("au", "a.author_member_id")}
    LEFT JOIN announcement_reads rd ON rd.announcement_id = a.id AND rd.member_id = app.current_member_id()
    LEFT JOIN LATERAL app.fn_announcement_read_counts(a.id) rc ON true`;

type Row = Record<string, any>;

interface Ctx {
  me: string;
  canPin: boolean;
  /** Số thành viên đang ở (mẫu số khi thông báo gửi toàn thể) */
  activeCount: number;
}

async function viewer(tx: Tx): Promise<Ctx> {
  const me = await currentMemberId(tx);
  const p = await permissions(tx, ["announcement.pin"] as const);
  const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM members WHERE status = 'active' AND deleted_at IS NULL")).rows[0]?.n ?? 0;
  return { me, canPin: p["announcement.pin"], activeCount: n };
}

async function attachmentsFor(tx: Tx, ids: string[]): Promise<Map<string, AttachmentDto[]>> {
  const out = new Map<string, AttachmentDto[]>();
  if (!ids.length) return out;
  const rows = (
    await tx.query(
      `SELECT ma.entity_id, f.id, f.original_name, f.size_bytes, f.detected_mime, f.object_key
         FROM media_attachments ma JOIN storage_files f ON f.id = ma.file_id
        WHERE ma.entity_type = 'announcement' AND ma.entity_id = ANY($1::uuid[]) AND f.status = 'ready'
        ORDER BY ma.position, ma.created_at`,
      [ids]
    )
  ).rows;
  for (const r of rows) {
    const list = out.get(r.entity_id) ?? [];
    const ext = String(r.object_key).split(".").pop();
    list.push({
      id: r.id,
      name: r.original_name || `tai-lieu-dinh-kem.${ext}`,
      sizeBytes: Number(r.size_bytes) || 0,
      mime: r.detected_mime ?? "application/octet-stream",
      url: `/api/v1/files/${r.id}`,
      downloadUrl: `/api/v1/files/${r.id}?download=1`,
    });
    out.set(r.entity_id, list);
  }
  return out;
}

async function eventsFor(tx: Tx, eventIds: string[]) {
  const out = new Map<string, AnnouncementDto["event"]>();
  if (!eventIds.length) return out;
  const rows = (
    await tx.query(
      `SELECT e.id, e.title, e.starts_at, e.location_text,
              COALESCE((SELECT p.rsvp FROM event_participants p WHERE p.event_id = e.id AND p.member_id = app.current_member_id()), 'none') AS my_rsvp
         FROM events e WHERE e.id = ANY($1::uuid[]) AND e.deleted_at IS NULL`,
      [eventIds]
    )
  ).rows;
  // Số người báo có mặt: dùng hàm tổng hợp của phân hệ Sự kiện nếu đã có (RLS chỉ cho thấy RSVP của chính mình)
  const going = new Map<string, number>();
  const hasStats = (await tx.query("SELECT to_regprocedure('app.fn_event_stats(uuid[])') IS NOT NULL AS ok")).rows[0]?.ok;
  if (hasStats && rows.length) {
    for (const s of (await tx.query("SELECT event_id, rsvp_going FROM app.fn_event_stats($1::uuid[])", [rows.map((r) => r.id)])).rows) {
      going.set(s.event_id, Number(s.rsvp_going));
    }
  }
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      title: r.title,
      startsAt: iso(r.starts_at),
      location: r.location_text ?? null,
      myRsvp: r.my_rsvp,
      goingCount: going.has(r.id) ? going.get(r.id)! : null,
    });
  }
  return out;
}

async function targetLabels(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  // announcement_targets chỉ người đăng / announcement.pin đọc được (RLS) — người khác nhận nhãn chung
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows = (
    await tx.query(
      `SELECT t.announcement_id,
              COALESCE(r.name_vi, f.name, rm.code, m.display_name) AS label,
              CASE WHEN t.role_id IS NOT NULL THEN 1 WHEN t.floor_id IS NOT NULL THEN 2 WHEN t.room_id IS NOT NULL THEN 3 ELSE 4 END AS ord
         FROM announcement_targets t
         LEFT JOIN roles r ON r.id = t.role_id
         LEFT JOIN floors f ON f.id = t.floor_id
         LEFT JOIN rooms rm ON rm.id = t.room_id
         LEFT JOIN members m ON m.id = t.member_id
        WHERE t.announcement_id = ANY($1::uuid[])
        ORDER BY ord, label`,
      [ids]
    )
  ).rows;
  for (const r of rows) out.set(r.announcement_id, out.has(r.announcement_id) ? `${out.get(r.announcement_id)}, ${r.label}` : r.label);
  return out;
}

async function hydrate(tx: Tx, rows: Row[], v: Ctx): Promise<AnnouncementDto[]> {
  const ids = rows.map((r) => r.id);
  const [atts, evs, targets] = await Promise.all([
    attachmentsFor(tx, ids),
    eventsFor(tx, Array.from(new Set(rows.map((r) => r.event_id).filter(Boolean)))),
    targetLabels(tx, ids),
  ]);
  return rows.map((r) => {
    const author = toPerson(r, "au");
    const isMine = r.author_member_id === v.me;
    const seesStats = isMine || v.canPin;
    return {
      id: r.id,
      title: r.title,
      preview: previewOf(r.content),
      content: r.content,
      category: categoryLabel(r.cat_code, r.cat_name),
      categoryId: r.category_id,
      categoryCode: r.cat_code,
      categoryName: r.cat_name,
      categoryColor: r.cat_color,
      isPinned: !!r.pinned,
      pinnedUntil: isoOrNull(r.pinned_until),
      isUnread: !!r.is_target && !r.read_at && !isMine,
      readAt: isoOrNull(r.read_at),
      author: author.fullName,
      authorRole: author.room ? `${author.role} · ${author.room}` : author.role,
      authorRef: author,
      createdAt: iso(r.created_at),
      publishedAt: iso(r.published_at ?? r.created_at),
      requiresAck: !!r.requires_ack,
      ackDeadline: isoOrNull(r.ack_deadline),
      acknowledgedAt: isoOrNull(r.acknowledged_at),
      event: r.event_id ? evs.get(r.event_id) ?? null : null,
      attachments: atts.get(r.id) ?? [],
      targetLabel:
        targets.get(r.id) ??
        (seesStats || Number(r.target_count) >= v.activeCount ? "Toàn thể thành viên" : `${r.target_count} thành viên được chọn`),
      isTarget: !!r.is_target,
      stats: {
        targetCount: Number(r.target_count) || 0,
        readCount: seesStats ? Number(r.read_count) : null,
        ackCount: seesStats ? Number(r.ack_count) : null,
      },
      isMine,
      canManage: isMine || v.canPin,
      canPin: v.canPin,
    };
  });
}

export async function listAnnouncements(tx: Tx, opts: { limit?: number; category?: string | null; unreadOnly?: boolean } = {}): Promise<AnnouncementDto[]> {
  const v = await viewer(tx);
  const params: unknown[] = [Math.min(Math.max(opts.limit ?? 100, 1), 200)];
  let where = LIVE;
  if (opts.category) {
    params.push(opts.category);
    where += ` AND (c.code = $${params.length} OR c.id::text = $${params.length})`;
  }
  if (opts.unreadOnly) where += ` AND rd.read_at IS NULL AND app.is_announcement_target(a.id) AND a.author_member_id <> app.current_member_id()`;
  const rows = (await tx.query(`${SELECT} WHERE ${where} ORDER BY pinned DESC, a.published_at DESC NULLS LAST, a.created_at DESC LIMIT $1`, params)).rows;
  return hydrate(tx, rows, v);
}

export async function getAnnouncement(tx: Tx, id: string): Promise<AnnouncementDto> {
  const v = await viewer(tx);
  const rows = (await tx.query(`${SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id])).rows;
  if (!rows.length) throw notFound("Không tìm thấy thông báo.");
  return (await hydrate(tx, rows, v))[0];
}

/** Ai đã đọc / chưa đọc — chỉ người đăng và người quản lý (announcement.pin). */
export async function listReaders(tx: Tx, id: string): Promise<{ read: AnnouncementReaderDto[]; unread: AnnouncementReaderDto[] }> {
  const a = await getAnnouncement(tx, id);
  if (!a.canManage) throw new ApiError(403, "FORBIDDEN", "Chỉ người đăng và người quản lý xem được danh sách đã đọc.");
  const rows = (
    await tx.query(
      `SELECT ${personCols("pm")}, r.read_at, r.acknowledged_at
         FROM members pm_base
         ${personJoin("pm", "pm_base.id")}
         LEFT JOIN announcement_reads r ON r.announcement_id = $1 AND r.member_id = pm_base.id
        WHERE pm_base.deleted_at IS NULL AND pm_base.status = 'active'
          AND (NOT EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = $1)
               OR EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = $1 AND (
                    t.member_id = pm_base.id
                 OR t.room_id IN (SELECT ra.room_id FROM room_assignments ra WHERE ra.member_id = pm_base.id AND ra.ends_on IS NULL)
                 OR t.floor_id IN (SELECT rr.floor_id FROM room_assignments ra JOIN rooms rr ON rr.id = ra.room_id WHERE ra.member_id = pm_base.id AND ra.ends_on IS NULL)
                 OR t.role_id IN (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = pm_base.user_id AND ur.revoked_at IS NULL
                                    AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())))))
        ORDER BY r.read_at DESC NULLS LAST, pm_base.display_name`,
      [id]
    )
  ).rows;
  const list = rows.map((r) => ({ member: toPerson(r, "pm"), readAt: isoOrNull(r.read_at), acknowledgedAt: isoOrNull(r.acknowledged_at) }));
  return { read: list.filter((x) => x.readAt), unread: list.filter((x) => !x.readAt && x.member.id !== a.authorRef.id) };
}

export async function announcementMeta(tx: Tx): Promise<AnnouncementMetaDto> {
  const [categories, floors, rooms, roles, events] = await Promise.all([
    listCategories(tx, "announcement"),
    tx.query("SELECT id, name FROM floors WHERE deleted_at IS NULL ORDER BY level"),
    tx.query(
      `SELECT r.id, r.code, r.name FROM rooms r
        WHERE r.deleted_at IS NULL AND r.room_type = 'bedroom' ORDER BY r.code`
    ),
    tx.query("SELECT id, code, name_vi AS name FROM roles WHERE code <> 'admin' ORDER BY rank NULLS LAST, code"),
    tx.query(
      `SELECT e.id, e.title, e.starts_at FROM events e
        WHERE e.deleted_at IS NULL AND e.status IN ('scheduled', 'ongoing') AND e.starts_at > now() - interval '1 day'
        ORDER BY e.starts_at LIMIT 30`
    ),
  ]);
  return {
    categories,
    floors: floors.rows,
    rooms: rooms.rows,
    roles: roles.rows,
    events: events.rows.map((e) => ({ id: e.id, title: e.title, startsAt: iso(e.starts_at) })),
  };
}

// ---------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------
export interface CreateAnnouncementInput {
  title: string;
  content: string;
  categoryId: string;
  targets?: { type: TargetType; id: string }[];
  isPinned?: boolean;
  requiresAck?: boolean;
  ackDeadline?: string | null;
  eventId?: string | null;
  attachmentFileId?: string | null;
  notify?: boolean;
}

const TARGET_COL: Record<TargetType, string> = { role: "role_id", floor: "floor_id", room: "room_id", member: "member_id" };

export async function createAnnouncement(tx: Tx, b: CreateAnnouncementInput): Promise<{ id: string; notified: number }> {
  await currentMemberId(tx);
  await assertCategory(tx, b.categoryId, "announcement");
  if (b.eventId) {
    const ok = (await tx.query("SELECT 1 FROM events WHERE id = $1 AND deleted_at IS NULL", [b.eventId])).rowCount;
    if (!ok) throw new ApiError(400, "BAD_EVENT", "Sự kiện liên kết không tồn tại.");
  }
  const requiresAck = !!b.requiresAck;
  const ackDeadline = requiresAck ? b.ackDeadline ?? new Date(Date.now() + 7 * 86400_000).toISOString() : null;
  if (ackDeadline && new Date(ackDeadline).getTime() <= Date.now()) throw new ApiError(400, "BAD_DEADLINE", "Hạn xác nhận phải ở tương lai.");

  // Ghim / "cần xác nhận" là cột của announcement.pin — trigger BR-COM-06 chặn nếu người đăng không có quyền
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO announcements (title, content, category_id, author_member_id, event_id, status, is_pinned, requires_ack, ack_deadline)
       VALUES ($1, $2, $3, app.current_member_id(), $4, 'published', $5, $6, $7)
       RETURNING id`,
      [b.title.trim(), b.content.trim(), b.categoryId, b.eventId ?? null, !!b.isPinned, requiresAck, ackDeadline]
    )
  ).rows[0].id;

  for (const t of b.targets ?? []) {
    await tx.query(`INSERT INTO announcement_targets (announcement_id, ${TARGET_COL[t.type]}) VALUES ($1, $2)`, [id, t.id]);
  }
  if (b.attachmentFileId) {
    // Trigger BR-STO-02/03: tệp phải do chính người đăng tải lên, đúng bucket "attachments"
    await tx.query(
      `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by)
       VALUES ($1, 'announcement', $2, 'attachment', app.current_user_id())`,
      [b.attachmentFileId, id]
    );
  }
  // Người đăng coi như đã đọc
  await tx.query("SELECT app.fn_mark_announcement_read($1, false)", [id]);

  let notified = 0;
  if (b.notify !== false) {
    const p = await permissions(tx, ["notification.send"] as const);
    if (p["notification.send"]) notified = Number((await tx.query("SELECT app.fn_notify_announcement($1) AS n", [id])).rows[0].n);
  }
  return { id, notified };
}

export async function setPinned(tx: Tx, id: string, pinned: boolean) {
  const r = await tx.query("UPDATE announcements SET is_pinned = $2 WHERE id = $1 AND deleted_at IS NULL", [id, pinned]);
  if (!r.rowCount) await denyOrMissing(tx, "announcements", id, "Chỉ người quản lý được ghim thông báo.");
}

export async function deleteAnnouncement(tx: Tx, id: string) {
  const r = await tx.query("UPDATE announcements SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) await denyOrMissing(tx, "announcements", id, "Chỉ người đăng hoặc người quản lý được xóa thông báo này.");
  // Gỡ thông báo trong hộp thư của chính mình (của người khác do job dọn khi hết hạn)
  await tx.query(
    "UPDATE notifications SET archived_at = now() WHERE member_id = app.current_member_id() AND entity_table = 'announcements' AND entity_id = $1 AND archived_at IS NULL",
    [id]
  );
}

export async function markRead(tx: Tx, id: string, acknowledge: boolean) {
  await tx.query("SELECT app.fn_mark_announcement_read($1, $2)", [id, acknowledge]);
  await tx.query(
    `UPDATE notifications SET read_at = now()
      WHERE member_id = app.current_member_id() AND entity_table = 'announcements' AND entity_id = $1 AND read_at IS NULL`,
    [id]
  );
}

export async function markAllRead(tx: Tx): Promise<number> {
  await currentMemberId(tx);
  const r = await tx.query(
    `INSERT INTO announcement_reads (announcement_id, member_id)
     SELECT a.id, app.current_member_id() FROM announcements a
      WHERE ${LIVE} AND app.is_announcement_target(a.id)
     ON CONFLICT (announcement_id, member_id) DO NOTHING`
  );
  await tx.query(
    `UPDATE notifications SET read_at = now()
      WHERE member_id = app.current_member_id() AND entity_table = 'announcements' AND read_at IS NULL`
  );
  return r.rowCount ?? 0;
}

/** "Tôi sẽ có mặt" ⇒ RSVP thật vào sự kiện được liên kết (event_participants). */
export async function rsvp(tx: Tx, id: string, going: boolean) {
  const a = (await tx.query<{ event_id: string | null }>(`SELECT a.event_id FROM announcements a WHERE a.id = $1 AND ${LIVE}`, [id])).rows[0];
  if (!a) throw notFound("Không tìm thấy thông báo.");
  if (!a.event_id) throw new ApiError(422, "NO_EVENT", "Thông báo này không gắn với sự kiện nào.");
  await tx.query(
    `INSERT INTO event_participants (event_id, member_id, rsvp, rsvp_at)
     VALUES ($1, app.current_member_id(), $2, now())
     ON CONFLICT (event_id, member_id) DO UPDATE SET rsvp = EXCLUDED.rsvp, rsvp_at = now()`,
    [a.event_id, going ? "going" : "not_going"]
  );
  await tx.query("SELECT app.fn_mark_announcement_read($1, false)", [id]);
}

export async function unreadAnnouncementCount(tx: Tx): Promise<number> {
  const r = (
    await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM announcements a
        WHERE ${LIVE} AND a.author_member_id IS DISTINCT FROM app.current_member_id() AND app.is_announcement_target(a.id)
          AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.member_id = app.current_member_id())`
    )
  ).rows[0];
  return r?.n ?? 0;
}

export async function unreadCounts(tx: Tx): Promise<UnreadCountDto> {
  const announcementsUnread = await unreadAnnouncementCount(tx);
  const n = (
    await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM notifications
        WHERE member_id = app.current_member_id() AND read_at IS NULL AND archived_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
    )
  ).rows[0];
  return { announcementsUnread, notificationsUnread: n?.n ?? 0 };
}
