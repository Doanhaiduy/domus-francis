// Kiểm thử GÓI J — trang công khai mở rộng (đợt 2):
//   • Lối vào: khách vào "/" ⇒ 307 /gioi-thieu; thành viên ⇒ ứng dụng; hết access token nhưng còn phiên ⇒ vẫn đi luồng làm mới phiên;
//     đăng xuất ⇒ "/" lại về trang giới thiệu.
//   • /vao-o: 200, canonical, JSON-LD (HowTo + Organization), số liệu chung (quỹ, điện nước, chỗ trống bật/tắt), không lộ tên ai nợ.
//   • SEO: canonical các trang, noindex khi tìm kiếm/lọc thẻ, BreadcrumbList ở bài viết, tiêu đề có "Nha Trang", robots cho phép ảnh.
//   • Ủng hộ: QR có nội dung chuyển khoản; báo ủng hộ công khai ⇒ khoản chờ xác nhận + thông báo Thủ quỹ; ô bẫy / gửi quá nhanh ⇒ giả
//     thành công không ghi; giới hạn 3 lần/giờ/IP; gộp trùng; trang tắt ⇒ 404; minh bạch (bật/tắt, chỉ số tổng).
//   • Khởi tạo: mục số dư đầu kỳ (túi quỹ trống ⇒ chưa xong), nhóm "Vận hành hệ thống" chỉ Admin thấy.
//   • Tiêu đề bảo mật: CSP-Report-Only ở trang, nosniff/Referrer-Policy/X-Frame-Options ở API; /api/v1/public/csp-report ghi error_events.
// Dữ liệu thử dùng hậu tố thời gian; cấu hình đổi trong bộ được khôi phục; khoản ủng hộ thử bị xóa khi xong.
import pg from "pg";
import QRCode from "qrcode";

