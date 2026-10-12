import "server-only";
import { batch, type Tx } from "../db";
import { ApiError, forbidden } from "../errors";
import type { HouseRulesAckDto, HouseRulesAckMemberDto } from "@/lib/types/house-rules-ack";
import { rulesVersionLabel } from "@/lib/types/house-rules-ack";

// =====================================================================
// Xác nhận "Tôi đã đọc Luật nhà phiên bản …" (db/app/1052: house_rule_acknowledgements + app.fn_house_rules_version()).
//   • Mọi thành viên xác nhận PHIÊN BẢN HIỆN HÀNH của chính mình (luật nhà đổi nội dung ⇒ phiên bản mới ⇒ xác nhận lại).
//   • Người có house.rules.manage (Trưởng nhà, Admin) xem ai đã / chưa xác nhận và nhắc người chưa xác nhận.
// Ghi dưới RLS (chính chủ); thông báo nhắc gửi bằng vai trò worker (app.fn_notify không cấp cho luuxa_app).
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isoOrNull = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export async function getHouseRulesAck(tx: Tx): Promise<HouseRulesAckDto> {
  const [baseR, mineR, membersR] = await batch(tx, [
    [
      `SELECT app.current_member_id() AS me, app.has_permission('house.rules.manage') AS manage, v.version, v.updated_at, v.sections, v.clauses
         FROM app.fn_house_rules_version() v`,
    ],
    [
      `SELECT a.version, a.rules_updated_at, a.acknowledged_at
         FROM house_rule_acknowledgements a
        WHERE a.member_id = app.current_member_id()
        ORDER BY a.acknowledged_at DESC
        LIMIT 1`,
    ],
    [
      `SELECT x.* FROM (
         SELECT m.id, COALESCE(m.display_name, m.full_name) AS name, m.full_name, m.avatar_file_id,
                (SELECT r.code FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
                  WHERE ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
                  ORDER BY ra.starts_on DESC LIMIT 1) AS room,
                (SELECT a.acknowledged_at FROM house_rule_acknowledgements a WHERE a.member_id = m.id AND a.version = v.version) AS acked_at,
                (SELECT max(a.acknowledged_at) FROM house_rule_acknowledgements a WHERE a.member_id = m.id) AS last_acked_at
           FROM members m
          CROSS JOIN app.fn_house_rules_version() v
          WHERE app.has_permission('house.rules.manage') AND m.deleted_at IS NULL AND m.status = 'active') x
        ORDER BY (x.acked_at IS NOT NULL), x.name`,
    ],
  ]);
  const b = baseR.rows[0] as Row;
  const last = mineR.rows[0] as Row | undefined;
  const current = b.version
    ? { version: b.version as string, updatedAt: isoOrNull(b.updated_at), sections: Number(b.sections ?? 0), clauses: Number(b.clauses ?? 0) }
    : null;
  const members: HouseRulesAckMemberDto[] | null = b.manage
    ? (membersR.rows as Row[]).map((r) => ({
        memberId: r.id,
        name: r.name,
        fullName: r.full_name,
        room: r.room ?? null,
        avatarFileId: r.avatar_file_id ?? null,
        ackedAt: current ? isoOrNull(r.acked_at) : null,
        lastAckedAt: isoOrNull(r.last_acked_at),
      }))
    : null;
  return {
    current,
    mine: {
      ackedAt: current && last && last.version === current.version ? isoOrNull(last.acknowledged_at) : null,
      lastAckedAt: last ? isoOrNull(last.acknowledged_at) : null,
      lastVersionUpdatedAt: last ? isoOrNull(last.rules_updated_at) : null,
    },
    canManage: !!b.manage,
    members,
    summary: members ? { acked: members.filter((m) => m.ackedAt).length, total: members.length } : null,
  };
}

/** Thành viên xác nhận đã đọc phiên bản `version` (phải là phiên bản hiện hành — trang đang mở có thể đã cũ). Gọi lại ⇒ giữ lần đầu. */
export async function acknowledgeHouseRules(tx: Tx, version: string): Promise<HouseRulesAckDto> {
  const cur = (
    await tx.query<{ me: string | null; version: string | null }>("SELECT app.current_member_id() AS me, v.version FROM app.fn_house_rules_version() v")
  ).rows[0];
  if (!cur?.me) throw forbidden("Chỉ thành viên đã được duyệt mới xác nhận được Luật nhà.");
  if (!cur.version) throw new ApiError(422, "NO_HOUSE_RULES", "Nhà chưa có luật nhà để xác nhận.");
  if (cur.version !== version)
    throw new ApiError(409, "HOUSE_RULES_CHANGED", "Luật nhà vừa được cập nhật — hãy tải lại trang, đọc bản mới rồi xác nhận.");
  await tx.query(
    "INSERT INTO house_rule_acknowledgements (member_id, version) VALUES ($1, $2) ON CONFLICT (member_id, version) DO NOTHING",
    [cur.me, version]
  );
  return getHouseRulesAck(tx);
}

/** Danh sách người CHƯA xác nhận phiên bản hiện hành (để người quản lý nhắc). */
export async function pendingAckInfo(tx: Tx): Promise<{ version: string | null; updatedAt: string | null; pending: number }> {
  const r = (
    await tx.query(
      `SELECT app.has_permission('house.rules.manage') AS manage, v.version, v.updated_at,
              (SELECT count(*)::int FROM members m
                WHERE m.deleted_at IS NULL AND m.status = 'active'
                  AND NOT EXISTS (SELECT 1 FROM house_rule_acknowledgements a WHERE a.member_id = m.id AND a.version = v.version)) AS pending
         FROM app.fn_house_rules_version() v`
    )
  ).rows[0] as Row;
  if (!r.manage) throw forbidden("Chỉ Trưởng nhà / Admin (quyền soạn luật nhà) mới nhắc anh em xác nhận được.");
  return { version: r.version ?? null, updatedAt: isoOrNull(r.updated_at), pending: r.version ? Number(r.pending) : 0 };
}

/** Gửi thông báo nhắc cho mọi thành viên đang ở CHƯA xác nhận phiên bản `version` (chạy bằng vai trò worker). Trả số người được nhắc. */
export async function remindPendingAck(tx: Tx, version: string, updatedAt: string | null): Promise<number> {
  const label = rulesVersionLabel(updatedAt);
  const r = await tx.query<{ n: number }>(
    `SELECT count(app.fn_notify(m.id, 'system.house_rules_ack', $2, $3, $4::jsonb))::int AS n
       FROM members m
      WHERE m.deleted_at IS NULL AND m.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM house_rule_acknowledgements a WHERE a.member_id = m.id AND a.version = $1)`,
    [
      version,
      "Mời bạn đọc và xác nhận Luật nhà",
      `Luật nhà${label ? ` (phiên bản cập nhật ${label})` : ""} cần mỗi anh em đọc và bấm “Tôi đã đọc”. Cảm ơn bạn!`,
      JSON.stringify({ link: "/thong-bao?tab=luat#xac-nhan-luat-nha" }),
    ]
  );
  return r.rows[0]?.n ?? 0;
}
