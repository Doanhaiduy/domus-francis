import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { withTx, type Tx } from "../db";
import { ApiError } from "../errors";
import { decryptPii, encryptPii, PII_KEY_VERSION } from "../pii";
import { verifyPassword } from "./password";
import { sha256Hex } from "./tokens";
import { newTotpSecret, otpauthUri, STEP_SECONDS, verifyTotp } from "./totp";
import type { ReqMeta } from "./session";

// Xác thực 2 bước (TOTP) + mã khôi phục. Bảng user_mfa_factors / mfa_recovery_codes chỉ luuxa_auth ghi được (RLS/GRANT thiết kế);
// bí mật TOTP được mã hóa AES-256-GCM (cùng khóa PII) trước khi lưu — DB không bao giờ thấy bí mật dạng rõ.

const ISSUER = "Lưu Xá Phanxicô";
const MAX_FAILS = 5; // mã sai trong 15 phút ⇒ chặn tạm
const RECOVERY_CODES = 8;

const authTx = <T>(meta: ReqMeta, fn: (tx: Tx) => Promise<T>) => withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", fn);

export interface MfaStatus {
  enabled: boolean;
  pendingSetup: boolean;
  recoveryRemaining: number;
}

export async function getMfaStatus(userId: string, meta: ReqMeta): Promise<MfaStatus> {
  return authTx(meta, async (tx) => {
    const f = (await tx.query<{ confirmed_at: Date | null }>("SELECT confirmed_at FROM user_mfa_factors WHERE user_id = $1 AND factor_type = 'totp'", [userId])).rows[0];
    const rec = f?.confirmed_at ? (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL", [userId])).rows[0].n : 0;
    return { enabled: !!f?.confirmed_at, pendingSetup: !!f && !f.confirmed_at, recoveryRemaining: rec };
  });
}

/** Bắt đầu bật 2FA: sinh bí mật mới (ghi đè bản chưa xác nhận), trả về mã QR + khóa nhập tay. */
export async function startEnroll(userId: string, account: string, meta: ReqMeta) {
  const secret = newTotpSecret();
  await authTx(meta, async (tx) => {
    const f = (await tx.query<{ confirmed_at: Date | null }>("SELECT confirmed_at FROM user_mfa_factors WHERE user_id = $1 AND factor_type = 'totp'", [userId])).rows[0];
    if (f?.confirmed_at) throw new ApiError(409, "MFA_ENABLED", "Xác thực 2 bước đã được bật. Hãy tắt trước nếu muốn thiết lập lại.");
    await tx.query("DELETE FROM user_mfa_factors WHERE user_id = $1 AND factor_type = 'totp'", [userId]);
    await tx.query("INSERT INTO user_mfa_factors (user_id, factor_type, secret_enc, secret_key_version) VALUES ($1, 'totp', $2, $3)", [userId, encryptPii(secret), PII_KEY_VERSION]);
  });
  const uri = otpauthUri(secret, account, ISSUER);
  return { secret, otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

function newRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: RECOVERY_CODES }, () => {
    const h = randomBytes(5).toString("hex"); // 10 ký tự hex
    return `${h.slice(0, 5)}-${h.slice(5)}`;
  });
  return { plain, hashes: plain.map((c) => sha256Hex(c.replace("-", ""))) };
}

/** Xác nhận bằng mã đầu tiên từ ứng dụng ⇒ bật 2FA + sinh mã khôi phục (hiện MỘT lần). */
export async function confirmEnroll(userId: string, code: string, meta: ReqMeta): Promise<string[]> {
  return authTx(meta, async (tx) => {
    const f = (await tx.query<{ id: string; secret_enc: Buffer; confirmed_at: Date | null }>("SELECT id, secret_enc, confirmed_at FROM user_mfa_factors WHERE user_id = $1 AND factor_type = 'totp'", [userId])).rows[0];
    if (!f) throw new ApiError(400, "MFA_NOT_STARTED", "Chưa bắt đầu thiết lập — hãy tạo mã QR trước.");
    if (f.confirmed_at) throw new ApiError(409, "MFA_ENABLED", "Xác thực 2 bước đã được bật.");
    const secret = decryptPii(f.secret_enc);
    if (!secret || verifyTotp(secret, code) === null) throw new ApiError(400, "BAD_CODE", "Mã không đúng hoặc đã hết hạn. Kiểm tra giờ trên điện thoại rồi nhập mã mới.");
    await tx.query("UPDATE user_mfa_factors SET confirmed_at = now() WHERE id = $1", [f.id]);
    await tx.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
    const codes = newRecoveryCodes();
    for (const h of codes.hashes) await tx.query("INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)", [userId, h]);
    return codes.plain;
  });
}

