import "server-only";
import { z } from "zod";
import { batch, type Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { zDate } from "../http";
import { decryptPii } from "../pii";
import { PHASE_SQL, updateRecord, type RecordPatchInput } from "./discipline";
import { waiveContribution } from "./finance-contributions";
import { decideLeave } from "./leave";
import { changeMemberStatus } from "./members";
import { assignRoom } from "./house";
import { deleteDutyWeek, saveDutyWeek } from "./duty-weeks";
import type {
  DepartureChecklistDto,
  DepartureResultDto,
  ReactivateResultDto,
  ResidenceExportDto,
  ResidenceRowDto,
} from "@/lib/types/members-lifecycle";

// Vào / ra nhà: (1) rời nhà có danh sách việc còn treo — khoản quỹ chưa đóng, tuần trực sắp tới, hình phạt đang mở, đơn xin phép đang chờ —
// xử lý MỘT lần cùng lúc đổi trạng thái; (2) kích hoạt lại một bước; (3) xuất "Danh sách tạm trú" (CCCD đầy đủ, ghi kiểm toán).
// Mọi bước dùng hàm / bảng sẵn có của từng phân hệ dưới RLS của người thao tác — không đặc quyền riêng.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const dmy = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : null);

// ---------------------------------------------------------------------
// Rời nhà
// ---------------------------------------------------------------------
export async function getDepartureChecklist(tx: Tx, memberId: string): Promise<DepartureChecklistDto> {
  const [memR, permR, duesR, dutyR, discR, leaveR, alumR] = await batch(tx, [
    ["SELECT id, full_name, status::text AS status, (id = app.current_member_id()) AS is_self FROM members WHERE id = $1 AND deleted_at IS NULL", [memberId]],
    [
      `SELECT app.has_permission('finance.contribution.waive') AS waive, app.has_permission('duty.manage') AS duty,
              app.has_permission('discipline.manage') AS disc, app.has_permission('leave.review') AS leave`,
    ],
    [
      `SELECT ct.id, cp.name AS plan_name, ct.due_date::text AS due_date, (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd)::bigint AS remaining
         FROM contributions ct
         JOIN contribution_plans cp ON cp.id = ct.plan_id AND cp.status NOT IN ('cancelled', 'draft')
        WHERE ct.member_id = $1 AND ct.status IN ('unpaid', 'partial') AND ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd > 0
        ORDER BY ct.due_date, cp.name LIMIT 200`,
      [memberId],
    ],
    [
      `SELECT w.id, w.week_start::text AS week_start,
              COALESCE((SELECT array_agg(COALESCE(o.display_name, o.full_name) ORDER BY o.display_name)
                          FROM duty_week_members om JOIN members o ON o.id = om.member_id
                         WHERE om.week_id = w.id AND om.member_id <> $1), '{}') AS partners
         FROM duty_weeks w JOIN duty_week_members wm ON wm.week_id = w.id AND wm.member_id = $1
        WHERE w.week_start + 6 >= app.local_today() AND w.score IS NULL
        ORDER BY w.week_start`,
      [memberId],
    ],
    [
      `SELECT r.id, r.rule_title, ${PHASE_SQL} AS phase, COALESCE(dr.is_red, false) AS is_red
         FROM discipline_records r LEFT JOIN discipline_rules dr ON dr.id = r.rule_id
        WHERE r.member_id = $1 AND r.status = 'open' ORDER BY r.occurred_on DESC`,
      [memberId],
    ],
    ["SELECT id, kind::text AS kind, starts_at, ends_at FROM leave_requests WHERE member_id = $1 AND status = 'pending' ORDER BY starts_at", [memberId]],
    ["SELECT EXISTS (SELECT 1 FROM alumni_profiles WHERE member_id = $1) AS has", [memberId]],
  ]);
  const m = memR.rows[0] as Row | undefined;
  if (!m) throw notFound("Không tìm thấy thành viên.");
  const p = permR.rows[0] as Row;
  const dues = (duesR.rows as Row[]).map((r) => ({ id: r.id, planName: r.plan_name, dueDate: r.due_date, remainingVnd: Number(r.remaining) }));
  return {
    member: { id: m.id, fullName: m.full_name, status: m.status },
    isSelf: !!m.is_self,
    dues: { items: dues, totalVnd: dues.reduce((s, d) => s + d.remainingVnd, 0), canWaive: !!p.waive },
    dutyWeeks: { items: (dutyR.rows as Row[]).map((r) => ({ id: r.id, weekStart: r.week_start, partners: r.partners ?? [] })), canEdit: !!p.duty },
    discipline: { items: (discR.rows as Row[]).map((r) => ({ id: r.id, ruleTitle: r.rule_title, phase: r.phase, isRed: !!r.is_red })), canManage: !!p.disc },
    leaves: {
      items: (leaveR.rows as Row[]).map((r) => ({
        id: r.id,
        kind: r.kind,
        startsAt: r.starts_at instanceof Date ? r.starts_at.toISOString() : String(r.starts_at),
        endsAt: r.ends_at instanceof Date ? r.ends_at.toISOString() : String(r.ends_at),
      })),
      canReview: !!p.leave,
    },
    hasAlumniProfile: !!(alumR.rows[0] as Row | undefined)?.has,
  };
}

export const DepartureSchema = z.object({
  status: z.enum(["left", "alumni"], { message: "Trạng thái phải là left (đã rời) hoặc alumni (cựu thành viên)." }),
  leftOn: zDate.nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  /** Miễn các khoản quỹ chưa đóng (để false = "Để nguyên — vẫn theo dõi") */
  waiveDues: z.boolean().default(false),
  /** Gỡ khỏi tuần trực từ tuần này trở đi (tuần chỉ còn mình người đó thì xóa tuần) */
  removeDutyWeeks: z.boolean().default(false),
  /** Đánh dấu miễn các hình phạt đang mở */
  waiveDiscipline: z.boolean().default(false),
  /** Từ chối các đơn xin phép đang chờ (ghi chú: thành viên đã rời nhà) */
  cancelLeaves: z.boolean().default(false),
  /** Tạo hồ sơ cựu thành viên trống (bổ sung nghề nghiệp sau) */
  createAlumni: z.boolean().default(false),
});
export type DepartureInput = z.infer<typeof DepartureSchema>;

/**
 * Áp dụng các lựa chọn trong danh sách việc treo RỒI đổi trạng thái — tất cả trong MỘT giao dịch (lỗi ở bước nào thì không bước nào được ghi).
 * Quyền từng bước do chính hàm/RLS của phân hệ đó kiểm (miễn quỹ: finance.contribution.waive; tuần trực: duty.manage; hình phạt: discipline.manage;
 * đơn xin phép: leave.review; đổi trạng thái: member.status.change).
 */
export async function applyDeparture(tx: Tx, memberId: string, b: DepartureInput): Promise<DepartureResultDto> {
  const cl = await getDepartureChecklist(tx, memberId);
  if (cl.isSelf) throw new ApiError(422, "SELF_DEPARTURE", "Bạn không thể tự đánh dấu mình đã rời lưu xá — nhờ Trưởng nhà hoặc Admin khác thực hiện.");
  if (cl.member.status === "left" || cl.member.status === "alumni") throw new ApiError(409, "ALREADY_LEFT", "Thành viên này đã rời lưu xá / là cựu thành viên rồi.");
  const when = dmy(b.leftOn ?? new Date().toISOString()) ?? "";
  const note = `Thành viên rời lưu xá ngày ${when}`;
  const out: DepartureResultDto = { status: b.status, duesWaived: 0, duesWaivedVnd: 0, dutyWeeksUpdated: 0, disciplineWaived: 0, leavesRejected: 0, alumniCreated: false };

  if (b.waiveDues) {
    for (const d of cl.dues.items) {
      await waiveContribution(tx, d.id, d.remainingVnd, note);
      out.duesWaived++;
      out.duesWaivedVnd += d.remainingVnd;
    }
  }
  if (b.removeDutyWeeks) {
    if (cl.dutyWeeks.items.length && !cl.dutyWeeks.canEdit) throw forbidden("Bạn không có quyền sửa lịch trực (duty.manage).");
    for (const w of cl.dutyWeeks.items) {
      const others = (
        await tx.query<{ member_id: string }>("SELECT member_id FROM duty_week_members WHERE week_id = $1 AND member_id <> $2", [w.id, memberId])
      ).rows.map((r) => r.member_id);
      if (others.length) {
        const wk = (await tx.query<{ note: string | null }>("SELECT note FROM duty_weeks WHERE id = $1", [w.id])).rows[0];
        await saveDutyWeek(tx, w.weekStart, others, wk?.note ?? null);
      } else {
        await deleteDutyWeek(tx, w.id);
      }
      out.dutyWeeksUpdated++;
    }
  }
  if (b.waiveDiscipline) {
    if (cl.discipline.items.length && !cl.discipline.canManage) throw forbidden("Bạn không có quyền miễn hình phạt (discipline.manage).");
    for (const r of cl.discipline.items) {
      await updateRecord(tx, r.id, { action: "waive", reason: note } as RecordPatchInput);
      out.disciplineWaived++;
    }
  }
  if (b.cancelLeaves) {
    if (cl.leaves.items.length && !cl.leaves.canReview) throw forbidden("Bạn không có quyền xử lý đơn xin phép (leave.review).");
    for (const l of cl.leaves.items) {
      await decideLeave(tx, l.id, "reject", `${note} — đơn không còn hiệu lực.`);
      out.leavesRejected++;
    }
  }
  if (b.createAlumni && !cl.hasAlumniProfile) {
    await tx.query("INSERT INTO alumni_profiles (member_id, keeps_contact) VALUES ($1, false) ON CONFLICT (member_id) DO NOTHING", [memberId]);
    out.alumniCreated = true;
  }
  await changeMemberStatus(tx, memberId, b.status, b.leftOn ?? null, b.reason ?? null);
  return out;
}

// ---------------------------------------------------------------------
// Kích hoạt lại
// ---------------------------------------------------------------------
export const ReactivateSchema = z.object({
  /** Mã phòng cần xếp (tùy chọn; để trống = chưa xếp phòng) */
  roomCode: z.string().trim().min(1).max(40).nullable().optional(),
});

/** Người đã rời / cựu thành viên quay lại: trạng thái "Đang ở" + mở lại tài khoản (nếu bị vô hiệu khi rời) + (tùy chọn) xếp phòng — một giao dịch. */
export async function reactivateMember(tx: Tx, memberId: string, roomCode: string | null | undefined): Promise<ReactivateResultDto> {
  const m = (
    await tx.query<Row>("SELECT status::text AS status, user_id, (id = app.current_member_id()) AS is_self FROM members WHERE id = $1 AND deleted_at IS NULL", [memberId])
  ).rows[0];
  if (!m) throw notFound("Không tìm thấy thành viên.");
  if (m.is_self) throw new ApiError(422, "SELF_REACTIVATE", "Bạn không thể tự đổi trạng thái của mình.");
  if (m.status === "active") throw new ApiError(409, "ALREADY_ACTIVE", "Thành viên này đang ở lưu xá rồi.");
  let accountEnabled = false;
  if (m.user_id) {
    const u = (await tx.query<Row>("SELECT status::text AS status, app.has_permission('auth.user.manage') AS manage FROM users WHERE id = $1 AND deleted_at IS NULL", [m.user_id])).rows[0];
    if (u && u.status === "disabled" && !u.manage) throw forbidden("Tài khoản của thành viên đang bị vô hiệu — cần quyền quản lý tài khoản (Trưởng nhà / Admin) để kích hoạt lại.");
  }
  await changeMemberStatus(tx, memberId, "active", null, null);
  if (m.user_id) {
    const r = await tx.query("UPDATE users SET status = 'active', locked_until = NULL WHERE id = $1 AND status = 'disabled'", [m.user_id]);
    accountEnabled = !!r.rowCount;
  }
  let roomAssigned = false;
  if (roomCode) roomAssigned = await assignRoom(tx, memberId, roomCode, "Quay lại lưu xá");
  return { accountEnabled, roomAssigned };
}

// ---------------------------------------------------------------------
// Danh sách tạm trú (CCCD đầy đủ)
// ---------------------------------------------------------------------
export const ResidenceExportSchema = z.object({
  reason: z.string().trim().min(5, "Hãy ghi lý do xuất (tối thiểu 5 ký tự), vd. “Khai báo tạm trú với công an phường”.").max(300, "Lý do tối đa 300 ký tự."),
});

/**
 * Danh sách thành viên đang ở kèm CCCD ĐẦY ĐỦ để khai báo tạm trú. Chỉ người có member.national_id.read; BẮT BUỘC lý do (≥ 5 ký tự).
 * Mỗi CCCD giải mã qua app.fn_national_id_cipher (kiểm quyền + lý do + ghi kiểm toán READ_SENSITIVE từng người) — làm hàng loạt trong MỘT giao dịch
 * với MỘT lý do; ngày sinh / quê / địa chỉ đọc dưới RLS (member.private.read) nên người xem thiếu quyền sẽ thấy ô trống.
 */
export async function residenceExport(tx: Tx, reason: string): Promise<ResidenceExportDto> {
  const can = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('member.national_id.read') AS ok")).rows[0]?.ok;
  if (!can) throw forbidden("Chỉ người có quyền xem CCCD đầy đủ mới xuất được danh sách tạm trú.");
  if (reason.trim().length < 5) throw badRequest("Hãy ghi lý do xuất (tối thiểu 5 ký tự).");
  const rows = (
    await tx.query<Row>(
      `SELECT m.id, m.full_name, m.joined_on::text AS joined_on, r.code AS room, mpd.birth_date::text AS birth_date, mpd.hometown, mpd.home_address,
              (mpd.national_id_last4 IS NOT NULL) AS has_nid
         FROM members m
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
         LEFT JOIN member_private_details mpd ON mpd.member_id = m.id
        WHERE m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
        ORDER BY r.code NULLS LAST, m.member_no`
    )
  ).rows;
  const withNid = rows.filter((r) => r.has_nid);
  const decrypted = new Map<string, string | null>();
  if (withNid.length) {
    const res = await batch(
      tx,
      withNid.map((r) => ["SELECT national_id_enc FROM app.fn_national_id_cipher($1, $2)", [r.id, reason.trim()]] as const)
    );
    withNid.forEach((r, i) => {
      const enc = (res[i].rows[0] as { national_id_enc: Buffer | null } | undefined)?.national_id_enc;
      decrypted.set(r.id, enc ? decryptPii(enc) : null);
    });
  }
  const out: ResidenceRowDto[] = rows.map((r) => ({
    memberId: r.id,
    fullName: r.full_name,
    birthDate: dmy(r.birth_date),
    hometown: r.hometown ?? null,
    homeAddress: r.home_address ?? null,
    nationalId: decrypted.get(r.id) ?? null,
    joinedOn: dmy(r.joined_on),
    room: r.room ?? null,
  }));
  return { generatedAt: new Date().toISOString(), reason: reason.trim(), rows: out, missingNationalId: out.filter((r) => !r.nationalId).length };
}
