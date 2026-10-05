#!/usr/bin/env node
// =====================================================================
// CHẠY LẠI TOÀN BỘ KIỂM ĐỊNH ĐỘC LẬP (kiem-dinh/) TRÊN POSTGRESQL LOCAL — một lệnh, có tiêu chí đạt rõ ràng.
//
//   node scripts/db/audit.mjs            # đầy đủ
//   node scripts/db/audit.mjs --quick    # bỏ bước đối chứng trên DB gốc (13 FAIL) và dry-run
//
// Các bước (đúng thứ tự trong kiem-dinh/README.md và ⑥/⑦ của báo cáo):
//   A. DB gốc 01…52 → 60_smoke_tests.sql nguyên văn của tài liệu phải xanh
//   B. DB vá 01…52 + 70…75 (chạy vá 2 lần để chứng minh idempotent) → 60_smoke_tests_reviewed.sql,
//      tests/{sec,biz,api,cov}_check.sql, ai_gate.sql, idx.sql (bất biến index) — kiểm từng kết quả
//   C. 80_concurrency_tests.js: DB gốc phải FAIL 13/13 (đối chứng), DB vá phải ĐẠT 13/13
//   D. dryrun.js 8 kịch bản trên DB vá — so từng bước với kết quả đúng (⑤.1)
//   E. (nếu có db/app/*.sql) lặp lại smoke + các check trên DB của ứng dụng để chứng minh phần bổ sung không phá vỡ gì
// Báo cáo: .local/audit/report.md + report.json
// =====================================================================
import pg from "pg";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pgConfig, ROOT } from "./env.mjs";
import { splitSql } from "./sql.mjs";
import { buildDatabase, applyFiles, patchFiles, appFiles, MIGRATIONS, PATCHES } from "./build.mjs";

const QUICK = process.argv.includes("--quick");
const KD = path.join(ROOT, "kiem-dinh");
const TESTS = path.join(KD, "tests");
const OUT = path.join(ROOT, ".local", "audit");
mkdirSync(OUT, { recursive: true });

const results = [];
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };
function record(group, name, ok, detail = "") {
  results.push({ group, name, ok, detail });
  console.log(`  ${ok ? C.g + "✓ ĐẠT " : C.r + "✗ LỖI "}${C.x} ${name}${detail ? C.d + "  — " + detail + C.x : ""}`);
}
const section = (t) => console.log(`\n${C.y}▶ ${t}${C.x}`);

/** Chạy một file SQL, thu NOTICE + mọi kết quả SELECT (để đối chiếu), không dừng chương trình khi lỗi. */
async function runCapture(db, file) {
  const client = new pg.Client(pgConfig({ database: db }));
  const notices = [];
  const rows = [];
  client.on("notice", (m) => notices.push(m.message));
  await client.connect();
  let error = null;
  try {
    for (const { sql, line } of splitSql(readFileSync(file, "utf8"))) {
      try {
        const r = await client.query(sql);
        for (const x of Array.isArray(r) ? r : [r]) if (x?.fields?.length) rows.push(...x.rows);
      } catch (e) {
        error = `${path.basename(file)}:${line}: ${e.message}`;
        break;
      }
    }
  } finally {
    await client.end();
  }
  return { notices, rows, error };
}

const rowWhere = (rows, key, val) => rows.find((r) => Object.values(r)[0] === val || r[key] === val);
const has = (notices, re) => notices.some((n) => re.test(n));

