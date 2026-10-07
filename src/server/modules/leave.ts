import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { zUuid } from "../http";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { normalizePhone } from "../auth/session";
import { permissions } from "./community-shared";
import { postZaloEvent } from "../integrations/zalo";
import type { LeaveDoorDutyDto, LeaveEventOption, LeaveKind, LeaveListDto, LeaveRequestDto } from "@/lib/types/leave";
import { LEAVE_KIND_LABEL, isDoorKind } from "@/lib/types/leave";

// Đơn xin phép. Quy tắc nghiệp vụ nằm ở CSDL: RLS (tự xem đơn mình / người duyệt xem tất cả), trigger BR-EVT-07 (không tự duyệt đơn của mình),
// đơn vắng sự kiện được duyệt ⇒ điểm danh "excused", ràng buộc thời gian/lý do/nơi đến.

type Row = Record<string, any>;
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

export const LeaveCreateSchema = z.object({
  kind: z.enum(["event_absence", "late_return", "overnight_out", "long_leave"]),
  eventId: zUuid.nullable().optional(),
  startsAt: z.string().datetime({ offset: true, message: "Thời điểm bắt đầu không hợp lệ." }),
  endsAt: z.string().datetime({ offset: true, message: "Thời điểm kết thúc không hợp lệ." }),
  reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự.").max(500, "Lý do tối đa 500 ký tự."),
  destination: z.string().trim().max(200, "Nơi đến tối đa 200 ký tự.").nullable().optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  /** Người được nhờ để cửa (chỉ đơn về muộn / ngủ ngoài) */
  doorMemberId: zUuid.nullable().optional(),
});
export type LeaveCreateInput = z.infer<typeof LeaveCreateSchema>;

/** Xin thêm giờ cho đơn về muộn / ngủ ngoài đã gửi: giờ về mới + lý do. */
export const LeaveExtendSchema = z.object({
  newEndsAt: z.string().datetime({ offset: true, message: "Giờ mới không hợp lệ." }),
  reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự.").max(500, "Lý do tối đa 500 ký tự."),
});
export type LeaveExtendInput = z.infer<typeof LeaveExtendSchema>;

export const LeaveActionSchema = z.object({
  action: z.enum(["cancel", "approve", "reject"]),
  note: z.string().trim().max(500).nullable().optional(),
});
export type LeaveActionInput = z.infer<typeof LeaveActionSchema>;

const EXTEND_WINDOW_MS = 12 * 3600_000; // khớp trigger tg_leave_extensions_rules
const MAX_EXTENSIONS = 5;
const isoOf = (v: unknown) => new Date(String(v)).toISOString();

const toDto = (r: Row): LeaveRequestDto => {
  const extensions = (Array.isArray(r.extensions) ? (r.extensions as Row[]) : []).map((x) => ({ id: x.id as string, newEndsAt: isoOf(x.newEndsAt), reason: x.reason as string, createdAt: isoOf(x.createdAt) }));
  const effectiveEndsAt = extensions.reduce((m, x) => (new Date(x.newEndsAt) > new Date(m) ? x.newEndsAt : m), iso(r.ends_at));
  const canExtend =
    !!r.is_mine && isDoorKind(r.kind) && (r.status === "pending" || r.status === "approved") && extensions.length < MAX_EXTENSIONS && Date.now() <= new Date(effectiveEndsAt).getTime() + EXTEND_WINDOW_MS;
  return {
  id: r.id,
  memberId: r.member_id,
  memberName: r.member_name,
  kind: r.kind,
  eventId: r.event_id,
  eventTitle: r.event_title ?? null,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  reason: r.reason,
  destination: r.destination,
  contactPhone: r.contact_phone_e164,
  status: r.status,
  decidedByName: r.decided_by_name ?? null,
  decidedAt: r.decided_at ? iso(r.decided_at) : null,
  decisionNote: r.decision_note,
  createdAt: iso(r.created_at),
  isMine: !!r.is_mine,
  doorMemberId: r.door_member_id ?? null,
  doorMemberName: r.door_member_name ?? null,
  extensions,
  effectiveEndsAt,
  canExtend,
  };
};

