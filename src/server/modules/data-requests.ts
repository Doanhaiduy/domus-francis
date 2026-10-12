import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import { batch, type Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import {
  DATA_REQUEST_NEEDS_DETAILS,
  DATA_REQUEST_STATUSES,
  DATA_REQUEST_STATUS_LABEL,
  DATA_REQUEST_TYPES,
  DATA_REQUEST_TYPE_LABEL,
  type DataRequestDto,
  type DataRequestListDto,
  type DataRequestStatus,
  type DataRequestType,
} from "@/lib/types/data-requests";

// =====================================================================
// Yêu cầu về dữ liệu cá nhân (bảng data_subject_requests của thiết kế; RLS + quyền cột ở db/app/1046):
//   • Thành viên gửi yêu cầu cho CHÍNH MÌNH (xem/sửa/xóa/rút đồng ý/hạn chế/phản đối/khác) và xem các yêu cầu của mình + trả lời.
//   • Người có privacy.manage (hoặc dsr.manage của thiết kế) — Trưởng nhà, Admin — xem mọi yêu cầu, đổi trạng thái, trả lời; với yêu cầu xóa
//     của người ĐÃ RỜI NHÀ thì ẩn danh hóa hồ sơ (app.fn_anonymize_member — đóng yêu cầu luôn).
//   • Hạn phản hồi 72 giờ (due_at mặc định của bảng); còn mở mà quá hạn ⇒ overdue (gấp). Thông báo system.data_request: người quản lý khi có
//     yêu cầu mới, người gửi khi có trả lời / đổi trạng thái. Nhắc yêu cầu quá hạn: bước cron tối privacy-retention.
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/** Người xem có quyền xử lý yêu cầu (privacy.manage mới, hoặc dsr.manage của thiết kế gốc). */
export const MANAGE_SQL = "(app.has_permission('privacy.manage') OR app.has_permission('dsr.manage'))";

/** Thành viên đang giữ quyền xử lý (để báo yêu cầu mới, cảnh báo hạn lưu) — vai trò còn hiệu lực có privacy.manage/dsr.manage, hoặc Admin. */
export const PRIVACY_MANAGERS_SQL = `
  SELECT DISTINCT m.id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN members m ON m.user_id = ur.user_id AND m.deleted_at IS NULL AND m.status = 'active'
   WHERE ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
     AND (r.code = 'admin' OR EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code IN ('privacy.manage', 'dsr.manage')))`;

/** Mỗi người tối đa ngần này yêu cầu còn mở (chống gửi lặp). */
const MAX_OPEN_PER_MEMBER = 5;

export const DataRequestCreateSchema = z
  .object({
    type: z.enum(DATA_REQUEST_TYPES as [DataRequestType, ...DataRequestType[]]),
    details: z
      .string()
      .trim()
      .max(2000, "Mô tả tối đa 2000 ký tự.")
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((b, ctx) => {
    if (DATA_REQUEST_NEEDS_DETAILS.includes(b.type) && (b.details ?? "").length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "Hãy mô tả cụ thể yêu cầu của bạn (tối thiểu 10 ký tự)." });
    }
  });
export type DataRequestCreateInput = z.infer<typeof DataRequestCreateSchema>;

export const DataRequestPatchSchema = z.object({
  status: z.enum(DATA_REQUEST_STATUSES as [DataRequestStatus, ...DataRequestStatus[]]).optional(),
  resolutionNote: z.string().trim().max(2000, "Trả lời tối đa 2000 ký tự.").nullable().optional(),
});
export type DataRequestPatchInput = z.infer<typeof DataRequestPatchSchema>;

export const DataRequestAnonymizeSchema = z.object({
  /** Gõ lại đúng họ tên người gửi để xác nhận (chống bấm nhầm) */
  confirmName: z.string().trim().min(2, "Gõ lại họ tên thành viên để xác nhận.").max(120),
  reason: z.string().trim().min(10, "Ghi căn cứ ẩn danh hóa (tối thiểu 10 ký tự).").max(400, "Căn cứ tối đa 400 ký tự."),
});
export type DataRequestAnonymizeInput = z.infer<typeof DataRequestAnonymizeSchema>;

const SELECT = `
  SELECT d.id, d.member_id, d.request_type::text AS type, d.status::text AS status, d.details, d.received_at, d.due_at, d.completed_at,
         d.resolution_note, d.updated_at,
         (d.member_id = app.current_member_id()) AS is_mine,
         (d.status IN ('received', 'in_progress') AND d.due_at < now()) AS overdue,
         (SELECT COALESCE(hm.display_name, hm.full_name) FROM members hm WHERE hm.user_id = d.handled_by LIMIT 1) AS handled_by_name,
         m.full_name AS member_name, m.status::text AS member_status
    FROM data_subject_requests d
    LEFT JOIN members m ON m.id = d.member_id`;

function toDto(r: Row, withMember: boolean): DataRequestDto {
  return {
    id: r.id,
    type: r.type as DataRequestType,
    status: r.status as DataRequestStatus,
    details: r.details ?? null,
    receivedAt: iso(r.received_at),
    dueAt: iso(r.due_at),
    completedAt: r.completed_at ? iso(r.completed_at) : null,
    resolutionNote: r.resolution_note ?? null,
    handledByName: r.handled_by_name ?? null,
    updatedAt: iso(r.updated_at),
    overdue: !!r.overdue,
    isMine: !!r.is_mine,
    member:
      withMember && r.member_id
        ? {
            id: r.member_id,
            name: r.member_name ?? "(không rõ)",
            status: (r.member_status ?? "active") as NonNullable<DataRequestDto["member"]>["status"],
            anonymized: r.member_name === "[Đã ẩn danh]",
          }
        : null,
  };
}

/** `mineOnly`: chỉ yêu cầu của chính mình (thẻ ở Hồ sơ cá nhân) — không tải danh sách của người quản lý. */
export async function listDataRequests(tx: Tx, opts: { mineOnly?: boolean } = {}): Promise<DataRequestListDto> {
  if (opts.mineOnly) {
    const [permR, mineR] = await batch(tx, [
      [`SELECT ${MANAGE_SQL} AS manage`],
      [`${SELECT} WHERE d.member_id = app.current_member_id() ORDER BY d.received_at DESC LIMIT 50`],
    ]);
    return { mine: mineR.rows.map((r) => toDto(r, false)), all: null, canManage: !!(permR.rows[0] as { manage: boolean } | undefined)?.manage, openCount: 0, overdueCount: 0 };
  }
  // Một vòng mạng: quyền + của tôi + tất cả (RLS: không có quyền thì chỉ thấy của mình — bỏ qua) + số đếm
  const [permR, mineR, allR, cntR] = await batch(tx, [
    [`SELECT ${MANAGE_SQL} AS manage`],
    [`${SELECT} WHERE d.member_id = app.current_member_id() ORDER BY d.received_at DESC LIMIT 50`],
    [
      `${SELECT}
        ORDER BY (d.status IN ('received', 'in_progress')) DESC,
                 (d.status IN ('received', 'in_progress') AND d.due_at < now()) DESC,
                 CASE WHEN d.status IN ('received', 'in_progress') THEN d.due_at END ASC NULLS LAST,
                 d.received_at DESC
        LIMIT 300`,
    ],
    [
      `SELECT count(*) FILTER (WHERE status IN ('received', 'in_progress'))::int AS open,
              count(*) FILTER (WHERE status IN ('received', 'in_progress') AND due_at < now())::int AS overdue
         FROM data_subject_requests`,
    ],
  ]);
  const canManage = !!(permR.rows[0] as { manage: boolean } | undefined)?.manage;
  const counts = (cntR.rows[0] ?? { open: 0, overdue: 0 }) as { open: number; overdue: number };
  return {
    mine: mineR.rows.map((r) => toDto(r, false)),
    all: canManage ? allR.rows.map((r) => toDto(r, true)) : null,
    canManage,
    openCount: canManage ? Number(counts.open) : 0,
    overdueCount: canManage ? Number(counts.overdue) : 0,
  };
}

export async function createDataRequest(tx: Tx, b: DataRequestCreateInput): Promise<{ id: string; memberId: string; memberName: string; dueAt: string }> {
  const [meR, openR] = await batch(tx, [
    ["SELECT id, full_name AS name FROM members WHERE id = app.current_member_id()"],
    ["SELECT count(*)::int AS n FROM data_subject_requests WHERE member_id = app.current_member_id() AND status IN ('received', 'in_progress')"],
  ]);
  const me = meR.rows[0] as { id: string; name: string } | undefined;
  if (!me) throw forbidden("Tài khoản chưa gắn với hồ sơ thành viên.");
  if (Number((openR.rows[0] as { n: number }).n) >= MAX_OPEN_PER_MEMBER) {
    throw new ApiError(429, "TOO_MANY_OPEN", `Bạn đang có ${MAX_OPEN_PER_MEMBER} yêu cầu chưa xử lý xong — hãy chờ người quản lý phản hồi rồi gửi thêm.`);
  }
  const r = (
    await tx.query<{ id: string; due_at: Date }>(
      "INSERT INTO data_subject_requests (member_id, request_type, details) VALUES ($1, $2::dsr_type_t, $3) RETURNING id, due_at",
      [me.id, b.type, b.details ?? null],
    )
  ).rows[0];
  return { id: r.id, memberId: me.id, memberName: me.name, dueAt: iso(r.due_at) };
}

export interface DataRequestUpdated {
  memberId: string;
  type: DataRequestType;
  status: DataRequestStatus;
  /** Có thay đổi người gửi cần biết (đổi trạng thái hoặc câu trả lời mới) */
  notify: boolean;
}

/** Người quản lý: đổi trạng thái và/hoặc trả lời. Hoàn tất / không thể thực hiện phải kèm trả lời (≥ 5 ký tự) để người gửi biết kết quả. */
export async function updateDataRequest(tx: Tx, id: string, b: DataRequestPatchInput): Promise<DataRequestUpdated> {
  const [permR, curR] = await batch(tx, [
    [`SELECT ${MANAGE_SQL} AS manage`],
    ["SELECT member_id, request_type::text AS type, status::text AS status, resolution_note FROM data_subject_requests WHERE id = $1", [id]],
  ]);
  if (!(permR.rows[0] as { manage: boolean }).manage) throw forbidden("Chỉ người quản lý (Trưởng nhà, Admin) được xử lý yêu cầu về dữ liệu cá nhân.");
  const cur = curR.rows[0] as { member_id: string; type: DataRequestType; status: DataRequestStatus; resolution_note: string | null } | undefined;
  if (!cur) throw notFound("Không tìm thấy yêu cầu.");
  if (b.status === undefined && b.resolutionNote === undefined) throw badRequest("Không có gì để cập nhật.");
  const status = b.status ?? cur.status;
  const note = b.resolutionNote !== undefined ? b.resolutionNote?.trim() || null : cur.resolution_note;
  if ((status === "completed" || status === "rejected") && (note ?? "").length < 5) {
    throw badRequest(
      status === "rejected"
        ? "Hãy nêu lý do không thể thực hiện (tối thiểu 5 ký tự) để người gửi hiểu."
        : "Hãy ghi kết quả xử lý (tối thiểu 5 ký tự) để người gửi biết đã làm gì.",
      [{ field: "resolutionNote", message: "Thiếu nội dung trả lời." }],
    );
  }
  await tx.query(
    `UPDATE data_subject_requests
        SET status = $2::dsr_status_t,
            resolution_note = $3,
            handled_by = app.current_user_id(),
            completed_at = CASE WHEN $2 IN ('completed', 'rejected') THEN COALESCE(completed_at, now()) ELSE NULL END
      WHERE id = $1`,
    [id, status, note],
  );
  return { memberId: cur.member_id, type: cur.type, status, notify: status !== cur.status || (note ?? null) !== (cur.resolution_note ?? null) };
}

/**
 * Người quản lý ẩn danh hóa hồ sơ của người gửi yêu cầu (người ĐÃ RỜI NHÀ) — xóa dữ liệu cá nhân, khóa tài khoản, giữ sổ quỹ/chứng từ;
 * yêu cầu được đóng (completed) trong cùng giao dịch. Phải gõ lại đúng họ tên để xác nhận.
 */
export async function anonymizeForRequest(tx: Tx, id: string, b: DataRequestAnonymizeInput): Promise<{ memberId: string; result: Record<string, unknown> }> {
  const [permR, curR] = await batch(tx, [
    [`SELECT ${MANAGE_SQL} AS manage`],
    [
      `SELECT d.member_id, d.status::text AS status, m.full_name, m.status::text AS member_status
         FROM data_subject_requests d JOIN members m ON m.id = d.member_id WHERE d.id = $1`,
      [id],
    ],
  ]);
  if (!(permR.rows[0] as { manage: boolean }).manage) throw forbidden("Chỉ người quản lý (Trưởng nhà, Admin) được ẩn danh hóa hồ sơ.");
  const cur = curR.rows[0] as { member_id: string; status: string; full_name: string; member_status: string } | undefined;
  if (!cur) throw notFound("Không tìm thấy yêu cầu.");
  if (cur.full_name === "[Đã ẩn danh]") throw new ApiError(409, "ALREADY_ANONYMIZED", "Hồ sơ này đã được ẩn danh hóa trước đó.");
  if (cur.member_status !== "left" && cur.member_status !== "alumni") {
    throw new ApiError(422, "MEMBER_STILL_ACTIVE", "Thành viên còn đang ở nhà — hãy chuyển trạng thái “Rời nhà” (Thành viên → hồ sơ → Quản lý) trước khi ẩn danh hóa.");
  }
  const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  if (norm(b.confirmName) !== norm(cur.full_name)) {
    throw badRequest("Họ tên gõ lại không khớp với hồ sơ — kiểm tra lại để tránh ẩn danh nhầm người.", [{ field: "confirmName", message: "Không khớp họ tên." }]);
  }
  const r = (
    await tx.query<{ r: Record<string, unknown> }>("SELECT app.fn_anonymize_member($1, $2, $3) AS r", [cur.member_id, `Yêu cầu dữ liệu ${id}: ${b.reason}`, id])
  ).rows[0].r;
  return { memberId: cur.member_id, result: r };
}

// ---------------------------------------------------------------------
// Thông báo (vai trò luuxa_worker — luuxa_app không gọi được app.fn_notify). Lỗi gửi không làm hỏng việc chính.
// ---------------------------------------------------------------------
const fmtVn = (isoStr: string) =>
  new Date(isoStr).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

export async function notifyDataRequestCreated(ctx: Ctx, input: { id: string; memberId: string; memberName: string; type: DataRequestType; dueAt: string }) {
  try {
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query(
        `SELECT app.fn_notify(x.id, 'system.data_request', $2, $3, $4::jsonb, 'data_subject_requests', $5)
           FROM (${PRIVACY_MANAGERS_SQL}) x WHERE x.id <> $1`,
        [
          input.memberId,
          `Yêu cầu về dữ liệu cá nhân: ${DATA_REQUEST_TYPE_LABEL[input.type]}`,
          `${input.memberName.slice(0, 80)} vừa gửi yêu cầu — cần phản hồi trước ${fmtVn(input.dueAt)} (72 giờ).`,
          JSON.stringify({ link: `/thanh-vien?tab=data-requests&request=${input.id}` }),
          input.id,
        ],
      ),
    );
  } catch (e) {
    console.error("[data-requests] báo người quản lý lỗi:", (e as Error).message);
  }
}

export async function notifyDataRequestUpdated(ctx: Ctx, input: { id: string; memberId: string; type: DataRequestType; status: DataRequestStatus }) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const note = (await tx.query<{ n: string | null }>("SELECT resolution_note AS n FROM data_subject_requests WHERE id = $1", [input.id])).rows[0]?.n ?? "";
      await tx.query("SELECT app.fn_notify($1, 'system.data_request', $2, $3, $4::jsonb, 'data_subject_requests', $5)", [
        input.memberId,
        `Yêu cầu “${DATA_REQUEST_TYPE_LABEL[input.type]}”: ${DATA_REQUEST_STATUS_LABEL[input.status].toLowerCase()}`,
        note ? (note.length > 160 ? `${note.slice(0, 157)}…` : note) : "Người quản lý đã cập nhật yêu cầu của bạn. Mở để xem chi tiết.",
        JSON.stringify({ link: "/cai-dat?tab=profile#du-lieu-cua-toi" }),
        input.id,
      ]);
    });
  } catch (e) {
    console.error("[data-requests] báo người gửi lỗi:", (e as Error).message);
  }
}
