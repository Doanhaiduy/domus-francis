import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { importJWK, SignJWT } from "jose";
import { ACCESS_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER, type AccessClaims } from "@/lib/auth-shared";

let privateKey: CryptoKey | Uint8Array | null = null;
let kid = "local";
async function getPrivateKey() {
  if (!privateKey) {
    const raw = process.env.AUTH_JWT_PRIVATE_JWK;
    if (!raw) throw new Error("Thiếu AUTH_JWT_PRIVATE_JWK (chạy `pnpm setup:local`)");
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