const SELECT = `
  SELECT l.id, l.member_id, COALESCE(m.display_name, m.full_name) AS member_name, l.kind::text AS kind, l.event_id, e.title AS event_title,
         l.starts_at, l.ends_at, l.reason, l.destination, l.contact_phone_e164, l.status::text AS status, l.decided_at, l.decision_note, l.created_at,
         (SELECT COALESCE(dm.display_name, dm.full_name) FROM members dm WHERE dm.user_id = l.decided_by LIMIT 1) AS decided_by_name,
         (l.member_id = app.current_member_id()) AS is_mine,
         l.door_member_id,
         (SELECT COALESCE(dk.display_name, dk.full_name) FROM members dk WHERE dk.id = l.door_member_id) AS door_member_name,
         COALESCE((SELECT json_agg(json_build_object('id', x.id, 'newEndsAt', x.new_ends_at, 'reason', x.reason, 'createdAt', x.created_at) ORDER BY x.created_at)
                     FROM leave_extensions x WHERE x.leave_request_id = l.id), '[]'::json) AS extensions
    FROM leave_requests l
    JOIN members m ON m.id = l.member_id
    LEFT JOIN events e ON e.id = l.event_id`;

export async function listLeave(tx: Tx): Promise<LeaveListDto> {
  const perm = await permissions(tx, ["leave.request", "leave.review"] as const);
  const mine = (await tx.query(`${SELECT} WHERE l.member_id = app.current_member_id() ORDER BY l.created_at DESC LIMIT 100`)).rows.map(toDto);
  let review: LeaveRequestDto[] | null = null;
  let pendingCount = 0;
  if (perm["leave.review"]) {
    review = (
      await tx.query(
        `${SELECT} WHERE l.member_id <> app.current_member_id()
            AND (l.status = 'pending' OR l.decided_at > now() - interval '60 days')
          ORDER BY (l.status = 'pending') DESC, l.starts_at ASC LIMIT 200`
      )
    ).rows.map(toDto);
    pendingCount = review.filter((r) => r.status === "pending").length;
  }
  const events: LeaveEventOption[] = perm["leave.request"]
    ? (
        await tx.query(
          `SELECT id, title, starts_at, ends_at FROM events
            WHERE requires_attendance AND status IN ('scheduled', 'ongoing') AND ends_at > now() AND deleted_at IS NULL
            ORDER BY starts_at LIMIT 60`
        )
      ).rows.map((r) => ({ id: r.id, title: r.title, startsAt: iso(r.starts_at), endsAt: iso(r.ends_at) }))
    : [];
  const doorDuties: LeaveDoorDutyDto[] = (await tx.query("SELECT * FROM app.fn_leave_door_duties()")).rows.map((r) => ({
    leaveId: r.leave_id,
    memberName: r.member_name,
    kind: r.kind,
    status: r.status,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    effectiveEndsAt: iso(r.effective_ends_at),
  }));
  return { mine, review, pendingCount, events, doorDuties, canRequest: !!perm["leave.request"], canReview: !!perm["leave.review"] };
}

