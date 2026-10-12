#!/usr/bin/env node
// =====================================================================
// Sao lưu TOÀN BỘ tệp trên Supabase Storage của ứng dụng Lưu Xá (ảnh, PDF, video nhỏ) ra thư mục cục bộ — chạy trong GitHub Actions
// của repo sao lưu (workflow storage-backup.yml), sau đó workflow nén tar + mã hóa gpg + lưu Artifacts.
//
//   node scripts/storage-backup.mjs [--out out/storage] [--buckets avatars,receipts,…] [--concurrency 6]
//
// Biến môi trường (secrets): SUPABASE_URL (https://<mã dự án>.supabase.co), SUPABASE_SERVICE_ROLE_KEY.
// REST Storage:
//   POST /storage/v1/object/list/<bucket>  { prefix, limit, offset, sortBy }  — mục có id = null là THƯ MỤC (vd. 2026/10) ⇒ duyệt đệ quy,
//        mỗi thư mục phân trang limit/offset (1.000 mục một trang)
//   GET  /storage/v1/object/authenticated/<bucket>/<đường dẫn>  — tải đối tượng (bucket riêng tư, dùng service role)
// Kết quả: <out>/<bucket>/<đường dẫn> + <out>/MANIFEST.tsv (bucket, đường dẫn, byte, sha256) + <out>/SUMMARY.json.
// Tải lỗi (sau 4 lần thử) ⇒ thoát 1 (job lỗi ⇒ nhịp tim báo thất bại). Tệp bị xóa giữa lúc liệt kê và lúc tải (404) chỉ cảnh báo.
// Không cần thư viện ngoài (Node ≥ 18). Không bao giờ in khóa.
// =====================================================================
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_BUCKETS = ["avatars", "receipts", "cleaning-evidence", "academic-evidence", "maintenance", "moments", "attachments", "documents", "videos"];
const PAGE = 1000;
const MAX_ATTEMPTS = 4;

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(arg("--out", "out/storage"));
const BUCKETS = arg("--buckets", DEFAULT_BUCKETS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CONCURRENCY = Math.max(1, Math.min(16, Number(arg("--concurrency", "6")) || 6));

const URL_BASE = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
// http:// chỉ cho máy chủ giả loopback khi thử script
if (!(/^https:\/\//.test(URL_BASE) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE)) || !KEY) {
  console.log("::error::Thiếu secret SUPABASE_URL (https://…) hoặc SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const human = (n) => {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

/** Gọi REST có thử lại khi lỗi mạng / 429 / 5xx (1s, 3s, 9s). */
async function call(url, init) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
      if (res.status !== 429 && res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(1000 * 3 ** (attempt - 1));
  }
  throw last ?? new Error("lỗi không xác định");
}

/** Một trang liệt kê; null = bucket chưa có (400/404). */
async function listPage(bucket, prefix, offset) {
  const res = await call(`${URL_BASE}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`liệt kê ${bucket}/${prefix} lỗi HTTP ${res.status}`);
  return res.json();
}

/** Duyệt đệ quy một bucket ⇒ danh sách { path, size }. */
async function listBucket(bucket) {
  const files = [];
  let exists = true;
  const walk = async (prefix) => {
    for (let offset = 0; ; offset += PAGE) {
      const items = await listPage(bucket, prefix, offset);
      if (items === null) {
        exists = false;
        return;
      }
      for (const it of items) {
        const p = prefix ? `${prefix}/${it.name}` : it.name;
        // Tên lạ (".", "..", rỗng) không bao giờ do ứng dụng tạo — bỏ qua để không ghi ra ngoài thư mục đích
        if (!it.name || it.name.split("/").some((s) => s === "." || s === ".." || s === "")) {
          console.log(`::warning::bỏ qua đối tượng có tên không an toàn: ${bucket}/${p}`);
          continue;
        }
        if (it.id === null || it.id === undefined) await walk(p);
        else files.push({ path: p, size: Number(it.metadata?.size ?? 0) || 0 });
      }
      if (items.length < PAGE) return;
    }
  };
  await walk("");
  return exists ? files : null;
}

/** Đường dẫn đích an toàn (không cho tên đối tượng lạ thoát ra ngoài thư mục đích). */
function target(bucket, objPath) {
  const t = path.resolve(OUT, bucket, objPath);
  if (!t.startsWith(path.resolve(OUT, bucket) + path.sep)) throw new Error(`đường dẫn không an toàn: ${bucket}/${objPath}`);
  return t;
}

async function download(bucket, f) {
  const res = await call(`${URL_BASE}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${enc(f.path)}`, { headers });
  if (res.status === 404 || res.status === 400) return { missing: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const t = target(bucket, f.path);
  mkdirSync(path.dirname(t), { recursive: true });
  writeFileSync(t, buf);
  return { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

async function main() {
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  const manifest = ["bucket\tpath\tbytes\tsha256"];
  const summary = { buckets: {}, objects: 0, bytes: 0, missing: 0, failed: 0, skippedBuckets: [], seconds: 0 };
  const failures = [];

  for (const bucket of BUCKETS) {
    const files = await listBucket(bucket);
    if (files === null) {
      console.log(`- ${bucket}: chưa có bucket — bỏ qua`);
      summary.skippedBuckets.push(bucket);
      continue;
    }
    const stat = { objects: 0, bytes: 0 };
    let i = 0;
    const worker = async () => {
      while (i < files.length) {
        const f = files[i++];
        try {
          const r = await download(bucket, f);
          if (r.missing) {
            summary.missing++;
            console.log(`::warning::${bucket}/${f.path} không còn (bị xóa trong lúc sao lưu)`);
            continue;
          }
          stat.objects++;
          stat.bytes += r.bytes;
          manifest.push(`${bucket}\t${f.path}\t${r.bytes}\t${r.sha256}`);
        } catch (e) {
          summary.failed++;
          failures.push(`${bucket}/${f.path}: ${e.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length || 1) }, worker));
    summary.buckets[bucket] = stat;
    summary.objects += stat.objects;
    summary.bytes += stat.bytes;
    console.log(`- ${bucket}: ${stat.objects} tệp, ${human(stat.bytes)}`);
  }

  summary.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(path.join(OUT, "MANIFEST.tsv"), manifest.join("\n") + "\n");
  writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  const line = `${summary.objects} tệp, ${human(summary.bytes)} từ ${Object.keys(summary.buckets).length} bucket trong ${summary.seconds} giây${summary.missing ? `, ${summary.missing} tệp đã bị xóa giữa chừng` : ""}`;
  console.log(`Tổng: ${line}`);
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `STORAGE_OBJECTS=${summary.objects}\nSTORAGE_BYTES=${summary.bytes}\nSTORAGE_LINE=${line}\n`);
  }
  if (failures.length) {
    for (const f of failures.slice(0, 30)) console.log(`::error::${f}`);
    console.log(`::error::${failures.length} tệp tải lỗi sau ${MAX_ATTEMPTS} lần thử`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.log(`::error::Sao lưu Storage lỗi: ${e?.message ?? e}`);
  process.exit(1);
});
