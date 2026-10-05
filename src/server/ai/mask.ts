import "server-only";
import type { Tx } from "../db";

// ---------------------------------------------------------------------
// Ẩn danh hóa trước khi gửi dịch vụ ngoài (BR-AI-06): email, số điện thoại, dãy số dài (CCCD/STK), liên kết,
// và tên thành viên (đối chiếu danh sách thành viên mà người gọi được phép thấy qua RLS).
// ---------------------------------------------------------------------

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const PHONE = /(?<!\d)(?:\+?84|0)[\s.-]?\d{2,3}(?:[\s.-]?\d{3}){2}(?!\d)/g;
const LONG_DIGITS = /\b\d{9,}\b/g;

export function maskPatterns(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(URL_RE, "[liên kết]")
    .replace(PHONE, "[số điện thoại]")
    .replace(LONG_DIGITS, "[số]");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Thay tên thành viên bằng "Thành viên A/B/…" (ổn định trong cùng một văn bản). */
export async function maskMemberNames(tx: Tx, text: string): Promise<string> {
  const rows = (
    await tx.query<{ display_name: string }>("SELECT display_name FROM members WHERE deleted_at IS NULL AND char_length(display_name) >= 3")
  ).rows;
  const names = [...new Set(rows.map((r) => r.display_name.trim()))].sort((a, b) => b.length - a.length);
  let out = text;
  let i = 0;
  for (const n of names) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, "giu");
    if (re.test(out)) {
      re.lastIndex = 0;
      const label = `Thành viên ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
      out = out.replace(re, label);
      i++;
    }
  }
  return out;
}

export async function maskText(tx: Tx, text: string, withNames: boolean): Promise<string> {
  const base = maskPatterns(text);
  return withNames ? maskMemberNames(tx, base) : base;
}

/** Bỏ thẻ HTML/liên kết/ký tự điều khiển khỏi đầu ra mô hình trước khi hiển thị (BR-AI-07). */
export function sanitizeOutput(s: string, max: number): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(URL_RE, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}
