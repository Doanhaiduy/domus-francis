// Hằng số + xác thực JWT dùng chung cho middleware (Edge runtime) và server (Node). Không import module Node ở đây.
import { importJWK, jwtVerify, type JWTPayload } from "jose";

const SECURE = process.env.COOKIE_SECURE === "true";

/** Tên cookie: production (HTTPS) dùng tiền tố __Host-/__Secure- như Phần 6.1.3; local http dùng tên thường. */
export const COOKIE = {
  access: SECURE ? "__Host-luuxa_at" : "luuxa_at",
  refresh: SECURE ? "__Secure-luuxa_rt" : "luuxa_rt",
  csrf: SECURE ? "__Host-luuxa_csrf" : "luuxa_csrf",
} as const;
export const COOKIE_SECURE = SECURE;
export const CSRF_HEADER = "x-csrf-token";
export const REFRESH_PATH = "/api/v1/auth";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
export const JWT_ISSUER = "luuxa-local";
export const JWT_AUDIENCE = "luuxa-web";

export interface AccessClaims extends JWTPayload {
  sub: string; // users.id
  sid: string; // auth_sessions.id
  /** Tài khoản đã đăng ký nhưng đơn chưa được duyệt (chưa có hồ sơ thành viên) — chỉ vào được /cho-phe-duyet. */
  pnd?: boolean;
}

let publicKey: CryptoKey | Uint8Array | null = null;
async function getPublicKey() {
  if (!publicKey) {
    const jwk = process.env.AUTH_JWT_PUBLIC_JWK;
    if (!jwk) throw new Error("Chưa cấu hình biến môi trường AUTH_JWT_PUBLIC_JWK trên Vercel / server.");
    publicKey = await importJWK(JSON.parse(jwk), "EdDSA");
  }
  return publicKey;
}

/** Xác thực access token; trả null nếu không hợp lệ/hết hạn. */
export async function verifyAccessToken(token: string | undefined | null): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await getPublicKey(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["EdDSA"],
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return payload as AccessClaims;
  } catch {
    return null;
  }
}
