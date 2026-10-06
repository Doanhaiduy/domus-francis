import "server-only";
import { withTx } from "../db";
import { ApiError } from "../errors";
import { emailButton, emailConfigured, emailLayout, sendEmail } from "../email";
import { hashPassword, passwordProblem } from "./password";
import { normalizeIdentifier, type ReqMeta } from "./session";
import { randomToken, sha256Hex } from "./tokens";

// Đặt lại mật khẩu tự phục vụ qua email: yêu cầu → email chứa liên kết dùng một lần (30 phút) → đặt mật khẩu mới.
// Chống dò tài khoản: luôn trả về cùng một kết quả dù email có tồn tại hay không. Chống spam: tối đa 3 yêu cầu/giờ/tài khoản, 10/giờ/IP.

const TTL_MINUTES = 30;

export const appOrigin = (req: Request): string => {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (env && /^https?:\/\//.test(env) && !/localhost|127\.0\.0\.1/.test(env)) return env;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
};

export async function requestPasswordReset(identifier: string, meta: ReqMeta, origin: string): Promise<void> {
  if (!emailConfigured()) throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Hệ thống chưa bật gửi email. Vui lòng liên hệ Trưởng nhà hoặc Admin để được cấp mật khẩu tạm.");
  const id = normalizeIdentifier(identifier);
  const issued = await withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx) => {
    const u = (
      await tx.query<{ id: string; email: string | null; status: string }>(
        `SELECT id, email::text, status::text FROM users
          WHERE deleted_at IS NULL AND (($1::text IS NOT NULL AND email = $1::citext) OR ($2::text IS NOT NULL AND phone_e164 = $2)) LIMIT 1`,
        [id.email, id.phone]
      )
    ).rows[0];
    if (!u?.email || u.status === "disabled" || u.status === "locked") return null;
    const counts = (
      await tx.query<{ by_user: number; by_ip: number }>(
        `SELECT count(*) FILTER (WHERE user_id = $1)::int AS by_user, count(*) FILTER (WHERE requested_ip = $2::inet)::int AS by_ip
           FROM password_resets WHERE requested_at > now() - interval '1 hour'`,
        [u.id, meta.ip]
      )
    ).rows[0];
    if (counts.by_user >= 3 || counts.by_ip >= 10) return null;
    const token = randomToken();
    await tx.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip, user_agent)
       VALUES ($1, $2, now() + make_interval(mins => $3), $4::inet, $5)`,
      [u.id, sha256Hex(token), TTL_MINUTES, meta.ip, meta.userAgent?.slice(0, 400) ?? null]
    );
    return { email: u.email, token };
  });
  if (!issued) return;
  const link = `${origin}/dat-lai-mat-khau?token=${encodeURIComponent(issued.token)}`;
  const r = await sendEmail({
    to: issued.email,
    subject: "Đặt lại mật khẩu Lưu Xá Phanxicô",
    html: emailLayout(
      "Đặt lại mật khẩu",
      `<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút dưới đây để tạo mật khẩu mới — liên kết dùng được <b>một lần</b> trong <b>${TTL_MINUTES} phút</b>.</p>${emailButton(link, "Đặt mật khẩu mới")}<p style="font-size:13px;color:#6b7280">Nếu nút không bấm được, dán đường dẫn này vào trình duyệt:<br><span style="word-break:break-all">${link}</span></p>`
    ),
    text: `Đặt lại mật khẩu Lưu Xá Phanxicô\n\nMở liên kết sau (dùng một lần, ${TTL_MINUTES} phút):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
  });
  if (!r.ok) console.error("[password-reset] gửi email thất bại:", r.error);
}

export async function performPasswordReset(token: string, newPassword: string, meta: ReqMeta): Promise<void> {
  const bad = () => new ApiError(400, "BAD_TOKEN", "Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu đặt lại mật khẩu mới.");
  await withTx({ requestId: meta.requestId, ip: meta.ip }, "luuxa_auth", async (tx) => {
    const r = (
      await tx.query<{ id: string; user_id: string; email: string | null }>(
        `SELECT pr.id, pr.user_id, u.email::text
           FROM password_resets pr JOIN users u ON u.id = pr.user_id AND u.deleted_at IS NULL
          WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now()
          FOR UPDATE OF pr`,
        [sha256Hex(token)]
      )
    ).rows[0];
    if (!r) throw bad();
    const problem = passwordProblem(newPassword, r.email);
    if (problem) throw new ApiError(400, "WEAK_PASSWORD", problem);
    await tx.query("SELECT set_config('app.current_user_id', $1, true)", [r.user_id]);
    await tx.query("UPDATE users SET password_hash = $2, password_changed_at = now(), must_change_password = false, locked_until = NULL WHERE id = $1", [r.user_id, await hashPassword(newPassword)]);
    await tx.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [r.user_id]);
    await tx.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'password_changed' WHERE user_id = $1 AND revoked_at IS NULL", [r.user_id]);
  });
}
