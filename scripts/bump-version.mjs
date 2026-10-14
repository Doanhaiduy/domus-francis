#!/usr/bin/env node
// Tăng số phiên bản MỖI LẦN phát hành: sửa "version" trong package.json VÀ thêm mục mới (mới nhất ở trên) vào src/content/changelog.ts.
//   node scripts/bump-version.mjs patch "Sửa lỗi gợi ý nguồn"     # 1.7.0 → 1.7.1  (sửa lỗi nhỏ)
//   node scripts/bump-version.mjs minor "Thêm trang X"            # 1.7.0 → 1.8.0  (thêm tính năng / màn hình)
//   node scripts/bump-version.mjs major "Đổi lớn"                 # 1.7.0 → 2.0.0  (đổi lớn, không tương thích)
// Sau đó MỞ src/content/changelog.ts, thay dòng "TODO — mô tả thay đổi" bằng nội dung thật (check-version.mjs chặn build nếu còn TODO).
import { readFileSync, writeFileSync } from "node:fs";

const [kind, ...rest] = process.argv.slice(2);
const title = rest.join(" ").trim();
if (!["patch", "minor", "major"].includes(kind) || !title) {
  console.error('Cách dùng: node scripts/bump-version.mjs <patch|minor|major> "Tiêu đề bản phát hành"');
  process.exit(2);
}

const pkgUrl = new URL("../package.json", import.meta.url);
const logUrl = new URL("../src/content/changelog.ts", import.meta.url);
const pkgText = readFileSync(pkgUrl, "utf8");
const current = /"version":\s*"(\d+)\.(\d+)\.(\d+)"/.exec(pkgText);
if (!current) {
  console.error('Không đọc được "version" trong package.json.');
  process.exit(1);
}
let [major, minor, patch] = current.slice(1).map(Number);
if (kind === "major") [major, minor, patch] = [major + 1, 0, 0];
else if (kind === "minor") [minor, patch] = [minor + 1, 0];
else patch += 1;
const next = `${major}.${minor}.${patch}`;

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const logText = readFileSync(logUrl, "utf8");
const marker = "export const CHANGELOG: Release[] = [\n";
if (!logText.includes(marker)) {
  console.error("Không tìm thấy danh sách CHANGELOG trong src/content/changelog.ts.");
  process.exit(1);
}
const entry = `  {\n    version: "${next}",\n    date: "${today}",\n    title: ${JSON.stringify(title)},\n    changes: [\n      { kind: "feat", text: "TODO — mô tả thay đổi" },\n    ],\n  },\n`;

writeFileSync(pkgUrl, pkgText.replace(current[0], `"version": "${next}"`));
writeFileSync(logUrl, logText.replace(marker, marker + entry));
console.log(`✓ ${current[1]}.${current[2]}.${current[3]} → ${next} (${today}). Hãy sửa dòng TODO trong src/content/changelog.ts rồi build.`);
