import "server-only";
import { z } from "zod";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { zDate, zUuid } from "../http";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../errors";
import type { DelegableRoleDto, DelegationDto, DelegationPhase, DelegationsDto } from "@/lib/types/delegations";
import { DELEGATION_MAX_DAYS } from "@/lib/types/delegations";

// Ủy quyền vai trò tạm thời (Q9): người đang giữ một vai trò (Trưởng nhà, Thủ quỹ, trưởng ban…) giao vai trò đó cho một thành viên khác trong
// khoảng ngày (tối đa 60 ngày) kèm lý do, vd. "về quê dịp Tết". Bảng thiết kế `role_delegations`; app.current_role_grants() đã cộng vai trò được ủy quyền
// vào phiên làm việc của người nhận ⇒ họ có quyền của vai trò đó trong khoảng ngày. Trigger DB: không ủy quyền Admin, người ủy quyền phải đang giữ vai trò.
// Ghi dưới RLS (người ủy quyền tạo; người ủy quyền hoặc người có auth.role.assign thu hồi).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const VN = "Asia/Ho_Chi_Minh";
const isoOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

export const DelegationCreateSchema = z
  .object({
    roleCode: z.string().trim().min(2, "Chọn vai trò cần ủy quyền.").max(60),
    delegateMemberId: zUuid,
    startsOn: zDate,
    endsOn: zDate,
    reason: z.string().trim().min(5, "Hãy ghi lý do ủy quyền (tối thiểu 5 ký tự).").max(300, "Lý do tối đa 300 ký tự."),
  })
  .refine((b) => b.endsOn >= b.startsOn, { message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.", path: ["endsOn"] })
  .refine((b) => (Date.parse(`${b.endsOn}T00:00:00Z`) - Date.parse(`${b.startsOn}T00:00:00Z`)) / 86400e3 <= DELEGATION_MAX_DAYS - 1, {
    message: `Ủy quyền tối đa ${DELEGATION_MAX_DAYS} ngày.`,
    path: ["endsOn"],
  });
export type DelegationCreateInput = z.infer<typeof DelegationCreateSchema>;

const phaseOf = (r: Row): DelegationPhase => {
  if (r.revoked_at) return "revoked";
  const now = Date.now();
  if (new Date(r.ends_at).getTime() <= now) return "ended";
  if (new Date(r.starts_at).getTime() > now) return "upcoming";
  return "active";
};

async function myRoles(tx: Tx): Promise<DelegableRoleDto[]> {
  const rows = (
    await tx.query<Row>(
      `SELECT DISTINCT r.code, r.name_vi, r.rank
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = app.current_user_id() AND ur.revoked_at IS NULL AND ur.valid_from <= now()
          AND (ur.valid_to IS NULL OR ur.valid_to > now()) AND r.code NOT IN ('admin', 'member') AND r.archived_at IS NULL
        ORDER BY r.rank, r.name_vi`
    )
  ).rows;
  return rows.map((r) => ({ code: r.code, name: r.name_vi }));
}

export async function listDelegations(tx: Tx): Promise<DelegationsDto> {
  const perm = (await tx.query<Row>("SELECT app.has_permission('auth.role.delegate') AS delegate, app.has_permission('auth.role.assign') AS assign, app.current_user_id() AS me")).rows[0];
  const roles = await myRoles(tx);
  const rows = (await tx.query<Row>("SELECT * FROM app.fn_delegation_overview()")).rows;
  const items: DelegationDto[] = rows.map((r) => {
    const phase = phaseOf(r);
    const asDelegator = r.delegator_user_id === perm.me;
    return {
      id: r.id,
      roleCode: r.role_code,
      roleName: r.role_name,
      delegatorMemberId: r.delegator_member_id ?? null,
      delegatorName: r.delegator_name,
      delegateMemberId: r.delegate_member_id ?? null,
      delegateName: r.delegate_name,
      reason: r.reason,
      startsAt: isoOf(r.starts_at),
      endsAt: isoOf(r.ends_at),
      revokedAt: r.revoked_at ? isoOf(r.revoked_at) : null,
      revokedByName: r.revoked_by_name ?? null,
      phase,
      asDelegator,
      asDelegate: r.delegate_user_id === perm.me,
      canRevoke: (phase === "active" || phase === "upcoming") && (asDelegator || !!perm.assign),
    };
  });
  return { items, myRoles: roles, canDelegate: !!perm.delegate && roles.length > 0, maxDays: DELEGATION_MAX_DAYS };
}

/** Tạo ủy quyền; trả mã + thông tin để báo người nhận. */
export async function createDelegation(tx: Tx, b: DelegationCreateInput): Promise<{ id: string; delegateMemberId: string; roleName: string }> {
  const p = (await tx.query<Row>("SELECT app.has_permission('auth.role.delegate') AS ok, app.current_user_id() AS me, app.current_member_id() AS mem")).rows[0];
  if (!p.ok) throw forbidden("Chỉ người giữ vai trò có quyền ủy quyền (Trưởng nhà, Thủ quỹ…) mới tạo được ủy quyền tạm thời.");
  const target = (await tx.query<Row>("SELECT id, user_id, status::text AS status, COALESCE(display_name, full_name) AS name FROM members WHERE id = $1 AND deleted_at IS NULL", [b.delegateMemberId])).rows[0];
  if (!target) throw notFound("Không tìm thấy thành viên được ủy quyền.");
  if (target.id === p.mem) throw badRequest("Không thể ủy quyền cho chính mình.");
  if (!target.user_id) throw badRequest(`${target.name} chưa có tài khoản đăng nhập — hãy cấp tài khoản trước.`);
  if (!["active", "on_leave"].includes(target.status)) throw badRequest(`${target.name} không còn ở lưu xá nên không nhận ủy quyền được.`);
  if (b.roleCode === "admin") throw badRequest("Không được ủy quyền vai trò Admin.");
  if (b.roleCode === "member") throw badRequest("Vai trò Thành viên ai cũng có sẵn — không cần ủy quyền.");

  const role = (await tx.query<Row>("SELECT id, name_vi FROM roles WHERE code = $1 AND archived_at IS NULL", [b.roleCode])).rows[0];
  if (!role) throw notFound("Không tìm thấy vai trò.");
  // Phải đang giữ vai trò này TRỰC TIẾP (vai trò chỉ nhờ ủy quyền thì không ủy quyền tiếp); lấy đúng phạm vi đang giữ
  const held = (
    await tx.query<Row>(
      `SELECT ur.scope_type::text AS scope_type, ur.scope_id
         FROM user_roles ur
        WHERE ur.user_id = $1 AND ur.role_id = $2 AND ur.revoked_at IS NULL AND ur.valid_from <= now() AND (ur.valid_to IS NULL OR ur.valid_to > now())
        ORDER BY (ur.scope_type = 'global') DESC LIMIT 1`,
      [p.me, role.id]
    )
  ).rows[0];
  if (!held) throw badRequest(`Bạn không đang giữ vai trò “${role.name_vi}” nên không ủy quyền được.`);

  const dup = (
    await tx.query(
      `SELECT 1 FROM role_delegations d
        WHERE d.delegator_user_id = $1 AND d.delegate_user_id = $2 AND d.role_id = $3 AND d.revoked_at IS NULL AND d.ends_at > now()
          AND tstzrange(d.starts_at, d.ends_at) && tstzrange(
                GREATEST(($4::date)::timestamp AT TIME ZONE '${VN}', now()), ((($5::date) + 1)::timestamp AT TIME ZONE '${VN}'))`,
      [p.me, target.user_id, role.id, b.startsOn, b.endsOn]
    )
  ).rowCount;
  if (dup) throw conflict(`Bạn đã ủy quyền vai trò “${role.name_vi}” cho ${target.name} trong khoảng ngày này — hãy thu hồi bản cũ trước.`, "DELEGATION_OVERLAP");

  try {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO role_delegations (delegator_user_id, delegate_user_id, role_id, scope_type, scope_id, reason, starts_at, ends_at)
       VALUES ($1, $2, $3, $4::scope_type_t, $5, $6,
               GREATEST(($7::date)::timestamp AT TIME ZONE '${VN}', now()),
               ((($8::date) + 1)::timestamp AT TIME ZONE '${VN}') - interval '1 second')
       RETURNING id`,
      [p.me, target.user_id, role.id, held.scope_type, held.scope_id, b.reason, b.startsOn, b.endsOn]
    );
    return { id: r.rows[0].id, delegateMemberId: target.id, roleName: role.name_vi };
  } catch (e) {
    const pg = e as { code?: string; message?: string };
    if (pg.code === "23514") throw new ApiError(400, "BAD_DELEGATION", "Khoảng ngày ủy quyền không hợp lệ (đã qua hoặc dài quá 60 ngày) hoặc bạn không giữ vai trò này trong cả khoảng đó.");
    throw e;
  }
}

/** Thu hồi sớm (người ủy quyền, hoặc người có auth.role.assign). Trả thông tin để báo các bên. */
export async function revokeDelegation(tx: Tx, id: string): Promise<{ byDelegator: boolean }> {
  const cur = (
    await tx.query<Row>(
      "SELECT d.delegator_user_id, d.revoked_at, d.ends_at, app.current_user_id() AS me FROM role_delegations d WHERE d.id = $1",
      [id]
    )
  ).rows[0];
  if (!cur) throw notFound("Không tìm thấy ủy quyền.");
  if (cur.revoked_at) throw conflict("Ủy quyền này đã được thu hồi.", "DELEGATION_REVOKED");
  if (new Date(cur.ends_at).getTime() <= Date.now()) throw conflict("Ủy quyền này đã hết hạn.", "DELEGATION_ENDED");
  const r = await tx.query("UPDATE role_delegations SET revoked_at = now(), revoked_by = app.current_user_id() WHERE id = $1 AND revoked_at IS NULL", [id]);
  if (!r.rowCount) throw forbidden("Chỉ người ủy quyền hoặc người có quyền gán vai trò mới thu hồi được ủy quyền này.");
  return { byDelegator: cur.delegator_user_id === cur.me };
}

const dm = (d: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: VN }).formatToParts(new Date(d));
  return `${p.find((x) => x.type === "day")?.value}/${p.find((x) => x.type === "month")?.value}`;
};

const NOTIFY_SQL = `
  SELECT d.reason, d.starts_at, d.ends_at, r.name_vi AS role_name, dm.id AS delegate_member, gm.id AS delegator_member,
         COALESCE(gm.display_name, gm.full_name) AS delegator_name
    FROM role_delegations d JOIN roles r ON r.id = d.role_id
    JOIN members dm ON dm.user_id = d.delegate_user_id
    LEFT JOIN members gm ON gm.user_id = d.delegator_user_id
   WHERE d.id = $1`;

/** Báo người được ủy quyền (vai trò luuxa_worker — luuxa_app không gọi được app.fn_notify). Lỗi gửi không làm hỏng việc chính. */
export async function notifyDelegationCreated(ctx: Ctx, id: string) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const r = (await tx.query<Row>(NOTIFY_SQL, [id])).rows[0];
      if (!r) return;
      await tx.query("SELECT app.fn_notify($1, 'delegation.received', $2, $3, $4::jsonb, 'role_delegations', $5)", [
        r.delegate_member,
        `${r.delegator_name ?? "Một người quản lý"} ủy quyền vai trò ${r.role_name} cho bạn`,
        `Từ ${dm(isoOf(r.starts_at))} đến ${dm(isoOf(r.ends_at))} — ${r.reason}. Trong khoảng này bạn có quyền của vai trò ${r.role_name}.`,
        JSON.stringify({ link: "/" }),
        id,
      ]);
    });
  } catch (e) {
    console.error("[delegations] báo người được ủy quyền lỗi:", (e as Error).message);
  }
}

export async function notifyDelegationRevoked(ctx: Ctx, id: string, byDelegator: boolean) {
  try {
    await ctx.dbAs("luuxa_worker", async (tx) => {
      const r = (await tx.query<Row>(NOTIFY_SQL, [id])).rows[0];
      if (!r) return;
      await tx.query("SELECT app.fn_notify($1, 'delegation.revoked', $2, $3, $4::jsonb, 'role_delegations', $5)", [
        r.delegate_member,
        `Ủy quyền vai trò ${r.role_name} đã được thu hồi`,
        `Bạn không còn quyền của vai trò ${r.role_name} do ủy quyền tạm thời.`,
        JSON.stringify({ link: "/" }),
        id,
      ]);
      // Người có quyền gán vai trò thu hồi hộ ⇒ báo cả người ủy quyền
      if (!byDelegator && r.delegator_member) {
        await tx.query("SELECT app.fn_notify($1, 'delegation.revoked', $2, $3, $4::jsonb, 'role_delegations', $5)", [
          r.delegator_member,
          `Ủy quyền vai trò ${r.role_name} của bạn đã bị thu hồi`,
          "Người quản lý đã thu hồi ủy quyền tạm thời này.",
          JSON.stringify({ link: "/" }),
          id,
        ]);
      }
    });
  } catch (e) {
    console.error("[delegations] báo thu hồi ủy quyền lỗi:", (e as Error).message);
  }
}