export async function run({ as, test, eq, ok, section, BASE, Client, pgConfig }) {
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const getSetting = async (key) => (await sql("SELECT value FROM settings WHERE key = $1", [key])).rows[0]?.value;
  const setSetting = (key, value) => sql("UPDATE settings SET value = $2::jsonb WHERE key = $1", [key, JSON.stringify(value)]);
  const page = async (p, headers = {}) => {
    const res = await fetch(BASE + p, { redirect: "manual", headers });
    return { status: res.status, headers: res.headers, location: res.headers.get("location") ?? "", text: await res.text() };
  };
  const suffix = Date.now().toString(36);
  const ip = () => `10.${77 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  // ================================================================ lối vào
  section("Gói J — lối vào công khai & luồng phiên");
  await test("Khách (không cookie) vào / → 307 tới /gioi-thieu", async () => {
    const r = await page("/");
    eq(r.status, 307);
    eq(new URL(r.location, BASE).pathname, "/gioi-thieu");
  });
  await test("Khách vào trang nội bộ (/thu-chi) vẫn đi luồng làm mới phiên như cũ", async () => {
    const r = await page("/thu-chi");
    eq(r.status, 307);
    ok(r.location.includes("/api/v1/auth/refresh"), r.location);
  });
  await test("Thành viên đã đăng nhập vào / → 200 (Tổng quan) + đặt dấu phiên luuxa_hs", async () => {
    const c = await as("tuan.nguyen@luuxa.local");
    const r = await c.get("/", { raw: true });
    eq(r.status, 200);
    ok(c.jar.get("luuxa_hs"), "phải đặt cookie dấu phiên");
  });
  await test("Hết access token nhưng còn phiên (có dấu + refresh token) → / đi luồng làm mới rồi quay lại /", async () => {
    const c = await as("hieu.bui@luuxa.local");
    await c.get("/", { raw: true });
    c.jar.delete("luuxa_at"); // giả lập access token đã hết hạn (cookie 15 phút tự mất)
    const r1 = await c.get("/", { raw: true });
    eq(r1.status, 307);
    ok((r1.headers.get("location") || "").includes("/api/v1/auth/refresh?next=%2F"), r1.headers.get("location"));
    const r2 = await c.get(new URL(r1.headers.get("location"), BASE).pathname + new URL(r1.headers.get("location"), BASE).search, { raw: true });
    eq(r2.status, 307);
    eq(new URL(r2.headers.get("location"), BASE).pathname, "/", "làm mới xong phải quay lại /");
    ok(c.jar.get("luuxa_at"), "phải có access token mới");
    eq((await c.get("/", { raw: true })).status, 200);
  });
  await test("Đăng xuất xóa dấu phiên → / lại chuyển về /gioi-thieu", async () => {
    const c = await as("kiet.do@luuxa.local");
    await c.get("/", { raw: true });
    ok(c.jar.get("luuxa_hs"), "phải có dấu phiên trước khi đăng xuất");
    eq((await c.post("/api/v1/auth/logout")).status, 200);
    ok(!c.jar.get("luuxa_hs"), "đăng xuất phải xóa dấu phiên");
    const r = await c.get("/", { raw: true });
    eq(r.status, 307);
    eq(new URL(r.headers.get("location"), BASE).pathname, "/gioi-thieu");
  });
  await test("Dấu phiên còn mà không còn cookie phiên nào → yêu cầu tới /api/v1/auth xóa dấu", async () => {
    const c = new Client("stale");
    c.jar.set("luuxa_hs", "20260101");
    await c.get("/api/v1/auth/me", { raw: true });
    ok(!c.jar.get("luuxa_hs"), "dấu phiên cũ phải bị xóa");
  });

  // ================================================================ /vao-o
  section("Gói J — trang Vào ở lưu xá (/vao-o)");
  const prevShowVac = await getSetting("org.show_vacancies");
  try {
    await setSetting("org.show_vacancies", true);
    await test("/vao-o 200 khi chưa đăng nhập, có canonical + JSON-LD (HowTo, Organization) + tiêu đề có Nha Trang", async () => {
      const r = await page("/vao-o");
      eq(r.status, 200);
      ok(/<link rel="canonical" href="[^"]*\/vao-o"/.test(r.text), "thiếu canonical");
      ok(r.text.includes('"@type":"HowTo"') && r.text.includes('"@type":"Organization"'), "thiếu JSON-LD HowTo/Organization");
      ok(/<title>[^<]*Nha Trang[^<]*<\/title>/.test(r.text), "tiêu đề phải có Nha Trang");
      ok(r.text.includes('id="cac-buoc"') && r.text.includes('id="chi-phi"') && r.text.includes('id="nhip-sinh-hoat"'), "thiếu các mục chính");
    });
    await test("/vao-o hiện mức quỹ theo cấu hình + chỗ trống tính từ phòng và người đang ở", async () => {
      const dues = Number(await getSetting("finance.dues_cycle_amount_vnd"));
      const months = Number(await getSetting("finance.dues_cycle_months"));
      const { cap, res } = (
        await sql(`SELECT (SELECT COALESCE(sum(capacity), 0) FROM rooms WHERE room_type = 'bedroom' AND status = 'active' AND deleted_at IS NULL)::int AS cap,
                          (SELECT count(DISTINCT ra.member_id) FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id AND r.room_type = 'bedroom' AND r.status = 'active' AND r.deleted_at IS NULL
                            WHERE ra.starts_on <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (ra.ends_on IS NULL OR ra.ends_on >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::int AS res`)
      ).rows[0];
      const r = await page("/vao-o");
      ok(r.text.includes(`${dues.toLocaleString("vi-VN")}đ / ${months} tháng`), `thiếu mức quỹ ${dues}/${months}`);
      const free = Math.max(0, cap - res);
      ok(r.text.includes(free > 0 ? `Còn ${free} chỗ` : "Tạm đủ người"), `chỗ trống phải khớp (${cap} − ${res})`);
    });
    await test("Tắt org.show_vacancies → /vao-o không hiện chỗ trống", async () => {
      await setSetting("org.show_vacancies", false);
      const r = await page("/vao-o");
      ok(!/Còn \d+ chỗ|Tạm đủ người/.test(r.text), "không được hiện chỗ trống khi tắt");
    });
    await test("/vao-o KHÔNG lộ tên thành viên (kể cả người còn nợ quỹ)", async () => {
      const names = (
        await sql(`SELECT DISTINCT m.full_name, m.display_name FROM members m
                    WHERE m.deleted_at IS NULL AND (m.status = 'active' OR EXISTS (SELECT 1 FROM contributions c WHERE c.member_id = m.id AND c.paid_vnd < c.amount_due_vnd - c.discount_vnd))`)
      ).rows.flatMap((x) => [x.full_name, x.display_name]).filter((n) => n && n.length >= 6);
      const r = await page("/vao-o");
      const leaked = names.filter((n) => r.text.includes(n));
      eq(leaked.length, 0, `lộ tên: ${leaked.join(", ")}`);
    });
  } finally {
    await setSetting("org.show_vacancies", prevShowVac ?? true);
  }

  // ================================================================ SEO
  section("Gói J — SEO (canonical, noindex, JSON-LD, robots, sitemap)");
  for (const p of ["/gioi-thieu", "/hoi-dap", "/lien-he", "/thu-vien", "/tin-tuc"]) {
    await test(`${p} có canonical trỏ chính nó + JSON-LD Organization`, async () => {
      const r = await page(p);
      eq(r.status, 200);
      ok(new RegExp(`<link rel="canonical" href="[^"]*${p.replace("/", "\\/")}"`).test(r.text), "thiếu canonical tự trỏ");
      ok(r.text.includes('"@type":"Organization"'), "thiếu JSON-LD Organization");
      ok(!/<meta name="robots" content="noindex/.test(r.text), "trang chính không được noindex");
    });
  }
  await test("/gioi-thieu: tiêu đề có “lưu xá sinh viên Công giáo Nha Trang”", async () => {
    const r = await page("/gioi-thieu");
    ok(/<title>[^<]*lưu xá sinh viên Công giáo Nha Trang[^<]*<\/title>/.test(r.text), r.text.match(/<title>[^<]*<\/title>/)?.[0]);
  });
  await test("/tin-tuc?q=… và /tin-tuc?tag=… → noindex (vẫn follow), không canonical", async () => {
    for (const q of [`/tin-tuc?q=${encodeURIComponent("tuyển sinh")}`, `/tin-tuc?tag=${encodeURIComponent("mùa hè")}`]) {
      const r = await page(q);
      eq(r.status, 200, q);
      ok(/<meta name="robots" content="noindex, ?follow"/.test(r.text), `${q} phải noindex`);
      ok(!/<link rel="canonical"/.test(r.text), `${q} không đặt canonical`);
    }
  });
  await test("Chuyên mục /tin-tuc?muc=… → canonical giữ tham số chuyên mục", async () => {
    const r = await page("/tin-tuc?muc=tuyen-sinh");
    ok(/<link rel="canonical" href="[^"]*\/tin-tuc\?muc=tuyen-sinh"/.test(r.text), "canonical chuyên mục");
  });
  const media = await as("khoa.ngo@luuxa.local");
  const slug = `bai-thu-seo-${suffix}`;
  let artId;
  await test("Bài viết có BreadcrumbList + Article (JSON-LD) + canonical", async () => {
    const c = await media.post("/api/v1/articles", { title: `Bài thử SEO ${suffix}`, slug, summary: "Tóm tắt.", content: "Nội dung thử.", category: "tuyen-sinh", status: "published" });
    eq(c.status, 201, JSON.stringify(c.json));
    artId = c.json.id;
    const r = await page(`/tin-tuc/${slug}`);
    eq(r.status, 200);
    ok(r.text.includes('"@type":"BreadcrumbList"') && r.text.includes('"@type":"Article"'), "thiếu BreadcrumbList/Article");
    ok(new RegExp(`<link rel="canonical" href="[^"]*/tin-tuc/${slug}"`).test(r.text), "thiếu canonical");
  });
  if (artId) await media.del(`/api/v1/articles/${artId}`);
  await test("robots.txt: cho phép ảnh công khai, ảnh chia sẻ, trang /vao-o và trang gốc; vẫn chặn phần còn lại", async () => {
    const r = await page("/robots.txt");
    eq(r.status, 200);
    for (const s of ["Allow: /api/v1/public/files/", "Allow: /og-default.png", "Allow: /vao-o", "Allow: /$", "Disallow: /"]) ok(r.text.includes(s), `robots thiếu "${s}"\n${r.text}`);
  });
  await test("sitemap.xml có /vao-o và /gioi-thieu", async () => {
    const r = await page("/sitemap.xml");
    ok(r.text.includes("/vao-o") && r.text.includes("/gioi-thieu"), "thiếu trang");
  });
  await test("Đầu trang công khai: logo trỏ /gioi-thieu; có mục “Vào ở”; thanh “Đăng ký tìm hiểu” cho điện thoại (không ở /lien-he)", async () => {
    const g = await page("/gioi-thieu");
    ok(/<a[^>]+href="\/gioi-thieu"[^>]*aria-label="[^"]*trang giới thiệu"/.test(g.text) || /aria-label="[^"]*trang giới thiệu"[^>]*href="\/gioi-thieu"/.test(g.text), "logo phải trỏ /gioi-thieu");
    ok(g.text.includes('href="/vao-o"'), "thiếu mục Vào ở");
    ok(g.text.includes('aria-label="Đăng ký tìm hiểu"'), "thiếu thanh đăng ký trên điện thoại");
    ok(!(await page("/lien-he")).text.includes('aria-label="Đăng ký tìm hiểu"'), "trang /lien-he không cần thanh này");
  });
  await test("Câu hỏi mẫu (db/data 2026-10-12-55) có sẵn dạng NHÁP, không hiện ở /hoi-dap", async () => {
    const n = (await sql("SELECT count(*)::int AS n FROM public_faqs WHERE question = 'Ở lưu xá mỗi tháng tốn khoảng bao nhiêu?'")).rows[0].n;
    eq(n, 1, "phải có đúng 1 câu mẫu");
    const active = (await sql("SELECT is_active FROM public_faqs WHERE question = 'Ở lưu xá mỗi tháng tốn khoảng bao nhiêu?'")).rows[0].is_active;
    if (!active) ok(!(await page("/hoi-dap")).text.includes("Ở lưu xá mỗi tháng tốn khoảng bao nhiêu?"), "câu nháp không được hiện");
  });

  // ================================================================ ủng hộ
  section("Gói J — ủng hộ: QR có nội dung, báo ủng hộ công khai, minh bạch");
  const keys = ["org.donation_enabled", "org.donation_note", "org.donation_transparency", "finance.receiving_account"];
  const prev = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await getSetting(k)])));
  const acc = { bankBin: "970436", bankName: "Vietcombank", accountNo: "0011223344", accountName: "LUU XA PHANXICO", qrFileId: null };
  const created = [];
  const submit = (body, fromIp, extra = {}) =>
    fetch(BASE + "/api/v1/public/donations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": fromIp, ...extra },
      body: JSON.stringify({ startedAt: Date.now() - 10_000, donatedOn: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), ...body }),
    });
  const findDonation = async (name) => (await sql("SELECT * FROM donations WHERE donor_name = $1 ORDER BY created_at DESC", [name])).rows;
  try {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'donation-public:%'");
    await setSetting("finance.receiving_account", acc);
    await setSetting("org.donation_enabled", true);
    await setSetting("org.donation_transparency", false);

    await test("/ung-ho: QR VietQR có NỘI DUNG chuyển khoản mặc định (UNG HO LUU XA) + ô sao chép nội dung + nút chọn số tiền", async () => {
      const r = await page("/ung-ho");
      eq(r.status, 200);
      ok(r.text.includes("UNG HO LUU XA"), "thiếu nội dung chuyển khoản");
      ok(/<link rel="canonical" href="[^"]*\/ung-ho"/.test(r.text), "thiếu canonical");
      ok(r.text.includes("Chọn nhanh số tiền"), "thiếu nút chọn nhanh số tiền");
      // Dựng lại đúng chuỗi VietQR (EMVCo) có trường 62.08 = nội dung ⇒ ảnh QR phải trùng từng byte với ảnh trên trang
      const tlv = (id, v) => `${id}${String(v.length).padStart(2, "0")}${v}`;
      const crc = (t) => {
        let c = 0xffff;
        for (const b of new TextEncoder().encode(t)) {
          c ^= b << 8;
          for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
        }
        return c.toString(16).toUpperCase().padStart(4, "0");
      };
      const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", acc.bankBin) + tlv("01", acc.accountNo)) + tlv("02", "QRIBFTTA");
      let payload = tlv("00", "01") + tlv("01", "11") + tlv("38", merchant) + tlv("53", "704") + tlv("58", "VN") + tlv("62", tlv("08", "UNG HO LUU XA")) + "6304";
      payload += crc(payload);
      const expected = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#111827", light: "#ffffff" } });
      ok(r.text.includes(expected), "ảnh QR trên trang phải mã hóa đúng tài khoản + nội dung chuyển khoản");
    });

    const name = `Gia đình Thử Ủng Hộ ${suffix}`;
    let donationId;
    await test("Người ngoài báo đã ủng hộ → 200; tạo khoản CHỜ xác nhận (người ngoài, chưa vào sổ), lời nhắn + liên hệ ghi kèm", async () => {
      const res = await submit({ donorName: name, amountVnd: 250_000, message: "Chúc các em học tốt", contact: "0905 000 111" }, ip());
      eq(res.status, 200, await res.text());
      const rows = await findDonation(name);
      eq(rows.length, 1, "phải có đúng 1 khoản");
      const d = rows[0];
      donationId = d.id;
      created.push(d.id);
      eq(d.status, "pending");
      eq(d.donor_member_id, null);
      eq(d.self_reported, true);
      eq(d.ledger_entry_id, null, "chưa được vào sổ quỹ");
      eq(Number(d.amount_vnd), 250000);
      ok(d.note.includes("Chúc các em học tốt") && d.note.includes("0905 000 111") && d.note.includes("trang Ủng hộ công khai"), d.note);
    });
    await test("Thủ quỹ nhận thông báo (finance.donation_pending, link /thu-chi?tab=ung-ho) + thấy khoản trong danh sách ủng hộ", async () => {
      const n = (
        await sql(`SELECT n.payload FROM notifications n JOIN members m ON m.id = n.member_id JOIN users u ON u.id = m.user_id
                    WHERE u.email = 'bao.pham@luuxa.local' AND n.type_code = 'finance.donation_pending' AND n.entity_id = $1`, [donationId])
      ).rows;
      eq(n.length, 1, "Thủ quỹ phải có 1 thông báo");
      eq(n[0].payload?.link, "/thu-chi?tab=ung-ho");
      const treasurer = await as("bao.pham@luuxa.local");
      const list = await treasurer.get("/api/v1/donations?status=pending");
      eq(list.status, 200, JSON.stringify(list.json));
      const it = list.json.items.find((x) => x.id === donationId);
      ok(it && it.isMember === false && it.selfReported === true, "Thủ quỹ phải thấy khoản người ngoài đang chờ");
    });
    await test("Gửi lại cùng tên + số tiền + ngày trong 24 giờ → gộp, không tạo khoản trùng", async () => {
      eq((await submit({ donorName: name, amountVnd: 250_000 }, ip())).status, 200);
      eq((await findDonation(name)).length, 1);
    });
    await test("Ẩn danh → ghi “Ẩn danh”; tên bị bỏ qua", async () => {
      const amount = 1000 + Math.floor(Math.random() * 8999);
      eq((await submit({ donorName: "Tên Không Được Ghi", anonymous: true, amountVnd: amount }, ip())).status, 200);
      const rows = (await sql("SELECT id, donor_name FROM donations WHERE amount_vnd = $1 AND self_reported AND donor_member_id IS NULL AND created_at > now() - interval '1 minute'", [amount])).rows;
      eq(rows.length, 1);
      eq(rows[0].donor_name, "Ẩn danh");
      created.push(rows[0].id);
    });
    await test("Ô bẫy “website” có nội dung / gửi quá nhanh → trả OK nhưng KHÔNG ghi", async () => {
      const botA = `Người Máy A ${suffix}`;
      const botB = `Người Máy B ${suffix}`;
      eq((await submit({ donorName: botA, amountVnd: 50_000, website: "http://spam.example" }, ip())).status, 200);
      eq((await submit({ donorName: botB, amountVnd: 50_000, startedAt: Date.now() }, ip())).status, 200);
      eq((await findDonation(botA)).length + (await findDonation(botB)).length, 0, "không được ghi khoản của người máy");
    });
    await test("Dữ liệu sai: số tiền < 1.000đ → 400; ngày tương lai → 422; Origin lạ → 403", async () => {
      eq((await submit({ donorName: "Sai Số Tiền", amountVnd: 500 }, ip())).status, 400);
      eq((await submit({ donorName: "Sai Ngày", amountVnd: 10_000, donatedOn: "2099-01-01" }, ip())).status, 422);
      eq((await submit({ donorName: "Kẻ Gian", amountVnd: 10_000 }, ip(), { origin: "http://evil.example" })).status, 403);
    });
    await test("Giới hạn theo IP: tối đa 3 lần báo/giờ, lần thứ 4 → 429", async () => {
      const from = ip();
      const codes = [];
      for (let i = 0; i < 4; i++) {
        const res = await submit({ donorName: `Người Gửi Nhiều ${i} ${suffix}`, amountVnd: 10_000 + i }, from);
        codes.push(res.status);
      }
      eq(codes.join(","), "200,200,200,429");
      for (let i = 0; i < 3; i++) created.push(...(await findDonation(`Người Gửi Nhiều ${i} ${suffix}`)).map((d) => d.id));
    });

    await test("Minh bạch TẮT (mặc định) → /ung-ho không có khối minh bạch", async () => {
      ok(!(await page("/ung-ho")).text.includes('id="minh-bach"'), "không được hiện khi tắt");
    });
    await test("Thủ quỹ xác nhận khoản báo công khai → vào sổ; bật minh bạch → tổng ủng hộ + chi theo hạng mục, KHÔNG tên người", async () => {
      const treasurer = await as("bao.pham@luuxa.local");
      const fund = (await sql("SELECT id FROM funds WHERE is_active AND deleted_at IS NULL ORDER BY code LIMIT 1")).rows[0].id;
      const r = await treasurer.patch(`/api/v1/donations/${donationId}`, { action: "confirm", fundId: fund });
      eq(r.status, 200, JSON.stringify(r.json));
      eq((await sql("SELECT status FROM donations WHERE id = $1", [donationId])).rows[0].status, "confirmed");
      await setSetting("org.donation_transparency", true);
      const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
      const t = (
        await sql(`SELECT count(*)::int AS n, COALESCE(sum(amount_vnd), 0)::bigint AS total FROM donations
                    WHERE status = 'confirmed' AND donated_on BETWEEN make_date($1, 1, 1) AND make_date($1, 12, 31)`, [year])
      ).rows[0];
      const p = await page("/ung-ho");
      ok(p.text.includes('id="minh-bach"'), "thiếu khối minh bạch");
      ok(p.text.includes(`${Number(t.total).toLocaleString("vi-VN")}đ`), `tổng ủng hộ ${t.total} phải hiện`);
      ok(p.text.includes("Chi theo hạng mục"), "thiếu chi theo hạng mục");
      ok(!p.text.includes(name), "không được hiện tên người ủng hộ");
    });
    await test("Tắt trang Ủng hộ → POST báo ủng hộ 404, /ung-ho không hiện tài khoản", async () => {
      await setSetting("org.donation_enabled", false);
      eq((await submit({ donorName: `Sau Khi Tắt ${suffix}`, amountVnd: 10_000 }, ip())).status, 404);
      ok(!(await page("/ung-ho")).text.includes("0011223344"), "không được lộ tài khoản");
    });
  } finally {
    for (const k of keys) if (prev[k] !== undefined) await setSetting(k, prev[k]);
    // Khoản đã xác nhận có bút toán sổ quỹ (bất biến) ⇒ giữ lại; khoản đang chờ của bộ thử thì xóa
    if (created.length) await sql("DELETE FROM donations WHERE id = ANY($1) AND status <> 'confirmed'", [created]).catch(() => {});
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'donation-public:%'").catch(() => {});
  }

  // ================================================================ khởi tạo
  section("Gói J — Bắt đầu thiết lập (/khoi-tao)");
  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  await test("Có mục “Số dư quỹ đầu kỳ” (bắt buộc) + Giới thiệu (bắt buộc) + Hỏi đáp/Album (tùy chọn)", async () => {
    const r = await head.get("/api/v1/setup");
    eq(r.status, 200, JSON.stringify(r.json));
    const by = Object.fromEntries(r.json.items.map((i) => [i.key, i]));
    ok(by.opening && !by.opening.optional, "thiếu mục số dư đầu kỳ (bắt buộc)");
    ok(by.about && !by.about.optional, "thiếu mục Giới thiệu");
    ok(by.faqs?.optional && by.albums?.optional, "Hỏi đáp/Album phải là tùy chọn");
  });
  await test("Túi quỹ đang dùng chưa có bút toán → số dư đầu kỳ CHƯA xong (ghi tên túi quỹ); gỡ túi quỹ → xong", async () => {
    const code = `TJ${suffix.toUpperCase().slice(-6)}`;
    const fid = (await sql("INSERT INTO funds (code, name, fund_type, description) VALUES ($1, $2, 'cash', 'Túi quỹ tạo bởi kiểm thử khởi tạo') RETURNING id", [code, `Quỹ thử khởi tạo ${suffix}`])).rows[0].id;
    try {
      const r = await head.get("/api/v1/setup");
      const it = r.json.items.find((i) => i.key === "opening");
      eq(it.done, false);
      ok(it.detail.includes(`Quỹ thử khởi tạo ${suffix}`), it.detail);
    } finally {
      await sql("UPDATE funds SET is_active = false, deleted_at = now() WHERE id = $1", [fid]);
    }
    const r2 = await head.get("/api/v1/setup");
    const it2 = r2.json.items.find((i) => i.key === "opening");
    eq(it2.done, (await sql("SELECT count(*)::int AS n FROM funds WHERE is_active AND deleted_at IS NULL AND last_seq = 0")).rows[0].n === 0);
  });
  await test("Nhóm “Vận hành hệ thống” chỉ Admin thấy, chỉ báo có/không (không lộ giá trị khóa)", async () => {
    const a = await admin.get("/api/v1/setup");
    const sys = a.json.items.filter((i) => i.group === "system");
    ok(sys.length >= 4, "Admin phải thấy 4 mục vận hành");
    ok(sys.find((i) => i.key === "sys-cron").done === true, "máy chủ thử có CRON_SECRET");
    ok(!JSON.stringify(a.json).includes("test-cron-secret"), "không được lộ giá trị khóa");
    const h = await head.get("/api/v1/setup");
    eq(h.json.items.filter((i) => i.group === "system").length, 0, "Trưởng nhà không thấy nhóm vận hành");
    eq((await (await as("tuan.nguyen@luuxa.local")).get("/api/v1/setup")).status, 403);
  });

  // ================================================================ tiêu đề bảo mật + CSP
  section("Gói J — tiêu đề bảo mật & báo cáo CSP");
  await test("Trang: Content-Security-Policy-Report-Only (report-uri + report-to) + Reporting-Endpoints; KHÔNG có CSP chặn", async () => {
    for (const p of ["/gioi-thieu", "/dang-nhap"]) {
      const r = await page(p);
      const csp = r.headers.get("content-security-policy-report-only") ?? "";
      ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("report-uri /api/v1/public/csp-report") && csp.includes("report-to csp-endpoint"), `${p}: ${csp}`);
      ok((r.headers.get("reporting-endpoints") ?? "").includes("/api/v1/public/csp-report"), "thiếu Reporting-Endpoints");
      eq(r.headers.get("content-security-policy"), null, "chưa được bật chặn thật");
      eq(r.headers.get("x-frame-options"), "DENY");
    }
  });
  await test("API: X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, X-Frame-Options DENY", async () => {
    for (const p of ["/api/v1/public/org", "/api/v1/auth/me", "/api/v1/members"]) {
      const r = await page(p);
      eq(r.headers.get("x-content-type-options"), "nosniff", p);
      eq(r.headers.get("referrer-policy"), "strict-origin-when-cross-origin", p);
      eq(r.headers.get("x-frame-options"), "DENY", p);
    }
  });
  const cspPost = (body, type, fromIp = ip()) =>
    fetch(BASE + "/api/v1/public/csp-report", { method: "POST", headers: { "content-type": type, "x-forwarded-for": fromIp }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const host = `csp-${suffix}.example.com`;
  const events = async (like) => (await sql("SELECT route, code, message, count FROM error_events WHERE source = 'csp' AND message LIKE $1", [like])).rows;
  try {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'csp:%'");
    await test("application/csp-report → 204 + ghi error_events (nguồn csp, gộp đường dẫn bài viết, bỏ tham số URL)", async () => {
      const res = await cspPost(
        { "csp-report": { "document-uri": `${BASE}/tin-tuc/bai-bat-ky?utm=1`, "violated-directive": "img-src", "effective-directive": "img-src", "blocked-uri": `https://${host}/anh.png?token=bimat`, disposition: "report", "source-file": `${BASE}/tin-tuc/bai-bat-ky` } },
        "application/csp-report",
      );
      eq(res.status, 204);
      const rows = await events(`%${host}%`);
      eq(rows.length, 1);
      eq(rows[0].code, "img-src");
      eq(rows[0].route, "/tin-tuc/:slug");
      ok(!rows[0].message.includes("bimat") && !rows[0].message.includes("anh.png"), "không lưu đường dẫn/tham số đầy đủ");
    });
    await test("application/reports+json (Reporting API) → 204 + ghi; báo cáo trùng gộp vào cùng một dòng (đếm số lần)", async () => {
      const report = [{ type: "csp-violation", url: `${BASE}/vao-o`, body: { documentURL: `${BASE}/vao-o`, blockedURL: `https://${host}/x.js`, effectiveDirective: "script-src-elem", disposition: "report" } }];
      eq((await cspPost(report, "application/reports+json")).status, 204);
      eq((await cspPost(report, "application/reports+json")).status, 204);
      const rows = (await events(`%script-src-elem: https://${host}%`));
      eq(rows.length, 1);
      eq(rows[0].count, 2, "phải gộp 2 lần vào một dòng");
      eq(rows[0].route, "/vao-o");
    });
    await test("Vi phạm do tiện ích trình duyệt (chrome-extension:) → bỏ qua; JSON hỏng → 400", async () => {
      const before = (await sql("SELECT count(*)::int AS n FROM error_events WHERE source = 'csp'")).rows[0].n;
      eq((await cspPost({ "csp-report": { "document-uri": `${BASE}/gioi-thieu`, "effective-directive": "script-src", "blocked-uri": "chrome-extension://abc/inject.js" } }, "application/csp-report")).status, 204);
      eq((await sql("SELECT count(*)::int AS n FROM error_events WHERE source = 'csp'")).rows[0].n, before);
      eq((await cspPost("{hỏng", "application/csp-report")).status, 400);
    });
    await test("Giới hạn toàn hệ thống (300/giờ) chạm ngưỡng → vẫn 204 nhưng không ghi thêm", async () => {
      await sql("INSERT INTO rate_limit_hits (key) SELECT 'csp:all' FROM generate_series(1, 300)");
      const res = await cspPost({ "csp-report": { "document-uri": `${BASE}/gioi-thieu`, "effective-directive": "img-src", "blocked-uri": `https://limit-${host}/a.png` } }, "application/csp-report");
      eq(res.status, 204);
      eq((await events(`%limit-${host}%`)).length, 0, "vượt giới hạn thì không ghi");
    });
  } finally {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'csp:%'").catch(() => {});
    await sql("DELETE FROM error_events WHERE source = 'csp' AND message LIKE $1", [`%${host}%`]).catch(() => {});
  }
}
