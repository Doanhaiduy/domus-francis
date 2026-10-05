// Mã hóa dữ liệu cá nhân nhạy cảm ở tầng ứng dụng (CCCD, SĐT người giám hộ) — Phần 9 tài liệu thiết kế:
//   *_enc    = AES-256-GCM (iv 12 byte | tag 16 byte | ciphertext), khóa nằm NGOÀI DB (.env.local)
//   *_bidx   = HMAC-SHA256 "blind index" để kiểm trùng/tìm đúng mà không giải mã
//   *_last4  = 4 số cuối để hiển thị che (•••• 1892)
// Không import "server-only" để script seed (Node thuần) dùng chung được.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export const PII_KEY_VERSION = 1;

function key(name: "PII_KEY_V1" | "PII_BIDX_KEY"): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`Chưa cấu hình biến môi trường ${name} trên Vercel / server.`);
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`${name} phải là 32 byte base64`);
  return k;
}

export function encryptPii(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("PII_KEY_V1"), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

export function decryptPii(blob: Buffer | null | undefined): string | null {
  if (!blob || blob.length < 29) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key("PII_KEY_V1"), blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const blindIndex = (normalized: string): Buffer => createHmac("sha256", key("PII_BIDX_KEY")).update(normalized).digest();

export const digitsOnly = (s: string) => s.replace(/\D/g, "");
export const last4 = (s: string) => digitsOnly(s).slice(-4).padStart(4, "0");
