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
//   GITHUB_TOKEN          (${{ github.token }}) — để đọc THỜI GIAN từng bước qua GitHub API; cần `permissions: actions: read`.
//                         Thiếu/không đọc được ⇒ vẫn gửi nhịp tim nhưng KHÔNG kèm thời gian (lịch sử hiện "—", không bịa 0).
//
// Script này KHÔNG BAO GIỜ làm hỏng job (luôn thoát 0): lỗi gửi chỉ in cảnh báo ::warning::.
// =====================================================================
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
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

/** id bước → tên hiển thị, đọc từ chính tệp workflow đang chạy ("- name: …" ngay trên "id: …"). Lỗi ⇒ bảng rỗng. */
function stepNamesFromWorkflow() {
  const out = new Map();
  try {
    const file = /(\.github\/workflows\/[^@]+)@/.exec(env("GITHUB_WORKFLOW_REF"))?.[1];
    if (!file || !existsSync(file)) return out;
    const re = /^[ \t]*-[ \t]+name:[ \t]*(.+?)[ \t]*\r?\n[ \t]+id:[ \t]*([A-Za-z0-9_-]+)[ \t]*\r?$/gm;
    for (const m of readFileSync(file, "utf8").matchAll(re)) out.set(m[2], m[1].replace(/^(["'])(.*)\1$/, "$2"));
  } catch {
    // bỏ qua: không có thời gian từng bước
  }
  return out;
}

/**
 * Thời gian THẬT của job đang chạy + từng bước (GitHub API: GET /actions/runs/{run}/attempts/{n}/jobs). Mốc của GitHub chỉ chính xác tới giây,
 * nên bước dưới 1 giây không có ms (hiện "—") thay vì ghi 0. Trả về { jobMs, byName } hoặc null nếu không đọc được.
 */
async function githubTimings() {
  const token = env("GITHUB_TOKEN");
  const repo = env("GITHUB_REPOSITORY");
  const runId = env("GITHUB_RUN_ID");
  if (!token || !repo || !runId) return null;
  try {
    const api = (env("GITHUB_API_URL") || "https://api.github.com").replace(/\/+$/, "");
    const res = await fetch(`${api}/repos/${repo}/actions/runs/${runId}/attempts/${env("GITHUB_RUN_ATTEMPT") || "1"}/jobs?per_page=30`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "luu-xa-backup-heartbeat" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      warn(`Không đọc được thời gian các bước từ GitHub (HTTP ${res.status}) — lịch sử sẽ hiện "—". Workflow cần quyền "actions: read".`);
      return null;
    }
    const jobs = (await res.json()).jobs ?? [];
    const job = jobs.find((j) => j.status === "in_progress") ?? (jobs.length === 1 ? jobs[0] : null);
    if (!job) return null;
    const at = (s) => (s ? Date.parse(s) : NaN);
    const byName = new Map();
    for (const s of job.steps ?? []) {
      const ms = at(s.completed_at) - at(s.started_at);
      if (Number.isFinite(ms) && ms >= 1000) byName.set(s.name, ms);
    }
    const jobMs = Date.now() - at(job.started_at);
    return { jobMs: Number.isFinite(jobMs) && jobMs >= 1000 ? Math.round(jobMs) : null, byName };
  } catch (e) {
    warn(`Không đọc được thời gian các bước (${e?.name === "TimeoutError" ? "quá thời gian chờ" : "lỗi mạng"}) — lịch sử sẽ hiện "—".`);
    return null;
  }
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
  const timings = await githubTimings();
  const displayName = timings ? stepNamesFromWorkflow() : new Map();
  const steps = [];
  let skipped = 0;
  for (const [id, s] of Object.entries(stepsCtx)) {
    const outcome = s?.outcome ?? s?.conclusion ?? "unknown";
    if (outcome === "skipped") {
      skipped++;
      continue;
    }
    const ms = timings?.byName.get(displayName.get(id) ?? "");
    // Bước `uses:` không đặt id (actions/checkout) được GitHub gán mã hex ngẫu nhiên 32 ký tự — đừng hiện mã đó làm tên bước
    steps.push({
      name: (LABEL[id] ?? (/^[0-9a-f]{32}$/.test(id) ? "Tải mã nguồn (checkout)" : id)).slice(0, 80),
      ok: outcome === "success",
      ...(ms ? { ms: Math.round(ms) } : {}),
      ...(outcome !== "success" ? { error: `kết quả: ${outcome}` } : {}),
    });
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

  const body = JSON.stringify({ kind, ok, summary: summary || undefined, durationMs: timings?.jobMs ?? undefined, steps: steps.slice(0, 20) });
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
