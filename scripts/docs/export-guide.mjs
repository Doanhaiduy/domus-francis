#!/usr/bin/env node
// Xuất nội dung Hướng dẫn sử dụng (src/content/guide.ts — cùng nguồn với trang /huong-dan) ra docs/HUONG_DAN_SU_DUNG.md.
//   node --experimental-strip-types scripts/docs/export-guide.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const g = await import(pathToFileURL(path.join(ROOT, "src", "content", "guide.ts")).href);

const TONE = { tip: "💡 Mẹo", info: "ℹ️ Lưu ý", warn: "⚠️ Chú ý", danger: "⛔ Quan trọng" };
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Khối → Markdown. `lvl` = số # của tiêu đề con (mục = ##, tiêu đề trong mục = ###). */
function render(blocks, lvl = 3) {
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case "md":
        out.push(b.text.replace(/^### /gm, "#".repeat(lvl + 1) + " ").replace(/^## /gm, "#".repeat(lvl) + " "));
        break;
      case "heading":
        out.push(`${"#".repeat(lvl)} ${b.text}`);
        break;
      case "callout":
        out.push(`> **${b.title ?? TONE[b.tone]}** — ${b.text}`);
        break;
      case "steps": {
        if (b.title) out.push(`${"#".repeat(lvl + 1)} ${b.title}`);
        out.push(
          b.items
            .map((s, i) => `${i + 1}. **${s.title}**${s.path ? ` _(${s.path.join(" → ")})_` : ""}${s.text ? ` — ${s.text}` : ""}${s.demo ? ` _(minh họa trong ứng dụng)_` : ""}`)
            .join("\n"),
        );
        break;
      }
      case "path":
        out.push(`${b.label ? `${b.label}: ` : ""}**${b.items.join(" → ")}**`);
        break;
      case "cards":
        out.push(b.items.map((c) => `- **${c.title}** — ${c.text}`).join("\n"));
        break;
      case "demo":
        out.push(`_[Minh họa giao diện: ${b.caption ?? b.name} — xem trong ứng dụng]_`);
        break;
      case "table":
        out.push([`| ${b.head.map(cell).join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n"));
        break;
      case "tabs":
        for (const t of b.tabs) out.push(`${"#".repeat(lvl + 1)} ${t.label}`, render(t.blocks, lvl + 1));
        break;
      case "accordion":
        for (const i of b.items) out.push(`${"#".repeat(lvl + 1)} ${i.title}`, render(i.blocks, lvl + 1));
        break;
    }
  }
  return out.join("\n\n");
}

const order = ["all", "member", "treasurer", "house_head", "admin", "custom"];
const label = (s) => s.audience.map((a) => g.GUIDE_AUDIENCE_LABEL[a]).join(", ");
const lines = [
  "# Hướng dẫn sử dụng — Lưu Xá Phanxicô",
  "",
  "> Bản này được sinh từ cùng nội dung với trang **Hướng dẫn sử dụng** trong ứng dụng (thanh bên → Hướng dẫn sử dụng), nơi có thêm minh họa giao diện. Sửa nội dung ở `src/content/guide.ts` rồi chạy lại `node --experimental-strip-types scripts/docs/export-guide.mjs`.",
  "",
  "## Mục lục",
  "",
  ...g.GUIDE_SECTIONS.map((s, i) => `${i + 1}. [${s.title}](#${s.id}) — ${label(s)}`),
  "",
  "## Giới thiệu",
  "",
  g.GUIDE_INTRO,
  "",
  ...g.GUIDE_ROLES.map((r) => `- **${r.title}** — ${r.text}`),
  "",
];
for (const s of [...g.GUIDE_SECTIONS].sort((a, b) => order.indexOf(a.audience[0]) - order.indexOf(b.audience[0]))) {
  lines.push(`<a id="${s.id}"></a>`, "", `## ${s.title}`, "", `*Dành cho: ${label(s)}* — ${s.summary}`, "", render(s.blocks), "");
}
mkdirSync(path.join(ROOT, "docs"), { recursive: true });
const out = path.join(ROOT, "docs", "HUONG_DAN_SU_DUNG.md");
writeFileSync(out, lines.join("\n"));
console.log(`✓ ${path.relative(ROOT, out)} (${g.GUIDE_SECTIONS.length} mục)`);
