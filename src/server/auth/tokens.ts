import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { importJWK, SignJWT } from "jose";
import { ACCESS_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER, type AccessClaims } from "@/lib/auth-shared";

let privateKey: CryptoKey | Uint8Array | null = null;
let kid = "local";
async function getPrivateKey() {
  if (!privateKey) {
    const raw = process.env.AUTH_JWT_PRIVATE_JWK;
    if (!raw) throw new Error("Chưa cấu hình biến môi trường AUTH_JWT_PRIVATE_JWK trên Vercel / server.");
    const jwk = JSON.parse(raw);
    kid = jwk.kid ?? kid;
    privateKey = await importJWK(jwk, "EdDSA");
  }
  return privateKey;
}

/** Access token 15 phút, không chứa vai trò (ADR-07): quyền luôn đọc từ DB theo từng request. */
export async function signAccessToken(claims: Pick<AccessClaims, "sub" | "sid" | "pnd">): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ sid: claims.sid, ...(claims.pnd ? { pnd: true } : {}) })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setSubject(claims.sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(key);
}

/** Token ngẫu nhiên 256-bit (refresh / đặt lại mật khẩu / CSRF), dạng base64url. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** DB chỉ lưu SHA-256 (hex) của token. */
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------
// Token trung gian bước 2 đăng nhập (MFA): ký bằng cùng khóa Ed25519 nhưng audience riêng, sống 5 phút, chỉ dùng được ở
// /api/v1/auth/mfa/verify (không phải access token ⇒ không vào được API nào khác).
// ---------------------------------------------------------------------
const MFA_AUDIENCE = "luuxa-mfa";
let mfaPublicKey: CryptoKey | Uint8Array | null = null;

export async function signMfaToken(userId: string): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ typ: "mfa" })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

/** Trả về users.id nếu token hợp lệ, null nếu sai/hết hạn. */
export async function verifyMfaToken(token: string): Promise<string | null> {
  try {
    const { jwtVerify } = await import("jose");
    if (!mfaPublicKey) {
      const raw = process.env.AUTH_JWT_PUBLIC_JWK;
      if (!raw) return null;
      mfaPublicKey = await importJWK(JSON.parse(raw), "EdDSA");
    }
    const { payload } = await jwtVerify(token, mfaPublicKey, { issuer: JWT_ISSUER, audience: MFA_AUDIENCE, algorithms: ["EdDSA"] });
    return payload.typ === "mfa" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
