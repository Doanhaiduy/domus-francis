// Seed THƯ VIỆN TÀI LIỆU PHỤNG VỤ (bảng liturgy_documents — db/app/995_liturgy_documents.sql):
//  - 3 kinh nguyện Công giáo phổ biến (Kinh Lạy Cha, Kính Mừng, Sáng Danh — văn bản quen dùng trong các giáo xứ Việt Nam);
//  - 2 bài hát MẪU (lời tự viết ngắn để minh họa định dạng — không phải bài thánh ca có bản quyền);
//  - 1 liên kết YouTube dạng TÌM KIẾM (không trỏ tới một video cụ thể), 1 trang Lời Chúa/lịch phụng vụ hằng ngày;
//  - 1 tệp PDF mẫu (sinh tại chỗ, không tải từ mạng) ghi vào STORAGE_DIR như luồng /api/v1/files, bucket "documents".
// Người nhập: Trưởng ban Phụng vụ (Đặng Thanh Phong). Chạy lại an toàn: đã có tài liệu thì bỏ qua.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal, ROOT } from "../env.mjs";

// PDF tối giản hợp lệ (chữ ASCII — phông Helvetica chuẩn không có dấu tiếng Việt)
function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (m) => "\\" + m);
  const content = ["BT", "/F1 13 Tf", "56 780 Td", "20 TL", ...lines.map((l, i) => `(${esc(l)}) ${i ? "'" : "Tj"}`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function storePdf(ctx, uploadedBy, originalName, lines) {
  const { q } = ctx;
  const body = makePdf(lines);
  const id = (await q("SELECT app.uuid_v7() AS id"))[0].id;
  const now = new Date(Date.now() + 7 * 3600e3);
  const key = `documents/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.pdf`;
  const root = path.resolve(ROOT, process.env.STORAGE_DIR || loadEnvLocal().STORAGE_DIR || ".local/storage");
  const abs = path.resolve(root, key);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  await q(
    `INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, detected_mime, size_bytes, sha256,
                                exif_stripped, status, scan_status, variants, uploaded_by)
     VALUES ($1, 'documents', $2, $3, 'application/pdf', 'application/pdf', $4, $5, false, 'ready', 'skipped', '{}'::jsonb, $6)`,
    [id, key, originalName, body.length, createHash("sha256").update(body).digest("hex"), uploadedBy]
  );
  return id;
}

const PRAYERS = [
  {
    title: "Kinh Lạy Cha",
    category: "Kinh hằng ngày",
    tags: ["kinh căn bản", "kinh sáng", "kinh tối"],
    pinned: true,
    content: [
      "Lạy Cha chúng con ở trên trời,",
      "chúng con nguyện danh Cha cả sáng,",
      "nước Cha trị đến,",
      "ý Cha thể hiện dưới đất cũng như trên trời.",
      "Xin Cha cho chúng con hôm nay lương thực hằng ngày,",
      "và tha nợ chúng con,",
      "như chúng con cũng tha kẻ có nợ chúng con.",
      "Xin chớ để chúng con sa chước cám dỗ,",
      "nhưng cứu chúng con cho khỏi sự dữ. Amen.",
    ].join("\n"),
  },
  {
    title: "Kinh Kính Mừng",
    category: "Kinh hằng ngày",
    tags: ["kinh căn bản", "Đức Mẹ", "Mân Côi"],
    pinned: true,
    content: [
      "Kính mừng Maria đầy ơn phúc,",
      "Đức Chúa Trời ở cùng Bà,",
      "Bà có phúc lạ hơn mọi người nữ,",
      "và Giêsu con lòng Bà gồm phúc lạ.",
      "",
      "Thánh Maria Đức Mẹ Chúa Trời,",
      "cầu cho chúng con là kẻ có tội,",
      "khi nay và trong giờ lâm tử. Amen.",
    ].join("\n"),
  },
  {
    title: "Kinh Sáng Danh",
    category: "Kinh hằng ngày",
    tags: ["kinh căn bản", "Chúa Ba Ngôi"],
    pinned: false,
    content: [
      "Sáng danh Đức Chúa Cha, và Đức Chúa Con, và Đức Chúa Thánh Thần.",
      "Như đã có trước vô cùng, và bây giờ, và hằng có, và đời đời chẳng cùng. Amen.",
    ].join("\n"),
  },
];

const SONGS = [
  {
    title: "Về đây anh em (bài hát mẫu)",
    category: "Hát chung cộng đoàn",
    tags: ["bài mẫu", "nhập lễ"],
    content: [
      "(Lời mẫu do Ban Phụng vụ soạn để minh họa cách nhập bài hát — thay bằng lời bài thánh ca thật khi dùng.)",
      "",
      "ĐK: Về đây anh em, ta cùng chung lời ca,",
      "dâng lên Thiên Chúa niềm vui một nhà.",
      "",
      "1. Sau một ngày dài bài vở bộn bề,",
      "ta tìm về đây bình an Chúa trao.",
      "",
      "2. Tay trong tay nhau, ta nguyện cho nhau,",
      "giữ lửa yêu thương nơi mái nhà chung.",
    ].join("\n"),
  },
  {
    title: "Kinh chiều tạ ơn (bài hát mẫu)",
    category: "Giờ kinh tối",
    tags: ["bài mẫu", "kết lễ", "tạ ơn"],
    content: [
      "(Lời mẫu — chỉ để minh họa định dạng điệp khúc / phiên khúc.)",
      "",
      "1. Chiều buông xuống trên mái nhà Phanxicô,",
      "xin dâng Chúa trọn một ngày đã qua.",
      "",
      "ĐK: Tạ ơn Chúa, tạ ơn Chúa,",
      "vì muôn hồng ân Chúa ban mỗi ngày.",
    ].join("\n"),
  },
];

export async function seed(ctx) {
  const { q, ids } = ctx;
  if (Number((await q("SELECT count(*) AS n FROM liturgy_documents"))[0].n) > 0) return;

  const lead = ids.user?.["6"] ?? (await q("SELECT id FROM users WHERE email = 'phong.dang@luuxa.local'"))[0]?.id;
  if (!lead) throw new Error("Chưa có tài khoản Trưởng ban Phụng vụ (phong.dang) — chạy seed people trước");
  await ctx.as(lead);

  const insert = (d) =>
    q(
      `INSERT INTO liturgy_documents (title, kind, category, tags, content, url, file_id, is_pinned, created_by)
       VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9)`,
      [d.title, d.kind, d.category ?? null, d.tags ?? [], d.content ?? null, d.url ?? null, d.fileId ?? null, !!d.pinned, lead]
    );

  for (const p of PRAYERS) await insert({ ...p, kind: "prayer" });
  for (const s of SONGS) await insert({ ...s, kind: "song" });

  await insert({
    title: "Tìm nghe Thánh ca Mùa Vọng trên YouTube",
    kind: "youtube",
    category: "Mùa Vọng",
    tags: ["thánh ca", "Mùa Vọng", "tập hát"],
    url: "https://www.youtube.com/results?search_query=th%C3%A1nh+ca+m%C3%B9a+v%E1%BB%8Dng",
    content: "Liên kết mở trang tìm kiếm của YouTube — chọn bản thu phù hợp để cả nhà tập hát trước Chúa Nhật I Mùa Vọng.",
  });
  await insert({
    title: "Lời Chúa & lịch phụng vụ hằng ngày",
    kind: "link",
    category: "Lịch phụng vụ",
    tags: ["bài đọc", "Lời Chúa", "lịch phụng vụ"],
    url: "https://ktcgkpv.org/",
    content: "Trang của Nhóm Phiên dịch Các Giờ Kinh Phụng vụ: bài đọc Thánh lễ và lịch phụng vụ theo ngày.",
    pinned: true,
  });

  const pdf = await storePdf(ctx, lead, "lich-phung-vu-thang-10-mau.pdf", [
    "Luu Xa Phanxico - Lich phung vu thang 10/2026 (BAN MAU)",
    "",
    "Moi toi 20:30  Kinh Toi & Lan hat Man Coi chung ca nha",
    "Thu Sau        Ngam Dang Thanh Gia",
    "Thu Bay        Chau Thanh The",
    "Chua Nhat      Thanh le cong doan 08:30",
    "04/10          Thanh le Bon mang Thanh Phanxico Assisi",
  ]);
  await insert({
    title: "Lịch phụng vụ tháng 10 (PDF mẫu)",
    kind: "pdf",
    category: "Lịch phụng vụ",
    tags: ["tháng Mân Côi", "bài mẫu"],
    fileId: pdf,
    content: "Bản PDF mẫu để thử tính năng xem/tải tài liệu.",
  });
  await insert({
    title: "Cách lần hạt Mân Côi",
    kind: "note",
    category: "Hướng dẫn",
    tags: ["Mân Côi", "Đức Mẹ"],
    content: [
      "1. Dấu Thánh Giá, Kinh Tin Kính.",
      "2. Kinh Lạy Cha, 3 Kinh Kính Mừng, Kinh Sáng Danh.",
      "3. Mỗi chục: thông báo mầu nhiệm, 1 Kinh Lạy Cha, 10 Kinh Kính Mừng, 1 Kinh Sáng Danh.",
      "4. Kết thúc: Kinh Lạy Nữ Vương.",
      "",
      "Mầu nhiệm theo ngày: Thứ Hai & Thứ Bảy — Vui; Thứ Ba & Thứ Sáu — Thương; Thứ Tư & Chúa Nhật — Mừng; Thứ Năm — Sự Sáng.",
    ].join("\n"),
  });

  if (ids.user?.["2"]) await ctx.as(ids.user["2"]);
}
