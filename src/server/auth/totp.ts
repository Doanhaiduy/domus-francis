import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP theo RFC 6238 (HMAC-SHA1, 6 chữ số, bước 30 giây) — tương thích Google Authenticator, Microsoft Authenticator, Authy, 1Password…

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Khóa bí mật mới: 160 bit (20 byte), mã hóa base32 để người dùng nhập tay được. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const STEP_SECONDS = 30;

export function hotp(secret: string, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

/**
 * Kiểm mã 6 số, cho lệch ±1 bước (đồng hồ điện thoại lệch tối đa ~30 giây).
 * Trả về số bước (counter) khớp hoặc null; nơi gọi dùng để chống dùng lại cùng một mã.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1): number | null {
  const c = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (let d = -window; d <= window; d++) {
    const expect = hotp(secret, counter + d);
    if (timingSafeEqual(Buffer.from(expect), Buffer.from(c))) return counter + d;
  }
  return null;
}

/** URI cho mã QR (otpauth://totp/…). */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
