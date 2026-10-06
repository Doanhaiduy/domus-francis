import "server-only";
import type { Tx } from "../db";
import { badRequest, forbidden } from "../errors";

// Đồng ý (consents) do CHÍNH thành viên tự bật/tắt trong ứng dụng: dữ liệu nhạy cảm như hồ sơ Công giáo chỉ được lưu khi có đồng ý
// còn hiệu lực (trigger trg_catholic_profiles__require_consent). Các đồng ý về AI nằm ở modules/ai.ts (cùng cách ghi).

/** Mục đích thành viên được tự đồng ý ở Cài đặt → Hồ sơ cá nhân. */
export const SELF_CONSENT_PURPOSES = [
  "catholic_profile",
  "catholic_share_leadership",
  "academic_share_leadership",
  "academic_share_tutoring",
  "academic_public_ranking",
  "photo_tagging",
  "channel_messaging",
] as const;
export type SelfConsentPurpose = (typeof SELF_CONSENT_PURPOSES)[number];

async function myMemberId(tx: Tx): Promise<string> {
  const id = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
  if (!id) throw forbidden("Chỉ thành viên đã được duyệt mới thiết lập được đồng ý.");
  return id;
}

/** Trạng thái đồng ý (còn hiệu lực theo phiên bản điều khoản hiện hành) của chính mình. */
export async function getMyConsents(tx: Tx): Promise<Record<SelfConsentPurpose, boolean>> {
  const me = await myMemberId(tx);
  const rows = (
    await tx.query<{ code: SelfConsentPurpose; ok: boolean }>("SELECT c AS code, COALESCE(app.has_active_consent($1, c), false) AS ok FROM unnest($2::text[]) AS c", [me, [...SELF_CONSENT_PURPOSES]])
  ).rows;
  return Object.fromEntries(rows.map((r) => [r.code, r.ok])) as Record<SelfConsentPurpose, boolean>;
}

/**
 * Ghi / rút đồng ý của chính mình (method in_app). Đồng ý cũ theo phiên bản điều khoản đã lỗi thời được rút rồi ghi lại bản mới.
 * Dùng chung cho mọi mục đích (modules/ai.ts gọi hàm này sau khi kiểm danh sách mục đích AI của nó).
 */
export async function writeConsent(tx: Tx, granted: boolean, ip: string | null, purpose: string) {
  const me = await myMemberId(tx);
  if (granted) {
    await tx.query(
      `INSERT INTO consents (member_id, purpose_code, policy_version, method, ip)
       SELECT $1, cp.code, cp.current_version, 'in_app', $2::inet FROM consent_purposes cp WHERE cp.code = $3
       ON CONFLICT (member_id, purpose_code) WHERE withdrawn_at IS NULL DO NOTHING`,
      [me, ip, purpose]
    );
    const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_active_consent($1, $2) AS ok", [me, purpose])).rows[0].ok;
    if (!ok) {
      await tx.query("UPDATE consents SET withdrawn_at = now() WHERE member_id = $1 AND purpose_code = $2 AND withdrawn_at IS NULL", [me, purpose]);
      await tx.query(
        `INSERT INTO consents (member_id, purpose_code, policy_version, method, ip)
         SELECT $1, cp.code, cp.current_version, 'in_app', $2::inet FROM consent_purposes cp WHERE cp.code = $3`,
        [me, ip, purpose]
      );
    }
  } else {
    await tx.query("UPDATE consents SET withdrawn_at = now() WHERE member_id = $1 AND purpose_code = $2 AND withdrawn_at IS NULL", [me, purpose]);
  }
}

export async function setMyConsent(tx: Tx, purpose: string, granted: boolean, ip: string | null) {
  if (!(SELF_CONSENT_PURPOSES as readonly string[]).includes(purpose)) throw badRequest("Mục đích đồng ý không hợp lệ.");
  await writeConsent(tx, granted, ip, purpose);
  return { purpose, consented: granted };
}
