import "server-only";
import { batch, type Tx } from "../db";
import { badRequest, forbidden } from "../errors";
import { LEGAL_CONSENT_VERSION, LEGAL_UPDATED, LEGAL_VERSION, legalVersionLabel } from "@/content/legal";
import type { LegalConsentStatus } from "@/lib/types/consents";

// Đồng ý (consents) do CHÍNH thành viên tự bật/tắt trong ứng dụng: dữ liệu nhạy cảm như hồ sơ Công giáo chỉ được lưu khi có đồng ý
// còn hiệu lực (trigger trg_catholic_profiles__require_consent). Các đồng ý về AI nằm ở modules/ai.ts (cùng cách ghi).
// Điều khoản sử dụng + Chính sách bảo mật: đồng ý theo PHIÊN BẢN văn bản (src/content/legal.ts — LEGAL_VERSION "1.2" ⇒ policy_version 102);
// chưa đồng ý phiên bản hiện hành ⇒ giao diện hiện hộp thoại bắt buộc (components/ConsentGate.tsx).

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

/** Hai đồng ý bắt buộc khi dùng hệ thống (ghi cùng nhau, cùng phiên bản văn bản). */
export const LEGAL_PURPOSES = ["terms_of_use", "privacy_notice_ack"] as const;

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

export interface SetConsentResult {
  purpose: SelfConsentPurpose;
  consented: boolean;
  /** Rút đồng ý hồ sơ Công giáo: số dòng dữ liệu đã xóa */
  deleted?: { catholicProfiles: number; sacraments: number };
}

export async function setMyConsent(tx: Tx, purpose: string, granted: boolean, ip: string | null): Promise<SetConsentResult> {
  if (!(SELF_CONSENT_PURPOSES as readonly string[]).includes(purpose)) throw badRequest("Mục đích đồng ý không hợp lệ.");
  const p = purpose as SelfConsentPurpose;
  // Rút đồng ý LƯU hồ sơ Công giáo ⇒ không chỉ ngừng xử lý mà XÓA hồ sơ Công giáo + Bí tích của mình (kèm rút luôn đồng ý chia sẻ)
  if (p === "catholic_profile" && !granted) {
    await myMemberId(tx);
    const r = (await tx.query<{ r: { catholic_profiles_deleted: number; sacraments_deleted: number } }>("SELECT app.fn_withdraw_catholic_consent() AS r")).rows[0].r;
    return { purpose: p, consented: false, deleted: { catholicProfiles: Number(r?.catholic_profiles_deleted ?? 0), sacraments: Number(r?.sacraments_deleted ?? 0) } };
  }
  await writeConsent(tx, granted, ip, purpose);
  return { purpose: p, consented: granted };
}

// ---------------------------------------------------------------------
// Điều khoản sử dụng + Chính sách bảo mật (theo phiên bản văn bản)
// ---------------------------------------------------------------------
interface LegalRow {
  purpose_code: string;
  active_v: number | null;
  current_at: Date | null;
  max_v: number | null;
}

/** Trạng thái đồng ý Điều khoản + Chính sách của chính mình. Tài khoản không có hồ sơ thành viên ⇒ không cần hỏi (required = false). */
export async function getLegalConsentStatus(tx: Tx): Promise<LegalConsentStatus> {
  const base = { version: LEGAL_VERSION, updated: LEGAL_UPDATED };
  const [meR, rowsR] = await batch(tx, [
    ["SELECT app.current_member_id() AS id"],
    [
      `SELECT c.purpose_code,
              max(c.policy_version) FILTER (WHERE c.withdrawn_at IS NULL) AS active_v,
              max(c.granted_at) FILTER (WHERE c.withdrawn_at IS NULL AND c.policy_version >= $2) AS current_at,
              max(c.policy_version) AS max_v
         FROM consents c
        WHERE c.member_id = app.current_member_id() AND c.purpose_code = ANY($1::text[])
        GROUP BY c.purpose_code`,
      [[...LEGAL_PURPOSES], LEGAL_CONSENT_VERSION],
    ],
  ]);
  const me = (meR.rows[0] as { id: string | null } | undefined)?.id ?? null;
  if (!me) return { ...base, accepted: false, required: false, acceptedAt: null, hadPrevious: false, previousVersion: null };
  const rows = rowsR.rows as LegalRow[];
  const by = new Map(rows.map((r) => [r.purpose_code, r]));
  const accepted = LEGAL_PURPOSES.every((p) => Number(by.get(p)?.active_v ?? 0) >= LEGAL_CONSENT_VERSION);
  const times = LEGAL_PURPOSES.map((p) => by.get(p)?.current_at).filter((d): d is Date => !!d);
  const prev = rows.map((r) => Number(r.max_v ?? 0)).filter((v) => v > 0 && v < LEGAL_CONSENT_VERSION);
  return {
    ...base,
    accepted,
    required: !accepted,
    acceptedAt: accepted && times.length ? new Date(Math.max(...times.map((d) => new Date(d).getTime()))).toISOString() : null,
    hadPrevious: rows.some((r) => Number(r.max_v ?? 0) > 0),
    previousVersion: prev.length ? legalVersionLabel(Math.max(...prev)) : null,
  };
}

/**
 * "Tôi đã đọc và đồng ý": ghi 2 đồng ý (terms_of_use + privacy_notice_ack) phiên bản hiện hành, method in_app, IP + trình duyệt làm bằng chứng.
 * Đồng ý phiên bản cũ còn hiệu lực được đánh dấu rút (thay bằng bản mới — dòng cũ vẫn giữ làm lịch sử). Gọi lại khi đã đồng ý ⇒ không ghi thêm.
 */
export async function acceptLegalTerms(tx: Tx, meta: { ip: string | null; userAgent: string | null }): Promise<LegalConsentStatus> {
  const me = await myMemberId(tx);
  const ua = meta.userAgent ? meta.userAgent.slice(0, 400) : null;
  const note = `Bấm “Tôi đã đọc và đồng ý” trong ứng dụng (văn bản phiên bản ${LEGAL_VERSION}, cập nhật ${LEGAL_UPDATED})`;
  const items: [string, unknown[]][] = [];
  for (const p of LEGAL_PURPOSES) {
    items.push([
      "UPDATE consents SET withdrawn_at = now() WHERE member_id = $1 AND purpose_code = $2 AND withdrawn_at IS NULL AND policy_version < $3",
      [me, p, LEGAL_CONSENT_VERSION],
    ]);
    items.push([
      `INSERT INTO consents (member_id, purpose_code, policy_version, method, ip, user_agent, recorded_by, evidence_note)
       SELECT $1, $2, $3, 'in_app', $4::inet, $5, app.current_user_id(), $6
        WHERE NOT EXISTS (SELECT 1 FROM consents c WHERE c.member_id = $1 AND c.purpose_code = $2 AND c.withdrawn_at IS NULL AND c.policy_version >= $3)
       ON CONFLICT (member_id, purpose_code) WHERE withdrawn_at IS NULL DO NOTHING`,
      [me, p, LEGAL_CONSENT_VERSION, meta.ip, ua, note],
    ]);
  }
  await batch(tx, items);
  return getLegalConsentStatus(tx);
}
