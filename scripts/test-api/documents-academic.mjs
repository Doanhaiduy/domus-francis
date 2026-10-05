// Kiểm thử: Thư viện tài liệu phụng vụ (/api/v1/liturgy/documents) + Danh mục học tập (/api/v1/academic/config/**).
// Dữ liệu tạo trong suite mang hậu tố thời gian để chạy lại không đụng nhau; mục tạo ra được xóa ở cuối khi có thể.

export async function run({ as, test, eq, ok, section }) {
  const stamp = String(Date.now()).slice(-7);
  const code = (r) => r.json?.code ?? "";
  const detail = (r) => r.json?.detail ?? JSON.stringify(r.json);

  section("Tài liệu phụng vụ");
  const member = await as("tuan.nguyen@luuxa.local");
  const lead = await as("phong.dang@luuxa.local"); // Trưởng ban Phụng vụ
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà
  const admin = await as("viet.vu@luuxa.local");
  const DOCS = "/api/v1/liturgy/documents";

  let prayerId = null;
  let youtubeId = null;

  await test("Thành viên xem được thư viện tài liệu (200)", async () => {
    const r = await member.get(DOCS);
    eq(r.status, 200, detail(r));
    ok(Array.isArray(r.json.items), "thiếu items");
    eq(r.json.canManage, false, "thành viên không được quyền quản lý");
  });

  await test("Thành viên không thêm được tài liệu (403)", async () => {
    const r = await member.post(DOCS, { title: "Kinh thử", kind: "prayer", content: "Lạy Cha…" });
    eq(r.status, 403, detail(r));
  });

  await test("Trưởng ban Phụng vụ thêm kinh (201, giữ nguyên xuống dòng, thẻ gọn)", async () => {
    const r = await lead.post(DOCS, {
      title: `Kinh Lạy Cha thử nghiệm ${stamp}`,
      kind: "prayer",
      category: "Kinh hằng ngày",
      tags: ["kiểm thử", " Kiểm thử ", "căn bản"],
      content: "Lạy Cha chúng con ở trên trời,\nchúng con nguyện danh Cha cả sáng.",
      isPinned: true,
    });
    eq(r.status, 201, detail(r));
    prayerId = r.json.id;
    eq(r.json.kind, "prayer");
    ok(r.json.content.includes("\n"), "lời kinh phải giữ xuống dòng");
    eq(r.json.tags.length, 2, "thẻ trùng (khác hoa/thường) phải bị gộp");
    eq(r.json.isPinned, true);
  });

  await test("Tìm không dấu: 'lay cha thu nghiem' thấy kinh vừa thêm (thành viên)", async () => {
    const r = await member.get(`${DOCS}?q=${encodeURIComponent(`lay cha thu nghiem ${stamp}`)}`);
    eq(r.status, 200, detail(r));
    ok(r.json.items.some((d) => d.id === prayerId), "không tìm thấy bằng từ khóa không dấu");
    const r2 = await member.get(`${DOCS}?kind=prayer&category=${encodeURIComponent("Kinh hằng ngày")}`);
    ok(r2.json.items.some((d) => d.id === prayerId), "lọc theo loại + chuyên mục phải thấy");
  });

  await test("Thành viên xem chi tiết tài liệu (lời văn đầy đủ)", async () => {
    const r = await member.get(`${DOCS}/${prayerId}`);
    eq(r.status, 200, detail(r));
    ok(r.json.content.startsWith("Lạy Cha"), "thiếu nội dung");
  });

  await test("Trưởng ban Phụng vụ thêm liên kết YouTube (201, suy được mã video)", async () => {
    const r = await lead.post(DOCS, { title: `Video tập hát ${stamp}`, kind: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s" });
    eq(r.status, 201, detail(r));
    youtubeId = r.json.id;
    eq(r.json.youtubeId, "dQw4w9WgXcQ");
  });

  await test("Link YouTube dạng tìm kiếm hợp lệ, không có mã video", async () => {
    const r = await lead.post(DOCS, { title: `Tìm thánh ca ${stamp}`, kind: "youtube", url: "https://www.youtube.com/results?search_query=th%C3%A1nh+ca" });
    eq(r.status, 201, detail(r));
    eq(r.json.youtubeId, null);
    await lead.del(`${DOCS}/${r.json.id}`);
  });

  await test("URL YouTube sai miền / không phải http(s) bị từ chối (400/422)", async () => {
    for (const url of ["https://vimeo.com/123456", "https://youtube.com.evil.example/watch?v=x", "javascript:alert(1)"]) {
      const r = await lead.post(DOCS, { title: "Video lạ", kind: "youtube", url });
      ok([400, 422].includes(r.status), `${url} → ${r.status} ${detail(r)}`);
    }
  });

  await test("Tài liệu PDF thiếu tệp bị từ chối (400/422)", async () => {
    const r = await lead.post(DOCS, { title: "Lịch tháng", kind: "pdf" });
    ok([400, 422].includes(r.status), `${r.status} ${detail(r)}`);
  });

  await test("Tải PDF lên bucket documents → tài liệu PDF → thành viên mở được tệp", async () => {
    const pdf = Buffer.from("%PDF-1.4\n% tai lieu thu nghiem\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
    const form = new FormData();
    form.append("bucket", "documents");
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "lich-thu-nghiem.pdf");
    const up = await lead.req("POST", "/api/v1/files", undefined, { form });
    eq(up.status, 200, detail(up));
    eq(up.json.mime, "application/pdf");
    const r = await lead.post(DOCS, { title: `Lịch PDF ${stamp}`, kind: "pdf", fileId: up.json.id, category: "Lịch phụng vụ" });
    eq(r.status, 201, detail(r));
    eq(r.json.fileId, up.json.id);
    const res = await member.get(`/api/v1/files/${up.json.id}`, { raw: true });
    eq(res.status, 200, "thành viên phải mở được PDF của tài liệu");
    ok((res.headers.get("content-type") ?? "").includes("application/pdf"), "content-type phải là PDF");
    const del = await lead.del(`${DOCS}/${r.json.id}`);
    eq(del.status, 200);
  });

  await test("Ảnh không dùng được cho loại PDF (422)", async () => {
    // tệp PNG 1×1 hợp lệ
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const form = new FormData();
    form.append("bucket", "documents");
    form.append("file", new Blob([png], { type: "image/png" }), "anh.png");
    const up = await lead.req("POST", "/api/v1/files", undefined, { form });
    eq(up.status, 200, detail(up));
    const r = await lead.post(DOCS, { title: "PDF mà là ảnh", kind: "pdf", fileId: up.json.id });
    ok([400, 422].includes(r.status), `${r.status} ${detail(r)}`);
  });

  await test("Sửa với version cũ ⇒ 409; thành viên không xóa được (403)", async () => {
    const cur = await lead.get(`${DOCS}/${youtubeId}`);
    const ok1 = await lead.patch(`${DOCS}/${youtubeId}`, { isPinned: true, version: cur.json.version });
    eq(ok1.status, 200, detail(ok1));
    const stale = await lead.patch(`${DOCS}/${youtubeId}`, { title: "Ghi đè", version: cur.json.version });
    eq(stale.status, 409, detail(stale));
    eq(code(stale), "STALE_VERSION");
    eq((await member.del(`${DOCS}/${youtubeId}`)).status, 403);
  });

  await test("Xóa mềm ⇒ biến mất khỏi danh sách và chi tiết (404)", async () => {
    const d = await lead.del(`${DOCS}/${prayerId}`);
    eq(d.status, 200, detail(d));
    const r = await member.get(`${DOCS}?q=${encodeURIComponent(`lay cha thu nghiem ${stamp}`)}`);
    ok(!r.json.items.some((x) => x.id === prayerId), "tài liệu đã xóa vẫn hiện");
    eq((await member.get(`${DOCS}/${prayerId}`)).status, 404);
    eq((await lead.del(`${DOCS}/${youtubeId}`)).status, 200);
  });

  // -------------------------------------------------------------------
  section("Danh mục học tập (trường, năm học, học kỳ, nhiệm kỳ)");
  const CFG = "/api/v1/academic/config";
  const uniCode = `TEST_${stamp}`;
  let uniId = null;

  await test("Thành viên xem danh mục ở chế độ chỉ đọc", async () => {
    const r = await member.get(CFG);
    eq(r.status, 200, detail(r));
    eq(r.json.permissions.universities, false);
    eq(r.json.permissions.terms, false);
    ok(r.json.years.length >= 2 && r.json.years.some((y) => y.isCurrent), "phải thấy năm học + năm hiện hành");
    ok(r.json.universities.every((u) => u.usage === null), "thành viên không thấy mức sử dụng");
  });

  await test("Thành viên thường không thêm được trường (403)", async () => {
    const r = await member.post(`${CFG}/universities`, { code: "HACK_U", name: "Trường giả" });
    eq(r.status, 403, detail(r));
  });

  await test("Admin thêm trường mới ⇒ /api/v1/academic/meta thấy trường đó", async () => {
    const r = await admin.post(`${CFG}/universities`, { code: uniCode.toLowerCase(), name: `Trường thử nghiệm ${stamp}`, shortName: "TN", city: "Hà Nội" });
    eq(r.status, 201, detail(r));
    uniId = r.json.id;
    eq(r.json.code, uniCode, "mã phải được viết hoa");
    const meta = await member.get("/api/v1/academic/meta");
    eq(meta.status, 200, detail(meta));
    ok(meta.json.universities.some((u) => u.id === uniId), "trường mới chưa có trong danh sách chọn của biểu mẫu bảng điểm");
  });

  await test("Trùng mã trường ⇒ 409", async () => {
    const r = await admin.post(`${CFG}/universities`, { code: uniCode, name: "Trùng mã" });
    eq(r.status, 409, detail(r));
  });

  await test("Xóa trường đang có sinh viên/bảng điểm (HUST) ⇒ 409, gợi ý tạm ẩn", async () => {
    const cfg = await admin.get(CFG);
    const hust = cfg.json.universities.find((u) => u.code === "HUST");
    ok(hust && hust.usage > 0, "HUST phải đang được dùng");
    const r = await admin.del(`${CFG}/universities/${hust.id}`);
    eq(r.status, 409, detail(r));
  });

  await test("Tạm ẩn rồi xóa mềm trường thử nghiệm ⇒ biến mất khỏi meta", async () => {
    const h = await admin.patch(`${CFG}/universities/${uniId}`, { isActive: false });
    eq(h.status, 200, detail(h));
    eq(h.json.isActive, false);
    const d = await admin.del(`${CFG}/universities/${uniId}`);
    eq(d.status, 200, detail(d));
    const meta = await member.get("/api/v1/academic/meta");
    ok(!meta.json.universities.some((u) => u.id === uniId), "trường đã xóa vẫn hiện trong meta");
  });

  await test("Tạo năm học chồng lấn năm hiện có ⇒ 409/422", async () => {
    const r = await head.post(`${CFG}/years`, { code: "2088-2089", name: "Năm học chồng lấn", startsOn: "2026-10-01", endsOn: "2027-09-30" });
    ok([409, 422].includes(r.status), `${r.status} ${detail(r)}`);
  });

  await test("Mã năm học sai dạng ⇒ 400", async () => {
    const r = await head.post(`${CFG}/years`, { code: "2091-2095", name: "Sai mã", startsOn: "2091-09-01", endsOn: "2092-08-31" });
    eq(r.status, 400, detail(r));
  });

  await test("Trưởng nhà tạo năm học kèm 3 học kỳ, thêm nhiệm kỳ, rồi xóa", async () => {
    const r = await head.post(`${CFG}/years`, {
      code: "2091-2092",
      name: "Năm học 2091 – 2092",
      startsOn: "2091-09-01",
      endsOn: "2092-08-31",
      semesters: [
        { code: "HK1", startsOn: "2091-09-01", endsOn: "2092-01-31" },
        { code: "HK2", startsOn: "2092-02-01", endsOn: "2092-06-30" },
        { code: "HE", startsOn: "2092-07-01", endsOn: "2092-08-31" },
      ],
    });
    eq(r.status, 201, detail(r));
    eq(r.json.semesters.length, 3);
    eq(r.json.isCurrent, false);
    const yearId = r.json.id;
    // học kỳ ngoài năm học
    const bad = await head.patch(`${CFG}/semesters/${r.json.semesters[2].id}`, { endsOn: "2092-09-30" });
    ok([400, 422].includes(bad.status), `học kỳ ngoài năm học → ${bad.status} ${detail(bad)}`);
    // nhiệm kỳ gắn năm học ⇒ năm học không xóa được
    const t = await head.post(`${CFG}/board-terms`, { name: "Nhiệm kỳ 2091 – 2092", academicYearId: yearId, startsOn: "2091-09-01", endsOn: "2092-08-31" });
    eq(t.status, 201, detail(t));
    eq(t.json.status, "planned");
    const blocked = await head.del(`${CFG}/years/${yearId}`);
    eq(blocked.status, 409, `năm học có nhiệm kỳ phải bị chặn: ${detail(blocked)}`);
    eq((await head.del(`${CFG}/board-terms/${t.json.id}`)).status, 200);
    const del = await head.del(`${CFG}/years/${yearId}`);
    eq(del.status, 200, detail(del));
    const cfg = await head.get(CFG);
    ok(!cfg.json.years.some((y) => y.id === yearId), "năm học đã xóa vẫn còn");
  });

  await test("Xóa năm học đã có bảng điểm ⇒ 409 (thông điệp tiếng Việt)", async () => {
    const cfg = await head.get(CFG);
    const y = cfg.json.years.find((x) => x.code === "2025-2026");
    ok(y, "thiếu năm học 2025-2026");
    const r = await head.del(`${CFG}/years/${y.id}`);
    eq(r.status, 409, detail(r));
    ok(/không xóa được/.test(detail(r)), detail(r));
  });

  await test("Thành viên không sửa được năm học (403)", async () => {
    const cfg = await member.get(CFG);
    const r = await member.patch(`${CFG}/years/${cfg.json.years[0].id}`, { name: "Hack" });
    eq(r.status, 403, detail(r));
  });
}
