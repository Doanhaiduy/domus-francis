#!/usr/bin/env node
// Trích 38 khối ```sql của PHẦN 4 trong tài liệu thiết kế thành db/migrations/<NN>_<tên>.sql.
// Port 1-1 từ kiem-dinh/bang-chung/scripts/extract.py + split.py (cùng thứ tự, cùng tên file).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "TAI_LIEU_THIET_KE_BACKEND_PGSQL_LUU_XA_PHANXICO.md");
const OUT = path.join(ROOT, "db", "migrations");

const NAMES = [
  "01_foundation", "02_types", "03_tables_identity", "04_tables_people", "05_tables_house",
  "06_tables_duty", "07_tables_academic", "08_tables_events", "09_tables_finance",
  "10_tables_facilities", "11_tables_community", "12_tables_platform", "13_tables_ai",
  "14_deferred_fks", "20_indexes_special", "21_indexes_fk", "30_fn_core", "31_fn_generic",
  "32_fn_duty", "33_fn_academic", "34_fn_events", "35_fn_finance_ledger", "36_fn_finance_flows",
  "37_fn_facilities_community", "38_fn_platform", "39_triggers_boilerplate", "40_views",
  "44_rls_helpers", "45_rls_enable", "46_rls_policies_1", "47_rls_policies_2",
  "48_rls_policies_3", "49_a_ownership", "49_b_grants", "50_seed_rbac", "51_seed_settings",
  "52_seed_lookup", "60_smoke_tests",
];

const lines = readFileSync(SRC, "utf8").split("\n");
const blocks = [];
for (let i = 0; i < lines.length; i++) {
  const m = /^(\s*)```(\w*)\s*$/.exec(lines[i]);
  if (!m) continue;
  let j = i + 1;
  while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
  blocks.push({ lang: m[2], start: i + 1, end: j }); // nội dung = lines[start .. end-1] (0-based)
  i = j;
}

const sqlBlocks = blocks.filter((b) => b.lang === "sql").slice(0, NAMES.length);
if (sqlBlocks.length !== NAMES.length) throw new Error(`Chỉ thấy ${sqlBlocks.length} khối sql`);
mkdirSync(OUT, { recursive: true });
let total = 0;
NAMES.forEach((name, k) => {
  const b = sqlBlocks[k];
  const body = lines.slice(b.start, b.end).join("\n").replace(/\r$/gm, "");
  writeFileSync(path.join(OUT, `${name}.sql`), body + "\n");
  total += b.end - b.start;
  console.log(`${name.padEnd(28)} dòng ${String(b.start + 1).padStart(6)}  (${b.end - b.start} dòng)`);
});
console.log(`Tổng ${total} dòng → ${path.relative(ROOT, OUT)}`);
