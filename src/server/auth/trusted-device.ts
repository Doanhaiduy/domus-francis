import "server-only";
import type { NextResponse } from "next/server";
import { withTx, type Tx } from "../db";
import { ApiError } from "../errors";
import { COOKIE, COOKIE_SECURE, REFRESH_PATH, TRUSTED_DEVICE_DAYS } from "@/lib/auth-shared";
import { deviceLabel } from "./device";
import { randomToken, sha256Hex } from "./tokens";
import type { ReqMeta } from "./session";

// "Tin cậy thiết bị này 30 ngày" ở bước xác thực 2 bước (db/app/1055).
//  • Token ngẫu nhiên 256-bit nằm trong cookie httpOnly (chỉ gửi tới /api/v1/auth); DB chỉ giữ SHA-256.
//  • Một trình duyệt có thể tin cậy cho NHIỀU tài khoản: cookie chứa tối đa 5 token (cách nhau dấu phẩy); mỗi token chỉ có tác dụng với đúng tài khoản đã cấp.
//  • Chỉ bỏ qua được bước mã 2FA — mật khẩu vẫn luôn phải đúng, tài khoản bị khóa/vô hiệu vẫn bị chặn trước khi tới bước này.
//  • Hết hạn cố định 30 ngày (không gia hạn khi dùng). Đổi/đặt lại mật khẩu, tắt/gỡ 2FA ⇒ thu hồi hết.

const MAX_COOKIE_TOKENS = 5;
const MAX_ACTIVE_PER_USER = 10;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type TrustRevokeReason = "user" | "password_changed" | "mfa_disabled" | "mfa_reset" | "admin_revoked";

/** Đọc cookie ⇒ danh sách token hợp lệ về hình thức (tối đa 5). */
export function parseTrustCookie(value: string | undefined | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((t) => t.trim()).filter((t) => TOKEN_RE.test(t)))].slice(0, MAX_COOKIE_TOKENS);
}

export function setTrustCookie(res: NextResponse, tokens: string[]) {
  const value = tokens.slice(0, MAX_COOKIE_TOKENS).join(",");
  res.cookies.set(COOKIE.trusted, value, {
    httpOnly: true, secure: COOKIE_SECURE, sameSite: "strict", path: REFRESH_PATH, maxAge: TRUSTED_DEVICE_DAYS * 24 * 3600,
  });
  return res;
}

