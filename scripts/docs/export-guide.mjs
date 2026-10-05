#!/usr/bin/env node
// Xuất nội dung Hướng dẫn sử dụng (src/content/guide.ts — cùng nguồn với trang /huong-dan) ra docs/HUONG_DAN_SU_DUNG.md.
//   node --experimental-strip-types scripts/docs/export-guide.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const g = await import(pathToFileURL(path.join(ROOT, "src", "content", "guide.ts")).href);

const order = ["all", "member", "treasurer", "house_head", "admin", "custom"];
const lines = [
  "# Hướng dẫn sử dụng — Lưu Xá Phanxicô",
  "",
  "> Bản này được sinh từ cùng nội dung với trang **Hướng dẫn sử dụng** trong ứng dụng (thanh bên → Hướng dẫn sử dụng). Sửa nội dung ở `src/content/guide.ts` rồi chạy lại `node --experimental-strip-types scripts/docs/export-guide.mjs`.",
  "",
  "## Mục lục",
  "",
  ...g.GUIDE_SECTIONS.map((s, i) => `${i + 1}. [${s.title}](#${s.id}) — ${s.audience.map((a) => g.GUIDE_AUDIENCE_LABEL[a]).join(", ")}`),
  "",
  "## Giới thiệu",
  "",
  g.GUIDE_INTRO,
  "",
];
for (const s of [...g.GUIDE_SECTIONS].sort((a, b) => order.indexOf(a.audience[0]) - order.indexOf(b.audience[0]))) {
  lines.push(`<a id="${s.id}"></a>`, "", `## ${s.title}`, "", `*Dành cho: ${s.audience.map((a) => g.GUIDE_AUDIENCE_LABEL[a]).join(", ")}*`, "");
  // Hạ một cấp tiêu đề trong thân mục (## → ###, ### → ####)
  lines.push(s.body.replace(/^### /gm, "#### ").replace(/^## /gm, "### "), "");
}
mkdirSync(path.join(ROOT, "docs"), { recursive: true });
const out = path.join(ROOT, "docs", "HUONG_DAN_SU_DUNG.md");
writeFileSync(out, lines.join("\n"));
console.log(`✓ ${path.relative(ROOT, out)} (${g.GUIDE_SECTIONS.length} mục)`);
