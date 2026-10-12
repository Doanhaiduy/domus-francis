#!/usr/bin/env node
// =====================================================================
// Gửi NHỊP TIM về ứng dụng Lưu Xá sau mỗi lần sao lưu (kể cả khi lỗi) — bước cuối của các workflow trong repo sao lưu.
// Ứng dụng ghi một dòng job_runs (Cài đặt → Hệ thống), /api/health?deep=1 báo tuổi sao lưu, và báo Admin khi sao lưu thất bại hoặc
// quá hạn (CSDL > 36 giờ, tệp > 8 ngày). Node ≥ 18 (fetch có sẵn), KHÔNG cần thư viện ngoài.
//
// Biến môi trường (đặt trong workflow):
//   APP_URL               (biến repo, vd. https://domus-francis-production.vercel.app) — thiếu ⇒ bỏ qua, chỉ in nhắc
//   OPS_HEARTBEAT_SECRET  (secret, CÙNG giá trị với biến OPS_HEARTBEAT_SECRET trên Vercel) — thiếu ⇒ bỏ qua
//   HEARTBEAT_KIND        backup | backup:storage
//   JOB_STATUS            ${{ job.status }} — success ⇒ ok=true, còn lại (failure/cancelled) ⇒ ok=false
//   STEPS_JSON            ${{ toJSON(steps) }} — kết quả từng bước có id
//   STAMP, RUN_URL, OUT_DIR (thư mục chứa tệp .gpg để báo dung lượng), SUMMARY_EXTRA (một dòng thêm vào tóm tắt)
//
// Script này KHÔNG BAO GIỜ làm hỏng job (luôn thoát 0): lỗi gửi chỉ in cảnh báo ::warning::.
// =====================================================================
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const env = (k) => (process.env[k] ?? "").trim();
const warn = (m) => console.log(`::warning::${m}`);

const LABEL = {
  config: "Kiểm tra cấu hình",
  pgclient: "Cài PostgreSQL client",
  count_before: "Đếm số dòng trước sao lưu",
  dump: "pg_dump",
  verify: "Kiểm tra tệp sao lưu",
  count_after: "Đếm số dòng sau sao lưu",
  drill: "Diễn tập khôi phục",
  encrypt: "Mã hóa (AES-256)",
  artifact: "Lưu Artifacts",
  weekly: "Lưu bản hằng tuần vào repo",
  download: "Tải tệp từ Supabase Storage",
  pack: "Nén + mã hóa + kiểm tra",
};

function humanBytes(n) {
  if (!Number.isFinite(n)) return "?";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

async function main() {
  const appUrl = env("APP_URL").replace(/\/+$/, "");
  const secret = env("OPS_HEARTBEAT_SECRET");
  const kind = env("HEARTBEAT_KIND") || "backup";
  if (!appUrl || !secret) {
    console.log("Chưa đặt biến APP_URL hoặc secret OPS_HEARTBEAT_SECRET — bỏ qua nhịp tim (ứng dụng sẽ không biết lần sao lưu này).");
    return;
  }
  if (!/^https?:\/\//.test(appUrl)) {
    warn("APP_URL phải bắt đầu bằng https:// — bỏ qua nhịp tim.");
    return;
  }
  if (!["backup", "backup:storage"].includes(kind)) {
    warn(`HEARTBEAT_KIND không hợp lệ: ${kind}`);
    return;
  }
  const status = env("JOB_STATUS") || "unknown";
  const ok = status === "success";

  // Các bước có id: outcome = kết quả thật (kể cả bước continue-on-error)
  let stepsCtx = {};
  try {
    stepsCtx = JSON.parse(process.env.STEPS_JSON || "{}");
  } catch {
    stepsCtx = {};
  }
  const steps = [];
  let skipped = 0;
  for (const [id, s] of Object.entries(stepsCtx)) {
    const outcome = s?.outcome ?? s?.conclusion ?? "unknown";
    if (outcome === "skipped") {
      skipped++;
      continue;
    }
    steps.push({ name: (LABEL[id] ?? id).slice(0, 80), ok: outcome === "success", ...(outcome !== "success" ? { error: `kết quả: ${outcome}` } : {}) });
  }

  const lines = [];
  const outDir = env("OUT_DIR") || "out";
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir).filter((x) => x.endsWith(".gpg"))) {
      lines.push(`${f} (${humanBytes(statSync(path.join(outDir, f)).size)})`);
    }
  }
  if (env("SUMMARY_EXTRA")) lines.push(env("SUMMARY_EXTRA"));
  if (!ok) lines.push(`Trạng thái job: ${status}${skipped ? ` · ${skipped} bước bị bỏ qua do lỗi trước đó` : ""}`);
  if (env("RUN_URL")) lines.push(env("RUN_URL"));
  const summary = lines.join("\n").slice(0, 500);

  const body = JSON.stringify({ kind, ok, summary: summary || undefined, steps: steps.slice(0, 20) });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${appUrl}/api/v1/public/ops-heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        console.log(`Đã gửi nhịp tim ${kind} (ok=${ok}) về ứng dụng.`);
        return;
      }
      if (res.status === 404) return warn("Ứng dụng chưa bật nhịp tim (thiếu biến OPS_HEARTBEAT_SECRET trên Vercel) — HTTP 404.");
      if (res.status === 401) return warn("Ứng dụng từ chối khóa nhịp tim (HTTP 401) — secret OPS_HEARTBEAT_SECRET ở đây phải TRÙNG với biến trên Vercel.");
      if (res.status < 500 && res.status !== 429) return warn(`Ứng dụng trả HTTP ${res.status} cho nhịp tim.`);
      warn(`Lần ${attempt}: ứng dụng trả HTTP ${res.status}.`);
    } catch (e) {
      warn(`Lần ${attempt}: không gửi được nhịp tim (${e?.name === "TimeoutError" ? "quá thời gian chờ" : "lỗi mạng"}).`);
    }
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  warn("Không gửi được nhịp tim sau 3 lần — ứng dụng sẽ báo sao lưu quá hạn nếu kéo dài.");
}

main().catch((e) => warn(`Lỗi gửi nhịp tim: ${e?.message ?? e}`));