export function clearTrustCookie(res: NextResponse) {
  res.cookies.set(COOKIE.trusted, "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "strict", path: REFRESH_PATH, maxAge: 0 });
  return res;
}

/** Thiết bị đang dùng có phải thiết bị đã tin cậy của tài khoản này không (còn hạn, chưa thu hồi, cùng nhãn trình duyệt/hệ điều hành)? Có ⇒ ghi lần dùng. */
export async function findTrustedDevice(tx: Tx, userId: string, tokens: string[], meta: ReqMeta): Promise<string | null> {
  if (!tokens.length) return null;
  const label = deviceLabel(meta.userAgent);
  const row = (
    await tx.query<{ id: string }>(
      `UPDATE trusted_devices
          SET last_used_at = now(), ip = COALESCE($4::inet, ip)
        WHERE id = (SELECT id FROM trusted_devices
                     WHERE user_id = $1 AND token_hash = ANY($2::text[]) AND revoked_at IS NULL AND expires_at > now()
                       AND (device_label IS NULL OR $3::text IS NULL OR device_label = $3)
                     LIMIT 1)
        RETURNING id`,
      [userId, tokens.map(sha256Hex), label, meta.ip]
    )
  ).rows[0];
  return row?.id ?? null;
}

/** Tạo thiết bị tin cậy mới (gọi trong transaction luuxa_auth của bước xác thực 2 bước). Trả token để đặt vào cookie. */
export async function createTrustedDevice(tx: Tx, userId: string, meta: ReqMeta): Promise<string> {
  const token = randomToken();
  await tx.query("SELECT set_config('app.current_user_id', $1, true)", [userId]); // nhật ký kiểm toán ghi đúng người
  // Dọn dòng cũ (hết hạn / thu hồi > 7 ngày) và giữ tối đa MAX_ACTIVE_PER_USER thiết bị còn hiệu lực (thu hồi các cái cũ nhất)
  await tx.query("DELETE FROM trusted_devices WHERE user_id = $1 AND (expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days')", [userId]);
  await tx.query(
    `UPDATE trusted_devices SET revoked_at = now(), revoked_reason = 'user'
      WHERE id IN (SELECT id FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
                    ORDER BY created_at DESC OFFSET $2)`,
    [userId, MAX_ACTIVE_PER_USER - 1]
  );
  await tx.query(
    `INSERT INTO trusted_devices (user_id, token_hash, device_label, user_agent, ip, last_used_at, expires_at)
     VALUES ($1, $2, $3, $4, $5::inet, now(), now() + make_interval(days => $6))`,
    [userId, sha256Hex(token), deviceLabel(meta.userAgent), meta.userAgent?.slice(0, 400) ?? null, meta.ip, TRUSTED_DEVICE_DAYS]
  );
  return token;
}

/** Cookie mới = token mới đứng đầu + các token cũ (tối đa 5). */
export const mergeTrustTokens = (fresh: string, existing: string[]): string[] => [fresh, ...existing.filter((t) => t !== fresh)].slice(0, MAX_COOKIE_TOKENS);

/** Thu hồi mọi thiết bị tin cậy của một tài khoản trong transaction đang mở (đổi mật khẩu, tắt/gỡ 2FA…). */
export async function revokeAllTrustedDevicesTx(tx: Tx, userId: string, reason: TrustRevokeReason): Promise<number> {
  const r = await tx.query("UPDATE trusted_devices SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL", [userId, reason]);
  return r.rowCount ?? 0;
}

/** Báo chính chủ khi có thiết bị mới được tin cậy (phát hiện kẻ gian đã có cả mật khẩu lẫn mã 2FA cố "cắm chốt" 30 ngày). Chạy nền, không ném lỗi. */
export async function notifyDeviceTrusted(userId: string, meta: ReqMeta) {
  const label = deviceLabel(meta.userAgent) ?? "một thiết bị";
  const when = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  await withTx({ requestId: meta.requestId }, "luuxa_worker", async (tx) => {
    const m = (await tx.query<{ id: string }>("SELECT id FROM members WHERE user_id = $1 AND deleted_at IS NULL", [userId])).rows[0];
    if (!m) return;
    await tx.query("SELECT app.fn_notify($1, 'security.device_trusted', $2, $3, $4::jsonb)", [
      m.id,
      `Thiết bị được tin cậy 30 ngày: ${label}`,
      `Lúc ${when}${meta.ip ? ` (IP ${meta.ip})` : ""}, ${label} được đặt là thiết bị tin cậy — đăng nhập lại trên máy này trong 30 ngày sẽ không hỏi mã xác thực 2 bước. Nếu không phải bạn, hãy thu hồi ngay ở Cài đặt → Bảo mật và đổi mật khẩu.`,
      JSON.stringify({ link: "/cai-dat?tab=security" }),
    ]);
  });
}

// ---------------------------------------------------------------------
// Danh sách + thu hồi (Cài đặt → Bảo mật)
// ---------------------------------------------------------------------
export interface TrustedDeviceDto {
  id: string;
  label: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  /** Thiết bị đang dùng để xem trang này */
  current: boolean;
}

const authTx = <T>(meta: ReqMeta, userId: string, fn: (tx: Tx) => Promise<T>) =>
  withTx({ requestId: meta.requestId, ip: meta.ip, userId }, "luuxa_auth", fn);

export async function listTrustedDevices(userId: string, cookieTokens: string[], meta: ReqMeta): Promise<TrustedDeviceDto[]> {
  const mine = new Set(cookieTokens.map(sha256Hex));
  return authTx(meta, userId, async (tx) => {
    const rows = (
      await tx.query<{ id: string; token_hash: string; device_label: string | null; ip: string | null; created_at: Date; last_used_at: Date | null; expires_at: Date }>(
        `SELECT id, token_hash, device_label, ip::text AS ip, created_at, last_used_at, expires_at
           FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
        [userId]
      )
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      label: r.device_label ?? "Thiết bị không rõ",
      ip: r.ip,
      createdAt: r.created_at.toISOString(),
      lastUsedAt: r.last_used_at ? r.last_used_at.toISOString() : null,
      expiresAt: r.expires_at.toISOString(),
      current: mine.has(r.token_hash),
    }));
  });
}

/** Thu hồi một thiết bị (của chính mình). Trả token_hash đã thu hồi để nơi gọi gỡ token tương ứng khỏi cookie. */
export async function revokeTrustedDevice(userId: string, id: string, meta: ReqMeta): Promise<string> {
  return authTx(meta, userId, async (tx) => {
    const r = (
      await tx.query<{ token_hash: string }>(
        "UPDATE trusted_devices SET revoked_at = now(), revoked_reason = 'user' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING token_hash",
        [id, userId]
      )
    ).rows[0];
    if (!r) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy thiết bị tin cậy này (có thể đã được thu hồi).");
    return r.token_hash;
  });
}

export async function revokeAllTrustedDevices(userId: string, meta: ReqMeta): Promise<number> {
  return authTx(meta, userId, (tx) => revokeAllTrustedDevicesTx(tx, userId, "user"));
}
