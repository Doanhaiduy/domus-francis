// Kiểm thử TRANG CÔNG KHAI mở rộng: trang người ngoài xem được (200 không cần đăng nhập), sitemap/robots/RSS, hỏi đáp (CRUD + JSON-LD),
// đăng ký tìm hiểu (chống spam, giới hạn theo IP, phân quyền xử lý), bài viết (thẻ, hẹn giờ, lịch sử chỉnh sửa), album công khai
// (chỉ album.moderate bật được; ảnh album công khai phục vụ không cần đăng nhập, album khác 404), trang ủng hộ (bật/tắt).
// Dữ liệu thử dùng hậu tố thời gian; dọn lại sau khi chạy để không ảnh hưởng suite khác.
import sharp from "sharp";

export async function run({ as, test, eq, ok, section, BASE, Client }) {
  section("Trang công khai mở rộng (người ngoài, không cần đăng nhập)");

  const anon = await new Client("anon").init();
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: article.manage + application.review
  const media = await as("khoa.ngo@luuxa.local"); // Trưởng ban Truyền thông: article.manage (+ album.moderate)
  const member = await as("tuan.nguyen@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const suffix = Date.now().toString(36);
  const page = async (p) => {
    const res = await fetch(BASE + p, { redirect: "manual" });
    return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
  };

  // -------------------------------------------------------------- trang & SEO
  for (const p of ["/tin-tuc", "/gioi-thieu", "/lien-he", "/hoi-dap", "/thu-vien"]) {
    await test(`Chưa đăng nhập: GET ${p} → 200 (không chuyển hướng đăng nhập)`, async () => {
      const r = await page(p);
      eq(r.status, 200, p);
      ok(r.type.includes("text/html"), "phải là HTML");
    });
  }
  await test("/lien-he có biểu mẫu đăng ký (id=dang-ky)", async () => ok((await page("/lien-he")).text.includes('id="dang-ky"'), "thiếu #dang-ky"));
  await test("robots.txt chỉ cho lập chỉ mục trang công khai, có sitemap", async () => {
    const r = await page("/robots.txt");
    eq(r.status, 200);
    ok(/Allow: \/tin-tuc/.test(r.text) && /Disallow: \//.test(r.text) && /Sitemap: .*\/sitemap\.xml/.test(r.text), r.text);
  });
  await test("sitemap.xml liệt kê trang công khai, không lộ trang nội bộ", async () => {
    const r = await page("/sitemap.xml");
    eq(r.status, 200);
    ok(r.text.includes("/tin-tuc") && r.text.includes("/gioi-thieu") && r.text.includes("/lien-he"), "thiếu trang công khai");
    ok(!r.text.includes("/thu-chi") && !r.text.includes("/thanh-vien"), "không được lộ trang nội bộ");
  });
  await test("RSS /tin-tuc/rss.xml hợp lệ (RSS 2.0, tiếng Việt)", async () => {
    const r = await page("/tin-tuc/rss.xml");
    eq(r.status, 200);
    ok(r.type.includes("rss+xml") && r.text.includes('<rss version="2.0"') && r.text.includes("<language>vi</language>"), r.text.slice(0, 200));
  });
  await test("Ảnh chia sẻ mặc định /og-default.png tải được khi chưa đăng nhập", async () => {
    const res = await fetch(BASE + "/og-default.png");
    eq(res.status, 200);
    eq(res.headers.get("content-type"), "image/png");
  });
  await test("Trang ủng hộ khi chưa bật → không hiện thông tin chuyển khoản", async () => {
    const r = await page("/ung-ho");
    ok(!r.text.includes("Thông tin chuyển khoản"), "không được lộ tài khoản khi tắt");
  });

  // -------------------------------------------------------------- hỏi đáp
  const faqQ = `Chi phí ở một tháng là bao nhiêu? ${suffix}`;
  let faqId;
  await test("Hỏi đáp: chưa đăng nhập 401; thành viên thường 403; Trưởng nhà tạo được", async () => {
    eq((await anon.get("/api/v1/faqs")).status, 401);
    eq((await member.get("/api/v1/faqs")).status, 403);
    eq((await member.post("/api/v1/faqs", { question: faqQ, answer: "x y z" })).status, 403);
    const r = await head.post("/api/v1/faqs", { question: faqQ, answer: "Khoảng **500.000đ** mỗi tháng, gồm điện nước." });
    eq(r.status, 201, JSON.stringify(r.json));
    faqId = r.json.id;
    eq(r.json.isActive, true);
  });
  await test("Hỏi đáp: câu ngắn/trống bị từ chối (400)", async () => {
    eq((await head.post("/api/v1/faqs", { question: "ngắn", answer: "x y z" })).status, 400);
    eq((await head.post("/api/v1/faqs", { question: "Câu hỏi đủ dài chứ?", answer: "  " })).status, 400);
  });
  await test("/hoi-dap hiện câu hỏi + dữ liệu FAQPage (JSON-LD) cho người ngoài", async () => {
    const r = await page("/hoi-dap");
    ok(r.text.includes(faqQ), "thiếu câu hỏi");
    ok(r.text.includes("FAQPage"), "thiếu JSON-LD FAQPage");
  });
  await test("Ẩn câu hỏi → biến mất khỏi /hoi-dap; hiện lại → xuất hiện", async () => {
    eq((await head.patch(`/api/v1/faqs/${faqId}`, { isActive: false })).status, 200);
    ok(!(await page("/hoi-dap")).text.includes(faqQ), "câu đang ẩn vẫn hiện");
    eq((await head.patch(`/api/v1/faqs/${faqId}`, { isActive: true })).status, 200);
    ok((await page("/hoi-dap")).text.includes(faqQ), "câu hiện lại chưa xuất hiện");
  });
  await test("Thành viên thường không sửa/xóa được câu hỏi (403); Trưởng nhà xóa được", async () => {
    eq((await member.patch(`/api/v1/faqs/${faqId}`, { isActive: false })).status, 403);
    eq((await member.del(`/api/v1/faqs/${faqId}`)).status, 403);
    eq((await head.del(`/api/v1/faqs/${faqId}`)).status, 200);
    ok(!(await page("/hoi-dap")).text.includes(faqQ), "câu đã xóa vẫn hiện");
  });

  // -------------------------------------------------------------- đăng ký tìm hiểu
  const submit = (body, ip = "10.20.30.40", extra = {}) =>
    fetch(BASE + "/api/v1/public/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...extra },
      body: JSON.stringify({ startedAt: Date.now() - 10_000, ...body }),
    });
  const phone = `09${String(Date.now()).slice(-8)}`;
  let inquiryId;
  await test("Đăng ký tìm hiểu: người ngoài gửi được (không cần đăng nhập, không CSRF)", async () => {
    const res = await submit({ fullName: `Nguyễn Văn Thử ${suffix}`, phone, school: "Đại học Nha Trang", yearOfStudy: "Học sinh lớp 12", message: "Xin tư vấn." });
    eq(res.status, 200);
  });
  await test("Người có application.review thấy đơn mới; thành viên thường không (403)", async () => {
    eq((await member.get("/api/v1/inquiries")).status, 403);
    eq((await anon.get("/api/v1/inquiries")).status, 401);
    const r = await head.get("/api/v1/inquiries");
    eq(r.status, 200);
    const it = r.json.inquiries.find((x) => x.phone === phone);
    ok(it, "không thấy đơn vừa gửi");
    eq(it.status, "new");
    ok(r.json.newCount >= 1, "newCount phải ≥ 1");
    inquiryId = it.id;
  });
  await test("Gửi lại cùng số điện thoại trong 24 giờ → gộp, không tạo đơn trùng", async () => {
    eq((await submit({ fullName: "Người Khác", phone }, "10.20.30.41")).status, 200);
    const r = await head.get("/api/v1/inquiries");
    eq(r.json.inquiries.filter((x) => x.phone === phone).length, 1, "phải còn 1 đơn");
  });
  await test("Ô bẫy 'website' có nội dung / gửi quá nhanh → trả OK nhưng KHÔNG lưu", async () => {
    const p1 = `08${String(Date.now()).slice(-8)}`;
    const p2 = `07${String(Date.now()).slice(-8)}`;
    eq((await submit({ fullName: "Bot Spam", phone: p1, website: "http://spam.example" }, "10.20.30.50")).status, 200);
    eq((await submit({ fullName: "Bot Nhanh", phone: p2, startedAt: Date.now() }, "10.20.30.51")).status, 200);
    const r = await head.get("/api/v1/inquiries");
    ok(!r.json.inquiries.some((x) => x.phone === p1 || x.phone === p2), "đơn của người máy không được lưu");
  });
  await test("Thiếu cả SĐT lẫn email → 400; email sai → 400; họ tên quá ngắn → 400", async () => {
    eq((await submit({ fullName: "Không Liên Hệ" }, "10.20.30.60")).status, 400);
    eq((await submit({ fullName: "Sai Email", email: "khong-phai-email" }, "10.20.30.61")).status, 400);
    eq((await submit({ fullName: "A", phone: "0909111222" }, "10.20.30.62")).status, 400);
  });
  await test("Origin lạ → 403 (chống gửi chéo trang)", async () => {
    eq((await submit({ fullName: "Kẻ Gian", phone: "0909222333" }, "10.20.30.63", { origin: "http://evil.example" })).status, 403);
  });
  await test("Giới hạn theo IP: tối đa 3 đơn/giờ, đơn thứ 4 → 429", async () => {
    const ip = `10.99.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await submit({ fullName: `Người Gửi ${i} ${suffix}`, phone: `06${String(Date.now()).slice(-7)}${i}` }, ip)).status);
    eq(codes.join(","), "200,200,200,429");
  });
  await test("Trưởng nhà đổi trạng thái + ghi chú; ghi nhận người xử lý", async () => {
    eq((await member.patch(`/api/v1/inquiries/${inquiryId}`, { status: "contacted" })).status, 403);
    eq((await head.patch(`/api/v1/inquiries/${inquiryId}`, { status: "contacted", note: "Đã gọi, hẹn Chủ Nhật." })).status, 200);
    const it = (await head.get("/api/v1/inquiries")).json.inquiries.find((x) => x.id === inquiryId);
    eq(it.status, "contacted");
    eq(it.note, "Đã gọi, hẹn Chủ Nhật.");
    ok(it.handledByName && it.handledAt, "phải ghi nhận người xử lý");
  });
  await test("Trưởng nhà/Admin nhận thông báo khi có đăng ký mới", async () => {
    const n = await head.get("/api/v1/notifications");
    eq(n.status, 200);
    const items = n.json.items ?? n.json.notifications ?? n.json;
    ok(JSON.stringify(items).includes("đăng ký tìm hiểu"), "thiếu thông báo đăng ký tìm hiểu");
  });

  // -------------------------------------------------------------- bài viết: thẻ, hẹn giờ, lịch sử
  const slug = `thu-nghiem-${suffix}`;
  let artId;
  await test("Bài viết: thẻ được chuẩn hóa (chữ thường, bỏ trùng, tối đa 8)", async () => {
    const r = await media.post("/api/v1/articles", {
      title: `Bài thử nghiệm ${suffix}`,
      slug,
      summary: "Tóm tắt.",
      content: "Nội dung phiên bản một.",
      category: "tuyen-sinh",
      status: "published",
      tags: ["Tuyển Sinh", "tuyển sinh", "  Mùa Hè ", "a", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"],
    });
    eq(r.status, 201, JSON.stringify(r.json));
    artId = r.json.id;
    ok(r.json.tags.includes("tuyển sinh") && r.json.tags.includes("mùa hè"), JSON.stringify(r.json.tags));
    ok(!r.json.tags.includes("a"), "thẻ 1 ký tự phải bị bỏ");
    eq(new Set(r.json.tags).size, r.json.tags.length, "không trùng thẻ");
    ok(r.json.tags.length <= 8, "tối đa 8 thẻ");
  });
  await test("Lọc theo thẻ ở /tin-tuc?tag=… và hiện thẻ ở trang bài", async () => {
    const list = await page(`/tin-tuc?tag=${encodeURIComponent("mùa hè")}`);
    ok(list.text.includes(`Bài thử nghiệm ${suffix}`), "bài phải hiện khi lọc đúng thẻ");
    const other = await page(`/tin-tuc?tag=${encodeURIComponent("khong-co-the-nay")}`);
    ok(!other.text.includes(`Bài thử nghiệm ${suffix}`), "bài không được hiện với thẻ khác");
    const detail = await page(`/tin-tuc/${slug}`);
    ok(detail.text.includes(`/tin-tuc?tag=${encodeURIComponent("mùa hè")}`), "trang bài phải có liên kết thẻ");
  });
  await test("Hẹn giờ: bài hẹn tương lai KHÔNG hiện công khai; trang chi tiết → không tìm thấy", async () => {
    const future = new Date(Date.now() + 3 * 86400_000).toISOString();
    eq((await media.patch(`/api/v1/articles/${artId}`, { status: "published", publishedAt: future })).status, 200);
    ok(!(await page("/tin-tuc")).text.includes(`Bài thử nghiệm ${suffix}`), "bài hẹn giờ không được hiện ở danh sách");
    const d = await page(`/tin-tuc/${slug}`);
    ok(!d.text.includes("Nội dung phiên bản một."), "bài hẹn giờ không được mở bằng link");
    const sm = await page("/sitemap.xml");
    ok(!sm.text.includes(slug), "bài hẹn giờ không được vào sitemap");
    const rss = await page("/tin-tuc/rss.xml");
    ok(!rss.text.includes(slug), "bài hẹn giờ không được vào RSS");
    const manage = (await media.get("/api/v1/articles")).json.articles.find((a) => a.id === artId);
    ok(manage && new Date(manage.publishedAt).getTime() > Date.now(), "người quản lý vẫn thấy giờ hẹn");
  });
  await test("Đến giờ (chuyển hẹn về quá khứ) → bài hiện công khai + vào sitemap/RSS", async () => {
    eq((await media.patch(`/api/v1/articles/${artId}`, { status: "published", publishedAt: new Date(Date.now() - 60_000).toISOString() })).status, 200);
    ok((await page("/tin-tuc")).text.includes(`Bài thử nghiệm ${suffix}`), "bài phải hiện");
    ok((await page("/sitemap.xml")).text.includes(slug), "phải vào sitemap");
    ok((await page("/tin-tuc/rss.xml")).text.includes(slug), "phải vào RSS");
  });
  await test("Lịch sử chỉnh sửa: lưu bản cũ khi sửa nội dung; khôi phục lại được", async () => {
    eq((await media.patch(`/api/v1/articles/${artId}`, { content: "Nội dung phiên bản hai.", title: `Bài thử nghiệm ${suffix} (sửa)` })).status, 200);
    const revs = (await media.get(`/api/v1/articles/${artId}/revisions`)).json.revisions;
    ok(revs.length >= 1, "phải có bản cũ");
    const v1 = revs.find((r) => r.content === "Nội dung phiên bản một.");
    ok(v1, "không thấy bản một trong lịch sử");
    const r = await media.post(`/api/v1/articles/${artId}/revisions/${v1.id}`);
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.content, "Nội dung phiên bản một.");
    // bản hai được giữ lại thành một bản cũ mới
    const after = (await media.get(`/api/v1/articles/${artId}/revisions`)).json.revisions;
    ok(after.some((x) => x.content === "Nội dung phiên bản hai."), "bản vừa bị thay phải còn trong lịch sử");
  });
  await test("Lịch sử chỉnh sửa: thành viên thường không xem/khôi phục được (403/401)", async () => {
    eq((await member.get(`/api/v1/articles/${artId}/revisions`)).status, 403);
    eq((await anon.get(`/api/v1/articles/${artId}/revisions`)).status, 401);
    const revs = (await media.get(`/api/v1/articles/${artId}/revisions`)).json.revisions;
    eq((await member.post(`/api/v1/articles/${artId}/revisions/${revs[0].id}`)).status, 403);
  });
  await test("Khôi phục bản của bài KHÁC qua id lạ → 404 (không rò rỉ chéo bài)", async () => {
    eq((await media.post(`/api/v1/articles/${artId}/revisions/00000000-0000-4000-8000-000000000000`)).status, 404);
  });

  // -------------------------------------------------------------- album công khai
  const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 90, b: 40 } } }).jpeg().toBuffer();
  const upload = async (c) => {
    const form = new FormData();
    form.append("bucket", "moments");
    form.append("file", new Blob([jpg], { type: "image/jpeg" }), `thu-${suffix}.jpg`);
    const r = await c.req("POST", "/api/v1/files", undefined, { form });
    eq(r.status, 200, JSON.stringify(r.json));
    return r.json.id;
  };
  let albumId;
  let photoFile;
  await test("Album: tạo mặc định KHÔNG công khai; /thu-vien chưa có; ảnh 404 với người ngoài", async () => {
    const cats = (await media.get("/api/v1/moments")).json;
    const categoryId = cats.categories?.[0]?.id ?? (await media.get("/api/v1/lookups")).json?.momentCategories?.[0]?.id;
    ok(categoryId, "không lấy được chủ đề album");
    photoFile = await upload(media);
    const r = await media.post("/api/v1/moments", { title: `Album thử ${suffix}`, categoryId, takenOn: "2026-09-20", coverFileId: photoFile, photoFileIds: [] });
    eq(r.status, 201, JSON.stringify(r.json));
    albumId = r.json.id;
    eq(r.json.isPublic, false);
    ok(!(await page("/thu-vien")).text.includes(`Album thử ${suffix}`), "album riêng tư không được hiện");
    eq((await fetch(`${BASE}/api/v1/public/files/${photoFile}`)).status, 404);
    eq((await page(`/thu-vien/${albumId}`)).text.includes(`Album thử ${suffix}`), false, "trang album riêng tư không được mở");
  });
  await test("Chỉ người có album.moderate bật được 'công khai' (thành viên thường 403)", async () => {
    // tuan.nguyen không phải tác giả ⇒ 403 dù lý do nào; tác giả không có album.moderate cũng 403 (thử bằng bản thân qua tạo album riêng)
    eq((await member.patch(`/api/v1/moments/${albumId}`, { isPublic: true })).status, 403);
    const mine = await upload(member);
    const cats = (await member.get("/api/v1/moments")).json;
    const categoryId = cats.categories?.[0]?.id ?? (await member.get("/api/v1/lookups")).json?.momentCategories?.[0]?.id;
    const own = await member.post("/api/v1/moments", { title: `Album của tôi ${suffix}`, categoryId, takenOn: "2026-09-21", coverFileId: mine, photoFileIds: [] });
    eq(own.status, 201, JSON.stringify(own.json));
    eq((await member.patch(`/api/v1/moments/${own.json.id}`, { isPublic: true })).status, 403, "tác giả không có album.moderate");
    await member.del(`/api/v1/moments/${own.json.id}`);
  });
  await test("Bật công khai: /thu-vien + trang album + ảnh phục vụ không cần đăng nhập", async () => {
    const r = await media.patch(`/api/v1/moments/${albumId}`, { isPublic: true });
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.isPublic, true);
    ok((await page("/thu-vien")).text.includes(`Album thử ${suffix}`), "album công khai phải hiện");
    ok((await page(`/thu-vien/${albumId}`)).text.includes(`Album thử ${suffix}`), "trang album phải mở");
    const img = await fetch(`${BASE}/api/v1/public/files/${photoFile}`);
    eq(img.status, 200);
    ok((img.headers.get("content-type") ?? "").startsWith("image/"), "phải là ảnh");
    ok((await page("/sitemap.xml")).text.includes(`/thu-vien/${albumId}`), "album công khai phải vào sitemap");
  });
  await test("Ẩn album (hidden) → biến mất khỏi /thu-vien và ảnh trở lại 404", async () => {
    eq((await media.patch(`/api/v1/moments/${albumId}`, { hidden: true })).status, 200);
    ok(!(await page("/thu-vien")).text.includes(`Album thử ${suffix}`), "album ẩn không được hiện");
    eq((await fetch(`${BASE}/api/v1/public/files/${photoFile}`)).status, 404);
    eq((await media.patch(`/api/v1/moments/${albumId}`, { hidden: false })).status, 200);
  });
  await test("Tắt công khai → ảnh 404 trở lại", async () => {
    eq((await media.patch(`/api/v1/moments/${albumId}`, { isPublic: false })).status, 200);
    eq((await fetch(`${BASE}/api/v1/public/files/${photoFile}`)).status, 404);
  });

  // -------------------------------------------------------------- giới thiệu + ủng hộ (cấu hình)
  const setKeys = (c, changes) => c.patch("/api/v1/settings", { changes });
  await test("Giới thiệu: nội dung org.about hiện ở /gioi-thieu (Markdown)", async () => {
    const r = await setKeys(admin, [{ key: "org.about", value: `## Câu chuyện ${suffix}\nLưu xá được lập từ năm 1999.` }]);
    eq(r.status, 200, JSON.stringify(r.json));
    const g = await page("/gioi-thieu");
    ok(g.text.includes(`Câu chuyện ${suffix}`) && g.text.includes("1999"), "thiếu nội dung giới thiệu");
  });
  await test("Ủng hộ: bật + có tài khoản nhận quỹ → hiện thông tin chuyển khoản & mã QR; tắt → ẩn", async () => {
    const treasurer = await as("bao.pham@luuxa.local");
    const acc = { bankBin: "970436", bankName: "Vietcombank", accountNo: "0011223344", accountName: "LUU XA PHANXICO" };
    const put = await treasurer.req("PUT", "/api/v1/finance/receiving-account", acc);
    eq(put.status, 200, `lưu tài khoản nhận quỹ: ${JSON.stringify(put.json)}`);
    eq((await setKeys(admin, [{ key: "org.donation_enabled", value: true }, { key: "org.donation_note", value: `Cảm ơn bạn ${suffix}` }])).status, 200);
    const d = await page("/ung-ho");
    ok(d.text.includes("0011223344") && d.text.includes(`Cảm ơn bạn ${suffix}`), "phải hiện số tài khoản + lời nhắn");
    ok(d.text.includes("data:image/png;base64"), "phải có mã QR");
    eq((await setKeys(admin, [{ key: "org.donation_enabled", value: false }])).status, 200);
    ok(!(await page("/ung-ho")).text.includes("0011223344"), "tắt rồi không được lộ tài khoản");
    ok(!(await page("/sitemap.xml")).text.includes("/ung-ho"), "tắt rồi không vào sitemap");
  });
  await test("Chỉ người có setting.write sửa được giới thiệu/ủng hộ (thành viên 403)", async () => {
    const r = await setKeys(member, [{ key: "org.donation_enabled", value: true }]);
    ok(r.status === 403 || r.status === 400, `thành viên không được bật ủng hộ, nhận ${r.status}`);
  });

  // -------------------------------------------------------------- dọn dẹp
  await media.del(`/api/v1/articles/${artId}`);
  await media.del(`/api/v1/moments/${albumId}`);
  await setKeys(admin, [{ key: "org.about", value: "" }, { key: "org.donation_note", value: "" }]);
}
