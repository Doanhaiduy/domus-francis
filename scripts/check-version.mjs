#!/usr/bin/env node
// Chặn build khi quên cập nhật phiên bản: "version" trong package.json phải TRÙNG mục đầu của src/content/changelog.ts,
// danh sách phải xếp mới → cũ (số phiên bản giảm dần, ngày không tăng), mỗi bản phải có nội dung (không còn "TODO").
// Chạy tự động trong `pnpm build`; chạy tay: node scripts/check-version.mjs. Tăng phiên bản: node scripts/bump-version.mjs <patch|minor|major> "Tiêu đề".
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const src = readFileSync(new URL("src/content/changelog.ts", root), "utf8");

const releases = [...src.matchAll(/^ {4}version: "([^"]+)",\s*\n {4}date: "([^"]+)",/gm)].map((m) => ({ version: m[1], date: m[2] }));
const problems = [];
const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

if (!releases.length) problems.push("Không đọc được mục nào trong src/content/changelog.ts.");
for (const r of releases) {
  if (!/^\d+\.\d+\.\d+$/.test(r.version)) problems.push(`Số phiên bản "${r.version}" sai định dạng MAJOR.MINOR.PATCH.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) problems.push(`Ngày "${r.date}" của bản ${r.version} phải dạng YYYY-MM-DD.`);
}
for (let i = 1; i < releases.length; i++) {
  if (cmp(releases[i - 1].version, releases[i].version) <= 0) problems.push(`Danh sách phải xếp mới → cũ: ${releases[i - 1].version} đứng trước ${releases[i].version}.`);
  if (releases[i - 1].date < releases[i].date) problems.push(`Bản ${releases[i - 1].version} (${releases[i - 1].date}) mới hơn nhưng ngày lại sớm hơn bản ${releases[i].version} (${releases[i].date}).`);
}
if (releases.length && pkg.version !== releases[0].version) {
  problems.push(`package.json là ${pkg.version} nhưng mục đầu của changelog là ${releases[0].version}. Mỗi lần phát hành phải tăng phiên bản VÀ thêm mục vào changelog — dùng: node scripts/bump-version.mjs <patch|minor|major> "Tiêu đề".`);
}
if (/TODO — mô tả thay đổi/.test(src)) problems.push('src/content/changelog.ts còn dòng "TODO — mô tả thay đổi": hãy viết nội dung bản phát hành.');

if (problems.length) {
  console.error("✗ Kiểm tra phiên bản không đạt:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(`✓ Phiên bản ${pkg.version} khớp changelog (${releases.length} bản).`);
