#!/usr/bin/env node
// Trình chạy file SQL tương đương `psql -X -q -v ON_ERROR_STOP=1 -f <file>` (bản embedded không kèm psql.exe):
//  - tách câu lệnh như psql (tôn trọng '…', E'…', "…", $tag$…$tag$, -- và /* */ lồng nhau)
//  - chạy từng câu ở chế độ autocommit trên CÙNG một kết nối → BEGIN/COMMIT trong file giữ nguyên nghĩa
//  - in NOTICE/WARNING ra stdout, dừng ở lỗi đầu tiên và báo file:dòng
//
//   node scripts/db/sql.mjs [-d <db>] [-U <user>] <file.sql> [...]
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pgConfig } from "./env.mjs";

const isIdentChar = (c) => /[A-Za-z0-9_$\u0080-￿]/.test(c);

/** Tách văn bản SQL thành các câu lệnh; trả về [{ sql, line }] (line = dòng bắt đầu, 1-based). */
export function splitSql(text) {
  const out = [];
  let i = 0, start = 0, line = 1, startLine = 1, hasContent = false;
  const n = text.length;
  const push = (end) => {
    const sql = text.slice(start, end).trim();
    if (hasContent && sql) out.push({ sql, line: startLine });
    hasContent = false;
  };
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (!hasContent) { start = i; startLine = line; }
    if (c === "-" && d === "-") { // comment dòng
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") { // comment khối, lồng được
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        if (text[i] === "\n") line++;
        if (text[i] === "/" && text[i + 1] === "*") { depth++; i += 2; }
        else if (text[i] === "*" && text[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    hasContent = true;
    if (c === "'") {
      const escaped = i > 0 && /[eE]/.test(text[i - 1]) && !(i > 1 && isIdentChar(text[i - 2]));
      i++;
      while (i < n) {
        if (text[i] === "\n") line++;
        if (escaped && text[i] === "\\") { i += 2; continue; }
        if (text[i] === "'") { if (text[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') {
      i++;
      while (i < n) {
        if (text[i] === "\n") line++;
        if (text[i] === '"') { if (text[i + 1] === '"') { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (c === "$" && !(i > 0 && isIdentChar(text[i - 1]))) {
      const m = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(text.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end < 0 ? n : end + tag.length;
        for (let k = i; k < stop; k++) if (text[k] === "\n") line++;
        i = stop;
        continue;
      }
    }
    if (c === ";") { push(i + 1); i++; continue; }
    i++;
  }
  push(n);
  return out;
}

function lineOfPosition(sql, pos) {
  return sql.slice(0, Math.max(0, pos - 1)).split("\n").length - 1;
}

/** In kết quả SELECT dạng bảng gọn (giống psql, không viền). */
export function printResult(res) {
  for (const r of Array.isArray(res) ? res : [res]) {
    if (!r?.fields?.length) continue;
    const cols = r.fields.map((f) => f.name);
    const cell = (v) => (v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
    const rows = r.rows.map((row) => cols.map((c) => cell(row[c])));
    const w = cols.map((c, k) => Math.min(60, Math.max(c.length, ...rows.map((x) => x[k].length))));
    console.log(cols.map((c, k) => c.padEnd(w[k])).join(" | "));
    console.log(w.map((x) => "-".repeat(x)).join("-+-"));
    for (const x of rows) console.log(x.map((v, k) => v.padEnd(w[k])).join(" | "));
    console.log(`(${r.rows.length} dòng)
`);
  }
}

/** Chạy một file SQL trên client đã kết nối. Ném lỗi (đã kèm file:dòng) ở câu lỗi đầu tiên. */
export async function runSqlFile(client, file, { print = false } = {}) {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const stmts = splitSql(text);
  for (const { sql, line } of stmts) {
    try {
      const res = await client.query(sql);
      if (print) printResult(res);
    } catch (e) {
      const at = e.position ? line + lineOfPosition(sql, Number(e.position)) : line;
      const err = new Error(`${path.basename(file)}:${at}: ${e.severity || "ERROR"}: ${e.message}${e.detail ? `\n  DETAIL: ${e.detail}` : ""}${e.hint ? `\n  HINT: ${e.hint}` : ""}${e.where ? `\n  CONTEXT: ${e.where}` : ""}`);
      err.pg = e;
      throw err;
    }
  }
  return stmts.length;
}

export function attachNoticePrinter(client, prefix = "") {
  client.on("notice", (m) => {
    if (m.severity === "NOTICE" || m.severity === "WARNING" || m.severity === "INFO") {
      console.log(`${prefix}${m.severity}:  ${m.message}`);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {};
  const files = [];
  for (let k = 0; k < args.length; k++) {
    if (args[k] === "-d") opts.database = args[++k];
    else if (args[k] === "-U") opts.user = args[++k];
    else files.push(args[k]);
  }
  if (!files.length) {
    console.log("Dùng: node scripts/db/sql.mjs [-d db] [-U user] file.sql ...");
    process.exit(1);
  }
  const client = new pg.Client(pgConfig(opts));
  await client.connect();
  attachNoticePrinter(client);
  try {
    for (const f of files) await runSqlFile(client, f, { print: true });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 3; // giống psql ON_ERROR_STOP
  } finally {
    await client.end();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
