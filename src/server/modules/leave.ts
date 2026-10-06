import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { zUuid } from "../http";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { normalizePhone } from "../auth/session";
import { permissions } from "./community-shared";
import type { LeaveEventOption, LeaveKind, LeaveListDto, LeaveRequestDto } from "@/lib/types/leave";
import { LEAVE_KIND_LABEL } from "@/lib/types/leave";

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
});
export type LeaveCreateInput = z.infer<typeof LeaveCreateSchema>;

export const LeaveActionSchema = z.object({
  action: z.enum(["cancel", "approve", "reject"]),
  note: z.string().trim().max(500).nullable().optional(),
});
export type LeaveActionInput = z.infer<typeof LeaveActionSchema>;

const toDto = (r: Row): LeaveRequestDto => ({
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
});

const SELECT = `
  SELECT l.id, l.member_id, COALESCE(m.display_name, m.full_name) AS member_name, l.kind::text AS kind, l.event_id, e.title AS event_title,
         l.starts_at, l.ends_at, l.reason, l.destination, l.contact_phone_e164, l.status::text AS status, l.decided_at, l.decision_note, l.created_at,
         (SELECT COALESCE(dm.display_name, dm.full_name) FROM members dm WHERE dm.user_id = l.decided_by LIMIT 1) AS decided_by_name,
         (l.member_id = app.current_member_id()) AS is_mine
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
  return { mine, review, pendingCount, events, canRequest: !!perm["leave.request"], canReview: !!perm["leave.review"] };
}

/** Số đơn chờ duyệt (huy hiệu ở thanh bên) — chỉ người có leave.review. */
export async function countPendingLeave(tx: Tx): Promise<number> {
  if (!(await permissions(tx, ["leave.review"] as const))["leave.review"]) return 0;
  return (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM leave_requests WHERE status = 'pending' AND member_id <> app.current_member_id()")).rows[0].n;
}

export async function createLeave(tx: Tx, b: LeaveCreateInput): Promise<{ id: string; memberName: string }> {
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

  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO leave_requests (member_id, kind, event_id, starts_at, ends_at, reason, destination, contact_phone_e164)
       VALUES ($1, $2::leave_kind_t, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8) RETURNING id`,
      [me.id, b.kind, eventId, startsAt, endsAt, b.reason.trim(), b.destination?.trim() || null, phone]
    )
  ).rows[0].id;
  return { id, memberName: me.name };
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

/** Báo người duyệt có đơn mới (vai trò luuxa_worker — luuxa_app không gọi được app.fn_notify). Lỗi gửi không làm hỏng việc chính. */
export async function notifyLeaveSubmitted(ctx: Ctx, input: { id: string; memberName: string; kind: LeaveKind; startsAt: string }) {
  try {
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query("SELECT app.fn_notify_roles(ARRAY['house_head', 'admin'], 'event.leave_submitted', $1, $2, $3::jsonb, 'leave_requests', $4)", [
        `${input.memberName} xin phép: ${LEAVE_KIND_LABEL[input.kind].toLowerCase()}`,
        `Từ ${fmtVn(input.startsAt)} — bấm để xem và duyệt.`,
        JSON.stringify({ link: "/xin-phep" }),
        input.id,
      ])
    );
  } catch (e) {
    console.error("[leave] báo người duyệt lỗi:", (e as Error).message);
  }
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
