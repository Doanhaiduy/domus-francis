import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Tham số Argon2id theo khuyến nghị OWASP (m=19 MiB, t=2, p=1) — khớp ví dụ PHC trong COMMENT của users.password_hash.
// algorithm 2 = Argon2id (const enum của @node-rs/argon2 không dùng được với isolatedModules)
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);

// Hash giả để thời gian phản hồi như nhau khi email không tồn tại (chống dò tài khoản).
let dummy: string | null = null;
export async function verifyPassword(phc: string | null | undefined, pw: string): Promise<boolean> {
  if (!phc) {
    dummy ??= await hashPassword("không-dùng-" + Math.random());
    await verify(dummy, pw).catch(() => false);
    return false;
  }
  try {
    return await verify(phc, pw);
  } catch {
    return false;
  }
}

/** Chính sách mật khẩu tối thiểu (BR-AUTH): ≥ 8 ký tự, có chữ và số, không trùng email. */
export function passwordProblem(pw: string, email?: string | null): string | null {
  if (pw.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
  if (pw.length > 128) return "Mật khẩu tối đa 128 ký tự.";
  if (!/[A-Za-zÀ-ỹ]/.test(pw) || !/\d/.test(pw)) return "Mật khẩu phải có cả chữ và số.";
  if (email && pw.toLowerCase() === email.toLowerCase()) return "Mật khẩu không được trùng email.";
  return null;
}
