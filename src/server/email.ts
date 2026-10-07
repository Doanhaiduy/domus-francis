import "server-only";

// Gửi email giao dịch (đặt lại mật khẩu, thông báo quan trọng) qua Resend (https://resend.com) bằng HTTP — không thêm thư viện.
//   RESEND_API_KEY  khóa API (chỉ ở máy chủ)
//   EMAIL_FROM      địa chỉ gửi đã xác minh miền, vd. "Lưu Xá Phanxicô <no-reply@luuxa.example>"
// Chưa cấu hình ⇒ emailConfigured() = false và các tính năng cần email tự báo "liên hệ người quản lý" thay vì lỗi.
// Chạy thử không ra ngoài: EMAIL_DEV_LOG=1 in nội dung email ra log; EMAIL_TEST_BASE_URL=http://127.0.0.1:<cổng> trỏ máy chủ giả.

export const emailConfigured = () => !!process.env.EMAIL_FROM && (!!process.env.RESEND_API_KEY || process.env.EMAIL_DEV_LOG === "1");

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Khung HTML đơn giản, hợp mọi ứng dụng email (bảng + style nội tuyến, không ảnh ngoài). */
export function emailLayout(title: string, bodyHtml: string, houseName = process.env.NEXT_PUBLIC_APP_NAME || "Lưu Xá Phanxicô"): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f5f4ff;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#131b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e6deff" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px"><div style="font-size:13px;font-weight:700;color:#5f3add;letter-spacing:.04em">✝ ${esc(houseName)}</div>
<h1 style="font-size:20px;margin:12px 0 0">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Email tự động từ ${esc(houseName)}. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</td></tr></table></body></html>`;
}

export const emailButton = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#5f3add;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;display:inline-block">${esc(label)}</a></p>`;

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  if (process.env.EMAIL_DEV_LOG === "1") {
    console.log(`[email:dev] → ${msg.to} | ${msg.subject}\n${msg.text}`);
    if (!process.env.RESEND_API_KEY) return { ok: true };
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Chưa cấu hình email (RESEND_API_KEY / EMAIL_FROM)." };
  const base = process.env.EMAIL_TEST_BASE_URL?.startsWith("http://127.0.0.1") ? process.env.EMAIL_TEST_BASE_URL : "https://api.resend.com";
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `Resend trả về HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "TimeoutError" ? "Gửi email quá thời gian chờ" : "Lỗi kết nối dịch vụ email" };
  }
}