/** Số đơn chờ duyệt (huy hiệu ở thanh bên) — chỉ người có leave.review. */
export async function countPendingLeave(tx: Tx): Promise<number> {
  if (!(await permissions(tx, ["leave.review"] as const))["leave.review"]) return 0;
  return (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM leave_requests WHERE status = 'pending' AND member_id <> app.current_member_id()")).rows[0].n;
}

export async function createLeave(tx: Tx, b: LeaveCreateInput): Promise<{ id: string; memberName: string; doorMemberName: string | null }> {
  if (!(await permissions(tx, ["leave.request"] as const))["leave.request"]) throw forbidden("Bạn chưa có quyền gửi đơn xin phép.");
  const me = (await tx.query<{ id: string; name: string }>("SELECT id, COALESCE(display_name, full_name) AS name FROM members WHERE id = app.current_member_id()")).rows[0];
  if (!me) throw forbidden("Tài khoản chưa gắn với hồ sơ thành viên.");

  const starts = new Date(b.startsAt).getTime();
  const ends = new Date(b.endsAt).getTime();
  if (!(ends > starts)) throw badRequest("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
  if (ends - starts > 120 * 86400_000) throw badRequest("Mỗi đơn tối đa 120 ngày.");
  if (ends < Date.now()) throw badRequest("Thời gian xin phép đã qua.");

  let eventId: string | null = null;
  let startsAt = b.startsAt;
  let endsAt = b.endsAt;
  if (b.kind === "event_absence") {
    if (!b.eventId) throw badRequest("Hãy chọn sự kiện bạn xin vắng.");
    const ev = (await tx.query("SELECT id, starts_at, ends_at FROM events WHERE id = $1 AND requires_attendance AND status IN ('scheduled', 'ongoing') AND deleted_at IS NULL", [b.eventId])).rows[0];
    if (!ev) throw badRequest("Sự kiện không tồn tại, đã kết thúc hoặc không yêu cầu điểm danh.");
    eventId = ev.id;
    startsAt = iso(ev.starts_at); // đơn vắng sự kiện luôn bao trùm khung giờ sự kiện
    endsAt = iso(ev.ends_at);
    const dup = (await tx.query("SELECT 1 FROM leave_requests WHERE member_id = $1 AND event_id = $2 AND status IN ('pending', 'approved')", [me.id, eventId])).rows[0];
    if (dup) throw conflict("Bạn đã gửi đơn xin vắng sự kiện này rồi.", "LEAVE_DUPLICATE");
  }
  if ((b.kind === "overnight_out" || b.kind === "long_leave") && !b.destination?.trim()) throw badRequest("Hãy cho biết nơi bạn đến.");
  const phone = normalizePhone(b.contactPhone);
  if (b.contactPhone?.trim() && !(phone && /^\+\d{8,15}$/.test(phone))) throw badRequest("Số điện thoại liên lạc không hợp lệ.");

  // Nhờ người để cửa: chỉ đơn về muộn / ngủ ngoài; phải là thành viên đang ở nhà và không phải chính mình
  let doorMemberId: string | null = null;
  let doorMemberName: string | null = null;
  if (b.doorMemberId && isDoorKind(b.kind)) {
    if (b.doorMemberId === me.id) throw badRequest("Hãy nhờ một anh em khác để cửa giúp bạn.");
    const dm = (await tx.query<{ id: string; name: string }>("SELECT id, COALESCE(display_name, full_name) AS name FROM members WHERE id = $1 AND deleted_at IS NULL AND status IN ('active', 'on_leave')", [b.doorMemberId])).rows[0];
    if (!dm) throw badRequest("Không tìm thấy người được nhờ để cửa.");
    doorMemberId = dm.id;
    doorMemberName = dm.name;
  }

  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO leave_requests (member_id, kind, event_id, starts_at, ends_at, reason, destination, contact_phone_e164, door_member_id)
       VALUES ($1, $2::leave_kind_t, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9) RETURNING id`,
      [me.id, b.kind, eventId, startsAt, endsAt, b.reason.trim(), b.destination?.trim() || null, phone, doorMemberId]
    )
  ).rows[0].id;
  return { id, memberName: me.name, doorMemberName };
}

/**
 * Xin thêm giờ cho đơn về muộn / ngủ ngoài của MÌNH (đã xin phép rồi mà có chuyện phát sinh). Luật kiểm ở trigger DB
 * (tg_leave_extensions_rules): chính chủ, đơn còn chờ duyệt/đã duyệt, giờ mới muộn hơn giờ đã báo (tối đa +24 giờ), còn trong thời hạn, tối đa 5 lần.
 */
export async function extendLeave(
  tx: Tx,
  id: string,
  b: LeaveExtendInput
): Promise<{ memberName: string; kind: LeaveKind; oldEnd: string; newEnd: string; reason: string; doorMemberId: string | null; doorMemberName: string | null }> {
  if (!(await permissions(tx, ["leave.request"] as const))["leave.request"]) throw forbidden("Bạn chưa có quyền gửi đơn xin phép.");
  const cur = (
    await tx.query<Row>(
      `SELECT l.member_id, l.kind::text AS kind, l.door_member_id, COALESCE(m.display_name, m.full_name) AS member_name,
              GREATEST(l.ends_at, COALESCE((SELECT max(x.new_ends_at) FROM leave_extensions x WHERE x.leave_request_id = l.id), l.ends_at)) AS effective_end,
              (SELECT COALESCE(dk.display_name, dk.full_name) FROM members dk WHERE dk.id = l.door_member_id) AS door_name
         FROM leave_requests l JOIN members m ON m.id = l.member_id WHERE l.id = $1`,
      [id]
    )
  ).rows[0];
  if (!cur) throw notFound("Không tìm thấy đơn xin phép.");
  if (cur.member_id !== (await tx.query<{ id: string }>("SELECT app.current_member_id() AS id")).rows[0].id) throw forbidden("Bạn chỉ xin thêm giờ được cho đơn của chính mình.");
  if (!isDoorKind(cur.kind)) throw badRequest("Chỉ đơn về muộn hoặc ngủ ngoài mới xin thêm giờ được.");
  try {
    await tx.query("INSERT INTO leave_extensions (leave_request_id, new_ends_at, reason) VALUES ($1, $2::timestamptz, $3)", [id, b.newEndsAt, b.reason.trim()]);
  } catch (e) {
    // luật nghiệp vụ ở trigger DB: trả đúng câu thông báo tiếng Việt cho người dùng
    const pg = e as { code?: string; message?: string };
    if (pg.code === "23514" && pg.message) throw badRequest(pg.message);
    if (pg.code === "42501" && pg.message) throw forbidden(pg.message);
    throw e;
  }
  return { memberName: cur.member_name, kind: cur.kind as LeaveKind, oldEnd: iso(cur.effective_end), newEnd: b.newEndsAt, reason: b.reason.trim(), doorMemberId: cur.door_member_id ?? null, doorMemberName: cur.door_name ?? null };
}

/** Người xin hủy đơn của mình (khi còn chờ duyệt). */
async function cancelLeave(tx: Tx, id: string) {
  const r = await tx.query("UPDATE leave_requests SET status = 'cancelled' WHERE id = $1 AND member_id = app.current_member_id() AND status = 'pending'", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy đơn đang chờ duyệt của bạn.");
}

async function decideLeave(tx: Tx, id: string, action: "approve" | "reject", note: string | null) {
  if (!(await permissions(tx, ["leave.review"] as const))["leave.review"]) throw forbidden("Bạn không có quyền duyệt đơn xin phép.");
  if (action === "reject" && (note ?? "").trim().length < 5) throw badRequest("Hãy ghi lý do từ chối (tối thiểu 5 ký tự).");
  const cur = (await tx.query<{ status: string }>("SELECT status::text AS status FROM leave_requests WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy đơn xin phép.");
  if (cur.status !== "pending") throw conflict("Đơn này đã được xử lý.", "LEAVE_DECIDED");
  try {
    await tx.query("UPDATE leave_requests SET status = $2::leave_status_t, decision_note = $3 WHERE id = $1 AND status = 'pending'", [id, action === "approve" ? "approved" : "rejected", note?.trim() || null]);
  } catch (e) {
    // trigger BR-EVT-07: không tự duyệt đơn của chính mình
    if (/BR-EVT-07/.test((e as Error).message)) throw forbidden("Bạn không được tự duyệt đơn xin phép của chính mình.");
    throw e;
  }
}

export async function actOnLeave(tx: Tx, id: string, b: LeaveActionInput) {
  if (b.action === "cancel") return cancelLeave(tx, id);
  return decideLeave(tx, id, b.action, b.note ?? null);
}

const fmtVn = (d: string) =>
  new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(d));

const VN_TZ = "Asia/Ho_Chi_Minh";
const hmOf = (d: string) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: VN_TZ }).format(new Date(d));
const dmOf = (d: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: VN_TZ }).format(new Date(d));
const dayOf = (d: string | Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: VN_TZ }).format(new Date(d));
/** "23:30 hôm nay" / "00:30 ngày 13/10" — cho tin Zalo và thông báo. */
const timeLabel = (d: string) => (dayOf(d) === dayOf(new Date()) ? `${hmOf(d)} hôm nay` : `${hmOf(d)} ngày ${dmOf(d)}`);

/**
 * Báo người duyệt có đơn mới (vai trò luuxa_worker — luuxa_app không gọi được app.fn_notify). Lỗi gửi không làm hỏng việc chính.
 * Đơn về muộn / ngủ ngoài: báo thêm người được nhờ để cửa (trong ứng dụng) và đăng thẳng vào nhóm Zalo của nhà.
 */
export async function notifyLeaveSubmitted(
  ctx: Ctx,
  input: { id: string; memberName: string; kind: LeaveKind; startsAt: string; endsAt?: string; reason?: string; destination?: string | null; doorMemberId?: string | null; doorMemberName?: string | null }
) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      await tx.query("SELECT app.fn_notify_roles(ARRAY['house_head', 'admin'], 'event.leave_submitted', $1, $2, $3::jsonb, 'leave_requests', $4)", [
        `${input.memberName} xin phép: ${LEAVE_KIND_LABEL[input.kind].toLowerCase()}`,
        `Từ ${fmtVn(input.startsAt)} — bấm để xem và duyệt.`,
        JSON.stringify({ link: "/xin-phep" }),
        input.id,
      ]);
      if (input.doorMemberId && isDoorKind(input.kind)) {
        await tx.query("SELECT app.fn_notify($1, 'event.leave_door', $2, $3, $4::jsonb, 'leave_requests', $5)", [
          input.doorMemberId,
          "Bạn được nhờ để cửa",
          `${input.memberName} ${input.kind === "late_return" ? "về muộn" : "ngủ ngoài"}${input.endsAt ? ` — dự kiến về ${timeLabel(input.endsAt)}` : ""}.`,
          JSON.stringify({ link: "/xin-phep" }),
          input.id,
        ]);
      }
    });
  } catch (e) {
    console.error("[leave] báo người duyệt lỗi:", (e as Error).message);
  }

  // Đơn về muộn / ngủ ngoài ⇒ báo vào nhóm Zalo (không ném lỗi; tắt/thiếu cấu hình thì bỏ qua)
  if (isDoorKind(input.kind) && input.endsAt) {
    const late = input.kind === "late_return";
    await postZaloEvent(ctx, "leave_notice", {
      kind: late ? "VỀ MUỘN" : "NGỦ NGOÀI",
      member: input.memberName,
      when: late ? `Dự kiến về lúc ${timeLabel(input.endsAt)}` : `Từ ${timeLabel(input.startsAt)} đến ${timeLabel(input.endsAt)}`,
      destination: input.destination ?? "",
      reason: input.reason ?? "",
      door: input.doorMemberName ?? "",
    });
  }
}

/** Báo người duyệt + người để cửa (trong ứng dụng) và đăng vào nhóm Zalo khi có người xin thêm giờ. */
export async function notifyLeaveExtended(
  ctx: Ctx,
  input: { id: string; memberName: string; kind: LeaveKind; oldEnd: string; newEnd: string; reason: string; doorMemberId: string | null; doorMemberName: string | null }
) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const body = `${input.memberName} xin về lúc ${timeLabel(input.newEnd)} (đã báo ${timeLabel(input.oldEnd)}): ${input.reason}`;
      await tx.query("SELECT app.fn_notify_roles(ARRAY['house_head', 'admin'], 'event.leave_extended', $1, $2, $3::jsonb, 'leave_requests', $4)", [
        `${input.memberName} xin thêm giờ`,
        body,
        JSON.stringify({ link: "/xin-phep" }),
        input.id,
      ]);
      if (input.doorMemberId) {
        await tx.query("SELECT app.fn_notify($1, 'event.leave_door', $2, $3, $4::jsonb, 'leave_requests', $5)", [
          input.doorMemberId,
          "Giờ về mới — bạn đang được nhờ để cửa",
          body,
          JSON.stringify({ link: "/xin-phep" }),
          input.id,
        ]);
      }
    });
  } catch (e) {
    console.error("[leave] báo xin thêm giờ lỗi:", (e as Error).message);
  }
  await postZaloEvent(ctx, "leave_extension", {
    kind: input.kind === "late_return" ? "về muộn" : "ngủ ngoài",
    member: input.memberName,
    old_time: timeLabel(input.oldEnd),
    new_time: timeLabel(input.newEnd),
    reason: input.reason,
    door: input.doorMemberName ?? "",
  });
}

/** Báo người xin phép biết kết quả. */
export async function notifyLeaveDecided(ctx: Ctx, id: string) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const r = (await tx.query("SELECT member_id, status::text AS status, kind::text AS kind, decision_note FROM leave_requests WHERE id = $1", [id])).rows[0];
      if (!r || (r.status !== "approved" && r.status !== "rejected")) return;
      const ok = r.status === "approved";
      await tx.query("SELECT app.fn_notify($1, 'event.leave_decided', $2, $3, $4::jsonb, 'leave_requests', $5)", [
        r.member_id,
        ok ? "Đơn xin phép của bạn đã được duyệt" : "Đơn xin phép của bạn chưa được duyệt",
        `${LEAVE_KIND_LABEL[r.kind as LeaveKind]}${r.decision_note ? ` — ${r.decision_note}` : ""}`,
        JSON.stringify({ link: "/xin-phep" }),
        id,
      ]);
    });
  } catch (e) {
    console.error("[leave] báo kết quả lỗi:", (e as Error).message);
  }
}
