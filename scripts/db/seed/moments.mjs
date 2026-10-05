// Seed: Khoảnh khắc — album, ảnh, thẻ tên, lượt tim. Nguồn: INITIAL_MOMENTS của giao diện cũ (scripts/db/seed/mock-source.ts).
// Không tải ảnh từ mạng: tạo ảnh giữ chỗ (gradient + họa tiết, không chữ) bằng sharp, ghi vào STORAGE_DIR theo đúng khóa
// <bucket>/<yyyy>/<mm>/<id>.<ext> (+ biến thể .thumb.webp / .medium.webp) như src/server/storage.ts, bản ghi storage_files ở trạng thái ready.
// Tệp được ghi uploaded_by = người đăng ảnh và ctx.as(người đó) trước khi tham chiếu ⇒ trigger BR-STO-05 hợp lệ.
// Ngày album dời theo ngày chạy (mốc giao diện cũ 04/10/2026 = hôm nay) để màn hình luôn có dữ liệu gần đây.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../env.mjs";

const MOCK_TODAY = "2026-10-04";
const STORAGE_ROOT = path.resolve(ROOT, process.env.STORAGE_DIR || ".local/storage");

// Bảng màu theo mã chủ đề (52_seed_lookup.sql)
const PALETTE = {
  ALB_PILGRIM: ["#4338ca", "#8b5cf6", "#c4b5fd"],
  ALB_TRIP: ["#047857", "#0ea5e9", "#a7f3d0"],
  ALB_PATRON: ["#b45309", "#f43f5e", "#fde68a"],
  ALB_MEAL: ["#be185d", "#f97316", "#fecdd3"],
  ALB_DAILY: ["#1d4ed8", "#06b6d4", "#bfdbfe"],
  ALB_FAREWELL: ["#6d28d9", "#475569", "#e9d5ff"],
};

const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const dmyToIso = (s) => s.split("/").reverse().join("-");
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