/** Tắt 2FA của chính mình — bắt buộc nhập lại mật khẩu. */
export async function disableMfa(userId: string, password: string, meta: ReqMeta) {
  await authTx(meta, async (tx) => {
    const u = (await tx.query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [userId])).rows[0];
    if (!u || !(await verifyPassword(u.password_hash, password))) throw new ApiError(400, "BAD_PASSWORD", "Mật khẩu không đúng.");
    await tx.query("DELETE FROM user_mfa_factors WHERE user_id = $1", [userId]);
    await tx.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
  });
}

/** Admin/Trưởng nhà gỡ 2FA của người mất điện thoại (người gọi đã được kiểm quyền auth.user.manage). */
export async function resetMfaForUser(targetUserId: string, meta: ReqMeta) {
  await authTx(meta, async (tx) => {
    await tx.query("DELETE FROM user_mfa_factors WHERE user_id = $1", [targetUserId]);
    await tx.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [targetUserId]);
    // đăng xuất mọi phiên đang mở của người đó cho chắc
    await tx.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'admin_revoked' WHERE user_id = $1 AND revoked_at IS NULL", [targetUserId]);
  });
}

/** Người dùng có bật 2FA không (dùng ở bước đăng nhập, trong cùng transaction luuxa_auth). */
export async function hasMfa(tx: Tx, userId: string): Promise<boolean> {
  return !!(await tx.query("SELECT 1 FROM user_mfa_factors WHERE user_id = $1 AND factor_type = 'totp' AND confirmed_at IS NOT NULL", [userId])).rowCount;
}

/**
 * Kiểm mã đăng nhập bước 2: mã TOTP 6 số hoặc mã khôi phục (xxxxx-xxxxx, dùng một lần).
 * Trả true khi đúng. Sai nhiều lần ⇒ ném 429. Chống dùng lại cùng một mã TOTP trong cùng bước 30 giây.
 */
export async function verifySecondFactor(tx: Tx, userId: string, input: string, meta: ReqMeta): Promise<boolean> {
  const fails = (
    await tx.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM login_attempts WHERE user_id = $1 AND success = false AND failure_reason = 'mfa_failed' AND attempted_at > now() - interval '15 minutes'",
      [userId]
    )
  ).rows[0].n;
  if (fails >= MAX_FAILS) throw new ApiError(429, "RATE_LIMITED", "Nhập sai mã quá nhiều lần. Vui lòng đợi 15 phút rồi đăng nhập lại.");

  const fail = async () => {
    await tx.query("INSERT INTO login_attempts (identifier, user_id, ip, user_agent, success, failure_reason) VALUES ($1, $2, $3::inet, $4, false, 'mfa_failed')", [`user:${userId}`, userId, meta.ip, meta.userAgent?.slice(0, 400) ?? null]);
    return false;
  };

  const raw = input.trim();
  if (/^[0-9a-f]{5}-?[0-9a-f]{5}$/i.test(raw) && !/^\d{6}$/.test(raw)) {
    const hash = sha256Hex(raw.toLowerCase().replace("-", ""));
    const used = await tx.query("UPDATE mfa_recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id", [userId, hash]);
    return used.rowCount ? true : fail();
  }
  const f = (await tx.query<{ id: string; secret_enc: Buffer; last_used_at: Date | null }>("SELECT id, secret_enc, last_used_at FROM user_mfa_factors WHERE user_id = $1 AND factor_type = 'totp' AND confirmed_at IS NOT NULL", [userId])).rows[0];
  const secret = f ? decryptPii(f.secret_enc) : null;
  const step = secret ? verifyTotp(secret, raw) : null;
  if (!f || step === null) return fail();
  // Mã của bước này (hoặc bước trước) đã dùng rồi ⇒ từ chối (replay)
  if (f.last_used_at && f.last_used_at.getTime() >= step * STEP_SECONDS * 1000) return fail();
  await tx.query("UPDATE user_mfa_factors SET last_used_at = now() WHERE id = $1", [f.id]);
  return true;
}
