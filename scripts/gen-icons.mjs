#!/usr/bin/env node
// Sinh biểu tượng ứng dụng (PWA, favicon, thông báo đẩy) từ một hình vẽ SVG: chữ thập trắng trên nền tím thương hiệu.
//   node scripts/gen-icons.mjs
// Ghi: src/app/icon.png (favicon), src/app/apple-icon.png, public/icons/{icon-192,icon-512,icon-maskable-512,badge-72}.png
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(ROOT, "public", "icons"), { recursive: true });

// Hệ tọa độ 512×512. `pad` = vùng an toàn (maskable cần nội dung nằm trong ~80% giữa).
const cross = (size, color) => {
  const s = size;
  const w = s * 0.17; // bề dày
  const v = s * 0.56; // chiều dọc
  const h = s * 0.40; // chiều ngang
  const cx = s / 2;
  const top = s * 0.5 - v * 0.52;
  const arm = top + v * 0.30;
  return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${v}" rx="${w * 0.18}" fill="${color}"/>
          <rect x="${cx - h / 2}" y="${arm}" width="${h}" height="${w}" rx="${w * 0.18}" fill="${color}"/>`;
};

const bg = (size, radius) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5f3add"/><stop offset="1" stop-color="#7857f8"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>`;

const svg = (size, { radius, scale = 1, color = "#ffffff", withBg = true }) => {
  const inner = size * scale;
  const off = (size - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${withBg ? bg(size, radius) : ""}
    <g transform="translate(${off} ${off})">${cross(inner, color)}</g>
  </svg>`;
};

const out = async (file, size, opts) => {
  const buf = await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toBuffer();
  await sharp(buf).toFile(path.join(ROOT, file));
  console.log("✓", file, `${size}×${size}`);
};

await out("public/icons/icon-192.png", 192, { radius: 44 });
await out("public/icons/icon-512.png", 512, { radius: 112 });
await out("public/icons/icon-maskable-512.png", 512, { radius: 0, scale: 0.78 }); // nền tràn, nội dung trong vùng an toàn
await out("src/app/icon.png", 512, { radius: 112 });
await out("src/app/apple-icon.png", 180, { radius: 0 }); // iOS tự bo góc
await out("public/icons/badge-72.png", 72, { radius: 0, withBg: false }); // thông báo: nền trong suốt, chữ thập trắng

// Ảnh chia sẻ mặc định 1200×630 (Open Graph): nền tím + chữ thập lớn, không chữ để không phụ thuộc phông.
{
  const W = 1200;
  const H = 630;
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4d2dbf"/><stop offset="0.55" stop-color="#5f3add"/><stop offset="1" stop-color="#7857f8"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <circle cx="1080" cy="80" r="260" fill="#ffffff" fill-opacity="0.08"/>
    <circle cx="90" cy="600" r="220" fill="#a5b4fc" fill-opacity="0.15"/>
    <g transform="translate(${(W - 420) / 2} ${(H - 420) / 2})">${cross(420, "#ffffff")}</g>
  </svg>`;
  await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(path.join(ROOT, "public/og-default.png"));
  console.log("✓ public/og-default.png 1200×630");
}