// PRNG xác định (ảnh giống nhau giữa các lần chạy)
function rng(seed) {
  let a = seed | 0; // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

function patternSvg(seed, [p1, p2, c3]) {
  const r = rng(seed);
  const [c1, c2] = seed % 2 ? [p2, p1] : [p1, p2];
  const W = 1600;
  const H = 1200;
  const kind = seed % 3;
  let shapes = "";
  if (kind === 0) {
    // bokeh: các vòng tròn sáng mờ
    for (let i = 0; i < 26; i++) {
      const rad = 30 + r() * 170;
      shapes += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${rad.toFixed(0)}" fill="#ffffff" fill-opacity="${(0.05 + r() * 0.16).toFixed(2)}"/>`;
    }
  } else if (kind === 1) {
    // đồi núi nhiều lớp
    for (let layer = 0; layer < 4; layer++) {
      const base = H * (0.45 + layer * 0.14);
      let d = `M0 ${H} L0 ${base.toFixed(0)}`;
      for (let x = 0; x <= W; x += 160) d += ` Q${x + 80} ${(base - 60 - r() * 140).toFixed(0)} ${x + 160} ${(base - r() * 50).toFixed(0)}`;
      d += ` L${W} ${H} Z`;
      shapes += `<path d="${d}" fill="${layer % 2 ? c3 : "#0f172a"}" fill-opacity="${(0.12 + layer * 0.08).toFixed(2)}"/>`;
    }
    shapes += `<circle cx="${(300 + r() * 1000).toFixed(0)}" cy="${(180 + r() * 200).toFixed(0)}" r="110" fill="#fff7ed" fill-opacity="0.55"/>`;
  } else {
    // dải chéo + chấm
    for (let i = -6; i < 14; i++) {
      const x = i * 160;
      shapes += `<polygon points="${x},0 ${x + 70},0 ${x + 70 + 700},${H} ${x + 700},${H}" fill="#ffffff" fill-opacity="${(0.04 + r() * 0.08).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 40; i++) {
      shapes += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(4 + r() * 14).toFixed(0)}" fill="${c3}" fill-opacity="0.5"/>`;
    }
  }
  const cx = (0.2 + r() * 0.6).toFixed(2);
  const cy = (0.2 + r() * 0.5).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <radialGradient id="l" cx="${cx}" cy="${cy}" r="0.7"><stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#l)"/>
  ${shapes}
</svg>`;
}

/** dHash 64-bit → chuỗi bigint có dấu (giống src/server/storage.ts). */
async function dHash(buf) {
  const px = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return BigInt.asIntN(64, h).toString();
}

/** Tạo ảnh giữ chỗ + biến thể, ghi đĩa, thêm storage_files (ready) với uploaded_by = userId. */
async function createPlaceholderFile(q, userId, seed, palette, originalName) {
  const { data: body, info } = await sharp(Buffer.from(patternSvg(seed, palette)))
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const [{ id }] = await q("SELECT app.uuid_v7() AS id");
  const now = new Date(Date.now() + 7 * 3600e3);
  const prefix = `moments/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = `${prefix}/${id}.jpg`;
  const variants = {};
  await mkdir(path.join(STORAGE_ROOT, prefix), { recursive: true });
  await writeFile(path.join(STORAGE_ROOT, key), body);
  for (const [name, size] of [["thumb", 360], ["medium", 1280]]) {
    const vbuf = await sharp(body).resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const vkey = `${prefix}/${id}.${name}.webp`;
    await writeFile(path.join(STORAGE_ROOT, vkey), vbuf);
    variants[name] = vkey;
  }
  await q(
    `INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, detected_mime, size_bytes, sha256, phash,
                                width_px, height_px, exif_stripped, status, scan_status, variants, uploaded_by, attached_at)
     VALUES ($1, 'moments', $2, $3, 'image/jpeg', 'image/jpeg', $4, $5, $6::bigint, $7, $8, true, 'ready', 'skipped', $9::jsonb, $10, now())`,
    [id, key, originalName, body.length, createHash("sha256").update(body).digest("hex"), await dHash(body), info.width, info.height, JSON.stringify(variants), userId]
  );
  return id;
}

export async function seed(ctx) {
  const { q, mock, ids } = ctx;
  const albums = mock.INITIAL_MOMENTS ?? [];
  if (!albums.length) return;

  const shift = Math.round((Date.parse(`${vnToday()}T00:00:00Z`) - Date.parse(`${MOCK_TODAY}T00:00:00Z`)) / 86400e3);
  const day = (dmy) => addDays(dmyToIso(dmy), shift);

  const cats = Object.fromEntries((await q("SELECT id, code, name FROM categories WHERE kind = 'album' AND deleted_at IS NULL")).map((c) => [c.name, c]));
  const userOfMember = Object.fromEntries((await q("SELECT id, user_id FROM members WHERE user_id IS NOT NULL")).map((m) => [m.id, m.user_id]));
  const resolve = (name) => ids.memberByFullName[name] ?? ids.memberByName[name] ?? null;
  const allMembers = Object.keys(ids.member).sort((a, b) => Number(a) - Number(b)).map((k) => ids.member[k]);
  const me = ids.member["1"]; // "isLiked" của giao diện cũ = góc nhìn của Minh Tuấn (tài khoản thành viên tuan.nguyen)
  const pickLikers = (seed, n, includeMe) => {
    const others = allMembers.filter((m) => m !== me);
    const start = seed % others.length;
    const out = [];
    for (let i = 0; out.length < Math.min(n - (includeMe ? 1 : 0), others.length); i++) out.push(others[(start + i) % others.length]);
    return includeMe ? [me, ...out] : out;
  };

  let made = 0;
  let photos = 0;
  for (const a of albums) {
    const cat = cats[a.category];
    const authorMember = resolve(a.author);
    const authorUser = authorMember && userOfMember[authorMember];
    if (!cat || !authorUser) throw new Error(`moments: không ánh xạ được album "${a.title}" (chủ đề/tác giả)`);
    const exists = await q("SELECT 1 FROM albums WHERE title = $1 AND deleted_at IS NULL", [a.title]);
    if (exists.length) continue; // chạy lại không nhân bản
    const palette = PALETTE[cat.code] ?? PALETTE.ALB_DAILY;
    const takenOn = day(a.date);
    const baseSeed = hashStr(a.id);

    await ctx.as(authorUser);
    const coverId = await createPlaceholderFile(q, authorUser, baseSeed, palette, `${slug(a.title)}-bia.jpg`);
    const [alb] = await q(
      `INSERT INTO albums (title, description, category_id, taken_on, location_text, cover_file_id, author_member_id, is_featured, tags, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ($4::date + time '20:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') RETURNING id`,
      [a.title, a.description, cat.id, takenOn, a.location, coverId, authorMember, !!a.isFeatured, (a.tags ?? []).map((t) => t.replace(/^#/, ""))]
    );
    // Ảnh bìa là ảnh đầu tiên của album (giống luồng tạo album trên giao diện)
    await q(
      `INSERT INTO album_photos (album_id, file_id, caption, uploaded_by_member_id, taken_at, sort_order, created_at)
       VALUES ($1, $2, $3, $4, ($5::date + time '08:30') AT TIME ZONE 'Asia/Ho_Chi_Minh', 0, ($5::date + time '20:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      [alb.id, coverId, a.title, authorMember, takenOn]
    );
    photos++;

    for (const [i, p] of (a.photos ?? []).entries()) {
      const upMember = resolve(p.uploadedBy) ?? authorMember;
      const upUser = userOfMember[upMember] ?? authorUser;
      await ctx.as(upUser);
      const fileId = await createPlaceholderFile(q, upUser, baseSeed + i + 1, palette, `${slug(a.title)}-${String(i + 1).padStart(2, "0")}.jpg`);
      const shot = p.date ? day(p.date) : takenOn;
      const [ph] = await q(
        `INSERT INTO album_photos (album_id, file_id, caption, uploaded_by_member_id, taken_at, sort_order, created_at)
         VALUES ($1, $2, $3, $4, ($5::date + make_interval(hours => $6)) AT TIME ZONE 'Asia/Ho_Chi_Minh', $7,
                 ($5::date + time '21:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') RETURNING id`,
        [alb.id, fileId, p.caption ?? null, upMember, shot, 9 + i * 2, i + 1]
      );
      photos++;
      const nPhotoLikes = Math.min(allMembers.length, Math.max(1, Math.round((p.likesCount ?? 0) / 3)));
      for (const m of pickLikers(baseSeed + i * 7, nPhotoLikes, (p.likesCount ?? 0) % 2 === 1)) {
        await q("INSERT INTO photo_likes (photo_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ph.id, m]);
      }
    }

    // Thẻ tên người tham gia: accepted nếu đã đồng ý photo_tagging, ngược lại chờ họ xác nhận (BR-COM-07)
    await ctx.as(authorUser);
    const tagged = [...new Set((a.participants ?? []).map(resolve).filter(Boolean))];
    for (const m of tagged) {
      await q(
        `INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id, status, responded_at)
         SELECT $1, $2, $3, CASE WHEN app.has_active_consent($2, 'photo_tagging') THEN 'accepted' ELSE 'pending' END,
                CASE WHEN app.has_active_consent($2, 'photo_tagging') THEN now() END
         ON CONFLICT DO NOTHING`,
        [alb.id, m, authorMember]
      );
    }

    // Tim album (mỗi người một lượt; bộ đếm likes_count do trigger)
    const nLikes = Math.min(allMembers.length, Math.max(2, Math.round((a.likesCount ?? 0) / 4)));
    for (const m of pickLikers(baseSeed, nLikes, !!a.isLiked)) {
      await q("INSERT INTO album_likes (album_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [alb.id, m]);
    }
    made++;
  }
  await ctx.as(ids.user["2"]);
  console.log(`    moments: ${made} album, ${photos} ảnh (ảnh giữ chỗ tại ${path.relative(ROOT, STORAGE_ROOT)})`);
}