function nodeScript(script, env = {}, cwd = TESTS) {
  const r = spawnSync(process.execPath, [script], {
    cwd,
    env: { ...process.env, PGPASSWORD: pgConfig().password, ...env },
    encoding: "utf8",
    timeout: 15 * 60 * 1000,
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// ---------------------------------------------------------------------
// A. DB gốc
// ---------------------------------------------------------------------
// "DB gốc" (bước A + đối chứng bước C) phải là DDL NGUYÊN VĂN của tài liệu thiết kế. db/migrations có thể đã được chỉnh
// cho môi trường chạy thật (vd. tương thích Supabase: schema extensions, quyền) — những chỉnh đó vô tình vá vài lỗi mà bước
// đối chứng cố ý giữ lại, nên trích lại một bản sạch vào .local/audit/pristine-ddl cho hai bước này.
let PRISTINE = null;
function pristineDdl() {
  if (PRISTINE) return PRISTINE;
  const dir = path.join(OUT, "pristine-ddl");
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "db", "extract-ddl.mjs"), "--out", dir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("Không trích được DDL nguyên văn từ tài liệu: " + (r.stderr || r.stdout));
  PRISTINE = dir;
  return dir;
}

async function stageA() {
  section("A. DDL gốc của tài liệu (01…52) + smoke test nguyên văn");
  await buildDatabase("luuxa_audit_base", "base", { verbose: false, migrationsDir: pristineDdl() });
  record("A", "37 file 01…52 chạy sạch trên PostgreSQL 16.14", true);
  const s = await runCapture("luuxa_audit_base", path.join(MIGRATIONS, "60_smoke_tests.sql"));
  const ok = s.notices.filter((n) => /^S\d+\w* OK/.test(n)).length;
  record("A", "60_smoke_tests.sql (tài liệu) xanh S2→S14", !s.error && ok >= 30, s.error || `${ok} mục OK, kết thúc ROLLBACK`);
}

// ---------------------------------------------------------------------
// B. DB vá + các check
// ---------------------------------------------------------------------
const CHECKS = {
  "sec_check.sql": (r) => [
    ["D-002 hàm oracle user_roles_of bị từ chối", has(r.notices, /^D-002 PASS/)],
    ["D-003a chặn ẩn danh hóa người còn đang ở", has(r.notices, /^D-003a PASS/)],
    ["D-003 ẩn danh hóa xóa dữ liệu, khóa tài khoản, giữ bằng chứng đồng ý", (() => {
      const x = rowWhere(r.rows, "k", "D-003 sau ẩn danh");
      return !!x && x.full_name === "[Đã ẩn danh]" && x.status === "disabled" && String(x.cath) === "0" && String(x.consents_kept) === "1";
    })()],
    ["D-006 trigger bất biến ENABLE ALWAYS", rowWhere(r.rows, "k", "D-006")?.string_agg === "A"],
    ["D-005 luuxa_app dùng digest nhưng không gọi được hmac", (() => {
      const x = rowWhere(r.rows, "k", "D-005");
      return !!x && x.app_digest === true && x.app_hmac === false;
    })()],
  ],
  "biz_check.sql": (r) => [
    ["N-01 phiếu Trưởng nhà cần 2 chữ ký", has(r.notices, /^N-01 .*required_approvals=2 status=approved/)],
    ["N-19 không ghi lùi ngày chi", has(r.notices, /^N-19 PASS/)],
    ["N-07 ủy quyền hết hiệu lực khi thu hồi vai trò gốc", has(r.notices, /^N-07 .*: 0 \(KỲ VỌNG 0\)/)],
    ["N-16 hạn mức tự duyệt < ngưỡng hai chữ ký", has(r.notices, /^N-16 PASS/)],
    ["N-10 khiếu nại nghiệm thu không sửa trực tiếp", has(r.notices, /^N-10 PASS/)],
  ],
  "ai_gate.sql": (r) => [
    ["E-013 tác vụ cần đồng ý phải nêu chủ thể", rowWhere(r.rows, "ca", "E-013 không nêu chủ thể")?.status === "blocked"],
    ["E-012 tháng chưa có ngân sách → tự tạo dòng ngân sách", !!rowWhere(r.rows, "ca", "dòng ngân sách tự tạo")],
    ["E-011 hết trần riêng theo tác vụ → chặn", rowWhere(r.rows, "ca", "E-011 đã hết trần riêng 50.000")?.status === "blocked"],
  ],
  "api_check.sql": (r) => [
    ["C-002 Admin không đổi được email tài khoản đặc quyền", has(r.notices, /^C-002 PASS/)],
    ["C-002 đổi email xóa email_verified_at (F-058)", Object.values(r.rows.find((x) => /email_verified_at/.test(Object.values(x)[0])) || {})[1] === true],
    ["C-004 client không tự khai trạng thái/chi phí job AI", (() => {
      const x = r.rows.find((y) => /^C-004/.test(Object.values(y)[0]));
      return !!x && x.status === "queued" && String(x.cost_vnd) === "0";
    })()],
  ],
  "cov_check.sql": (r) => [
    ["A-005 bộ đếm bình luận bỏ qua xóa mềm", String(rowWhere(r.rows, "k", "A-005 sau thêm")?.comments_count) === "1" && String(rowWhere(r.rows, "k", "A-005 sau xóa mềm")?.comments_count) === "0"],
  ],
  "idx.sql": (r) => [
    ["Mọi FK đều có index; không index trùng/thừa tiền tố", !r.rows.some((x) => ["FK_NO_INDEX", "DUP_INDEX", "PREFIX_REDUNDANT"].includes(x.k))],
  ],
};

async function checksOn(db, group) {
  const smoke = await runCapture(db, path.join(PATCHES, "60_smoke_tests_reviewed.sql"));
  const ok = smoke.notices.filter((n) => /^S\d+\w* OK/.test(n)).length;
  record(group, "60_smoke_tests_reviewed.sql xanh S2→S14", !smoke.error && ok >= 30, smoke.error || `${ok} mục OK, kết thúc ROLLBACK`);
  for (const [file, fn] of Object.entries(CHECKS)) {
    const r = await runCapture(db, path.join(TESTS, file));
    if (r.error) { record(group, `${file}`, false, r.error); continue; }
    for (const [name, pass] of fn(r)) record(group, `${file.replace(".sql", "")}: ${name}`, !!pass);
  }
  const cat = await runCapture(db, path.join(TESTS, "catalog_checks.sql"));
  const counts = {};
  for (const x of cat.rows) counts[x.k] = (counts[x.k] || 0) + 1;
  record(group, "catalog_checks.sql chạy được (danh sách để đánh giá, không có ngưỡng)", !cat.error,
    cat.error || Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" "));
}

async function stageB() {
  section("B. DDL + 6 file vá kiểm định (70…75) — smoke đã rà soát + các check từng nhóm vá");
  await buildDatabase("luuxa_audit", "patched", { verbose: false });
  record("B", "01…52 + 70…75 chạy sạch", true);
  await applyFiles("luuxa_audit", patchFiles(), { verbose: false });
  record("B", "Chạy lại 70…75 lần hai không lỗi (idempotent)", true);
  await checksOn("luuxa_audit", "B");
}

// ---------------------------------------------------------------------
// C. Đa phiên
// ---------------------------------------------------------------------
function concurrency(db) {
  const r = nodeScript("80_concurrency_tests.js", { PGHOST: "127.0.0.1", PGPORT: String(pgConfig().port), PGUSER: "postgres", PGDATABASE: db });
  const pass = (r.out.match(/^PASS /gm) || []).length;
  const fail = (r.out.match(/^FAIL /gm) || []).length;
  return { ...r, pass, fail };
}

async function stageC() {
  section("C. 80_concurrency_tests.js — 13 ca đa phiên (mỗi request một kết nối mới)");
  if (!QUICK) {
    await buildDatabase("luuxa_audit_conc_base", "base", { verbose: false, migrationsDir: pristineDdl() });
    const b = concurrency("luuxa_audit_conc_base");
    record("C", "Đối chứng: DB gốc thất bại đủ 13/13 (bộ test có tác dụng)", b.code === 1 && b.fail === 13, `PASS=${b.pass} FAIL=${b.fail}`);
  }
  await buildDatabase("luuxa_audit_conc", "patched", { verbose: false });
  const p = concurrency("luuxa_audit_conc");
  writeFileSync(path.join(OUT, "concurrency.txt"), p.out);
  record("C", "DB đã vá đạt 13/13", p.code === 0 && p.pass === 13 && p.fail === 0, `PASS=${p.pass} FAIL=${p.fail}`);
}

// ---------------------------------------------------------------------
// D. Dry-run 8 kịch bản
// ---------------------------------------------------------------------
// Script gốc gắn với NGÀY và GIỜ chạy kiểm định (sáng 03/10/2026). Để chạy lại bất kỳ lúc nào mà vẫn giữ
// nguyên ý nghĩa nghiệp vụ, bản chạy được tạo ra với đúng hai điều chỉnh, mọi câu SQL/kỳ vọng khác giữ nguyên:
//  1. Các ngày viết cứng quanh 03/10/2026 được dời +Δ ngày (Δ = hôm nay − 03/10/2026).
//  2. KB7 dùng ca "ngày kia" (+2) thay cho "ngày mai": BR-DUTY-11 bắt xin đổi ca trước giờ bắt đầu ≥ 12 giờ,
//     ca T_ALLDAY bắt đầu 00:00 nên "ngày mai" chỉ hợp lệ khi chạy trước 12:00 trưa. Nếu ngày đó sang tuần mới,
//     Phó nhà tạo + công bố roster của tuần đó (bước ghi nhãn "[dời ngày]").
function rebasedDryrun() {
  const src = readFileSync(path.join(TESTS, "dryrun.js"), "utf8");
  const vnToday = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const delta = Math.round((Date.parse(vnToday) - Date.parse("2026-10-03")) / 86400e3);
  const shift = (d) => new Date(Date.parse(d) + delta * 86400e3).toISOString().slice(0, 10);
  // (luôn dùng hàm thay thế: chuỗi thay thế chứa "$1" của SQL sẽ bị hiểu là backreference)
  let s = src
    .replace("require('./h')", () => `require(${JSON.stringify(path.join(TESTS, "h.js"))})`)
    .replace(/'(2026-10-0\d)( \d\d:\d\d\+07)?'/g, (_, d, t) => `'${shift(d)}${t || ""}'`);
  const [kb7, kb8] = [s.indexOf("// KB7: đổi ca (ca ngày mai)"), s.indexOf("// ================= KB8")];
  if (kb7 < 0 || kb8 < 0) throw new Error("dryrun.js đã đổi cấu trúc — cần xem lại bước dời ngày");
  let k7 = s.slice(kb7, kb8).replaceAll("app.local_today()+1", "app.local_today()+2");
  k7 = k7.replace("// KB7: đổi ca (ca ngày mai)", () => `// KB7: đổi ca (ca ngày kia — xem audit.mjs)
  const wk7 = (await su("select date_trunc('week', app.local_today()+2)::date d"))[0].d;
  let RO7 = RO;
  if (wk7.getTime() !== wk.getTime()) { const r7 = await step('KB7', '[dời ngày] Phó nhà tạo roster tuần chứa ngày kia', U.vice, 'insert into duty_rosters (week_start) values ($1) returning id', [wk7]); RO7 = r7.ok ? r7.rows[0].id : null; }`);
  k7 = k7.replace(/(const as2 = await step\('KB7'[^\n]*?)\[RO\]\);/, (_, head) => `${head}[RO7]);`);
  k7 = k7.replace(/(for \(const m of \[M\.m1, M\.m2\]\) await step\('KB7', 'phân người'[^\n]*\n)/, (line) =>
    `${line}  if (RO7 !== RO) await step('KB7', '[dời ngày] công bố roster tuần đó', U.vice, 'select app.fn_publish_roster($1)', [RO7]);\n`);
  s = s.slice(0, kb7) + k7 + s.slice(kb8);
  const file = path.join(OUT, "dryrun.rebased.cjs");
  writeFileSync(file, s);
  return { file, delta };
}

// Kết quả ĐÚNG cho từng bước trên DB đã vá (theo ⑤.1 + ⑥). "err" = phải bị chặn; hàm = kiểm nội dung.
const json = (o) => { try { return JSON.parse(o); } catch { return {}; } };
const EXPECT = {
  KB1: ["ok", "ok", "err", "ok", "ok", "ok", "ok", (o) => json(o).count === "0", (o) => json(o).count === "0"],
  KB2: ["ok"],
  KB3: ["ok", (o) => json(o).letter_grade === "A", (o) => json(o).letter_grade === "B", (o) => json(o).letter_grade === "B+",
        (o) => json(o).total_score === null, (o) => json(o).letter_grade === "C", "ok", (o) => json(o).status === "submitted",
        (o) => !!json(o).rank_label, "err", (o) => json(o).status === "draft", (o) => json(o).count === "0", "ok",
        (o) => json(o).status === "submitted", (o) => json(o).status === "verified", "err", (o) => Number(json(o).count) > 0],
  KB4: ["ok", "ok", "ok", "err", "ok", "err", "ok", "ok", (o) => /"balance_vnd":"8500000"/.test(o), "err", "ok",
        (o) => /"balance_vnd":"10000000"/.test(o), "err", (o) => /"first_broken_seq":null/.test(o) && /"head_matches":true/.test(o)],
  KB5: [(o) => json(o).count === "0", "OK (0)", (o) => json(o).count === "0", "OK (0)", (o) => json(o).count === "0", "err", (o) => json(o).count === "0"],
  KB6: ["ok", "ok", "ok", "ok", "ok", "ok", "err", "ok", (o) => json(o).status === "rework_required", "err", "ok", "ok",
        (o) => json(o).status === "approved" && json(o).attempt_count === 2],
  KB7: ["ok", "ok", "ok", "ok", "err", "err", "ok", "err", "ok", (o) => json(o).string_agg === "Thanh Phong, Văn Hiếu" /* m1 đã được m3 trực thay */, "ok", "ok", "err"],
  KB8: ["err", null, null, null, null, null, null, (o) => json(o).status === "left", (o) => json(o).status === "disabled"],
};

async function stageD() {
  section("D. dryrun.js — 8 kịch bản nghiệp vụ bắt buộc (Bước 3.7) trên DB đã vá");
  await buildDatabase("luuxa_dry", "patched", { verbose: false });
  await applyFiles("luuxa_dry", [path.join(TESTS, "seed_people.sql")], { verbose: false });
  const { file, delta } = rebasedDryrun();
  const r = nodeScript(file, {}, OUT);
  writeFileSync(path.join(OUT, "dryrun.txt"), r.out);
  const res = existsSync(path.join(OUT, "dryrun.json")) ? JSON.parse(readFileSync(path.join(OUT, "dryrun.json"), "utf8")) : [];
  const steps = res.filter((x) => !x.name.startsWith("[dời ngày]"));
  const rebaseSteps = res.filter((x) => x.name.startsWith("[dời ngày]"));
  for (const rs of rebaseSteps) if (!rs.ok) record("D", rs.name, false, rs.out);
  for (const [sc, exp] of Object.entries(EXPECT)) {
    const got = steps.filter((x) => x.sc === sc);
    const bad = [];
    exp.forEach((e, k) => {
      const g = got[k];
      if (e === null) return; // bước chỉ để quan sát
      if (!g) { bad.push(`thiếu bước #${k + 1}`); return; }
      const pass = e === "ok" ? g.ok : e === "err" ? !g.ok : typeof e === "string" ? g.out === e : g.ok && e(g.out);
      if (!pass) bad.push(`#${k + 1} "${g.name}" → ${g.out.slice(0, 120)}`);
    });
    record("D", `${sc}: ${got.length} bước đúng kỳ vọng`, bad.length === 0 && got.length === exp.length, bad.join(" | ") || (delta ? `dời ngày ${delta > 0 ? "+" : ""}${delta}` : ""));
  }
}

// ---------------------------------------------------------------------
// E. DB của ứng dụng (01…52 + 70…75 + db/app)
// ---------------------------------------------------------------------
async function stageE() {
  if (!appFiles().length) return;
  section(`E. DB ứng dụng: thêm ${appFiles().length} file db/app/*.sql — chạy lại smoke + check để chứng minh không phá vỡ thiết kế`);
  await buildDatabase("luuxa_audit_app", "app", { verbose: false });
  record("E", "01…52 + 70…75 + db/app chạy sạch", true);
  await checksOn("luuxa_audit_app", "E");
}

// ---------------------------------------------------------------------
(async () => {
  const t0 = Date.now();
  console.log(`Kiểm định trên PostgreSQL local ${pgConfig().host}:${pgConfig().port}${QUICK ? " (--quick)" : ""}`);
  for (const st of [stageA, stageB, stageC, ...(QUICK ? [] : [stageD]), stageE]) {
    try {
      await st();
    } catch (e) {
      record(st.name.replace("stage", ""), `Lỗi khi chạy bước ${st.name}`, false, e.message);
    }
  }
  const failed = results.filter((r) => !r.ok);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const md = [
    `# Kết quả chạy lại kiểm định — ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
    "",
    `PostgreSQL local ${pgConfig().host}:${pgConfig().port} · ${results.length} mục · **${results.length - failed.length} đạt, ${failed.length} lỗi** · ${secs} s`,
    "",
    "| Nhóm | Mục | Kết quả | Chi tiết |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? "✅" : "❌"} | ${String(r.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
  ].join("\n");
  writeFileSync(path.join(OUT, "report.md"), md + "\n");
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  console.log(`\n${failed.length ? C.r : C.g}${results.length - failed.length}/${results.length} mục đạt${C.x} sau ${secs} s — báo cáo: .local/audit/report.md`);
  process.exit(failed.length ? 1 : 0);
})();
