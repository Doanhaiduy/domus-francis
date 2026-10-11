// Kiểm thử TẢI ẢNH (src/server/storage.ts storeUpload): xử lý nhanh + song song, ngày chụp EXIF do trình duyệt gửi kèm (canvas đã xóa EXIF), Server-Timing,
// xoay đúng chiều, ảnh hỏng, PDF theo bucket, nhiều ảnh cùng lúc.
import pg from "pg";
import sharp from "sharp";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Tải ảnh: tối ưu + ngày chụp EXIF + Server-Timing");
  const a = await as("tuan.nguyen@luuxa.local");
  const b = await as("hieu.bui@luuxa.local");

  const jpeg = (w, h, extra = {}) =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 140, b: 60 } } }).jpeg({ quality: 88 }).withMetadata(extra).toBuffer();
  const post = async (c, buf, { bucket = "moments", name = "a.jpg", type = "image/jpeg", exifDate } = {}) => {
    const form = new FormData();
    form.append("bucket", bucket);
    if (exifDate !== undefined) form.append("exifDate", exifDate);
    form.append("file", new Blob([buf], { type }), name);
    return c.req("POST", "/api/v1/files", undefined, { form, raw: true });
  };
  const takenAt = async (id) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return (await db.query("SELECT taken_at, status::text AS status, exif_stripped, width_px, height_px, variants FROM storage_files WHERE id = $1", [id])).rows[0];
    } finally {
      await db.end();
    }
  };

  await test("Ảnh gửi kèm exifDate (trình duyệt đã xóa EXIF): lưu taken_at đúng; có Server-Timing các bước", async () => {
    const res = await post(a, await jpeg(1600, 1000), { exifDate: "2026:10:04 17:45:30" });
    eq(res.status, 200);
    const timing = res.headers.get("server-timing") ?? "";
    for (const k of ["read", "db_insert", "process", "storage", "db_finalize", "total"]) ok(timing.includes(`${k};dur=`), `thiếu ${k} trong Server-Timing: ${timing}`);
    const j = await res.json();
    ok(!("timings" in j), "không lộ timings trong thân JSON");
    const row = await takenAt(j.id);
    eq(row.status, "ready");
    eq(new Date(row.taken_at).toISOString(), "2026-10-04T17:45:30.000Z");
    eq(row.exif_stripped, true);
  });

  await test("exifDate sai định dạng / ở tương lai / quá cũ bị bỏ qua (taken_at rỗng)", async () => {
    for (const bad of ["hôm qua", "2026-10-04 17:45:30", "2999:01:01 00:00:00", "1999:01:01 00:00:00", "2026:13:45 25:61:61"]) {
      const res = await post(a, await jpeg(400, 300), { exifDate: bad });
      eq(res.status, 200, bad);
      const row = await takenAt((await res.json()).id);
      eq(row.taken_at, null, `exifDate "${bad}" phải bị bỏ qua`);
    }
    const none = await post(a, await jpeg(400, 300));
    eq((await takenAt((await none.json()).id)).taken_at, null);
  });

  await test("Ảnh có EXIF thật: ưu tiên EXIF trong tệp hơn exifDate của trình duyệt", async () => {
    // sharp ghi EXIF DateTimeOriginal qua withExif
    const buf = await sharp({ create: { width: 500, height: 300, channels: 3, background: "#336699" } })
      .jpeg()
      .withExif({ IFD2: { DateTimeOriginal: "2026:09:20 08:00:00" } })
      .toBuffer();
    const res = await post(a, buf, { exifDate: "2026:10:04 17:45:30" });
    eq(res.status, 200);
    eq(new Date((await takenAt((await res.json()).id)).taken_at).toISOString(), "2026-09-20T08:00:00.000Z");
  });

  await test("Ảnh chụp dọc (EXIF orientation 6) được xoay đúng chiều; ảnh lớn bị thu về ≤ 2560px; có ảnh thu nhỏ webp", async () => {
    const res = await post(a, await jpeg(3600, 2400, { orientation: 6 }));
    eq(res.status, 200);
    const j = await res.json();
    ok(j.height > j.width, `ảnh chụp dọc phải cao hơn rộng: ${j.width}x${j.height}`);
    ok(Math.max(j.width, j.height) <= 2560, `cạnh dài ≤ 2560: ${j.width}x${j.height}`);
    const row = await takenAt(j.id);
    ok(row.variants.thumb && row.variants.medium, "có biến thể thumb + medium");
    const thumb = await a.req("GET", `/api/v1/files/${j.id}?v=thumb`, undefined, { raw: true });
    eq(thumb.status, 200);
    eq(thumb.headers.get("content-type"), "image/webp");
    const m = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    ok(Math.max(m.width, m.height) <= 360, "thumb ≤ 360px");
  });

  await test("Bốn ảnh tải CÙNG LÚC đều thành công, mã khác nhau, sẵn sàng (ready)", async () => {
    const bufs = await Promise.all([1, 2, 3, 4].map((i) => jpeg(900 + i * 50, 700)));
    const results = await Promise.all(bufs.map((buf, i) => post(a, buf, { name: `song-song-${i}.jpg` })));
    for (const r of results) eq(r.status, 200);
    const ids = await Promise.all(results.map(async (r) => (await r.json()).id));
    eq(new Set(ids).size, 4);
    for (const id of ids) eq((await takenAt(id)).status, "ready");
  });

  await test("Ảnh hỏng (đúng magic bytes nhưng nội dung rác) → 415; không để lại tệp 'ready'", async () => {
    const bad = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
    const res = await post(a, bad);
    eq(res.status, 415, await res.text());
  });

  await test("PDF: nhận ở receipts, từ chối ở moments (ảnh); tệp rỗng 400; bucket lạ 400", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    const ok1 = await post(a, pdf, { bucket: "receipts", name: "hd.pdf", type: "application/pdf" });
    eq(ok1.status, 200);
    eq((await ok1.json()).mime, "application/pdf");
    eq((await post(a, pdf, { bucket: "moments", name: "hd.pdf", type: "application/pdf" })).status, 415);
    eq((await post(a, Buffer.alloc(0))).status, 400);
    eq((await post(a, await jpeg(100, 100), { bucket: "../etc" })).status, 400);
  });

  await test("Quyền xem tệp không đổi: người khác chưa được gắn vào thực thể thì không đọc được ảnh vừa tải (404)", async () => {
    const res = await post(a, await jpeg(300, 300));
    const id = (await res.json()).id;
    eq((await a.get(`/api/v1/files/${id}`)).status, 200);
    eq((await b.get(`/api/v1/files/${id}`)).status, 404);
  });
}
