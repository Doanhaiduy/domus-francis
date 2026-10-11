// Kiểm thử THEO DÕI DUNG LƯỢNG (db/app/1039, src/server/modules/storage-monitor.ts, src/server/cron/storage-monitor.ts): chỉ Admin (system.monitor).
// Cloudinary Admin API được thay bằng máy chủ GIẢ ở 127.0.0.1:3195 (CLOUDINARY_API_BASE_URL do bộ chạy đặt) nên không có lưu lượng ra Cloudinary thật.
// Supabase Storage không cấu hình (STORAGE_DRIVER=local) ⇒ đo thư mục .local/storage.
import http from "node:http";
import pg from "pg";
import sharp from "sharp";

const MOCK_PORT = 3195;
const USAGE = {
  plan: "Free",
  last_updated: "2026-10-10",
  transformations: { usage: 120, credits_usage: 0.12 },
  objects: { usage: 5 },
  bandwidth: { usage: 2147483648, credits_usage: 2.0 },
  storage: { usage: 1073741824, credits_usage: 1.0 },
  credits: { usage: 18.5, limit: 25, used_percent: 74 },
  requests: 10,
  resources: 7,
  derived_resources: 11,
};

export async function run({ as, test, eq, ok, section, BASE, pgConfig, Client }) {
  section("Theo dõi dung lượng (chỉ Admin)");

  const calls = [];
  const mock = http.createServer((req, res) => {
    calls.push({ url: req.url, auth: req.headers.authorization ?? "" });
    if (/^\/v1_1\/[^/]+\/usage$/.test(req.url ?? "")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(USAGE));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r, j) => mock.once("error", j).listen(MOCK_PORT, "127.0.0.1", r));

  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const OV = "/api/v1/system/storage";
  const PROV = `${OV}/providers`;
  const cronGet = (auth) => fetch(`${BASE}/api/cron/daily?only=storage`, { headers: auth ? { authorization: auth } : {} });

  const pool = () => new pg.Client(pgConfig());
  const sql = async (text, params, role) => {
    const db = pool();
    await db.connect();
    try {
      if (role) await db.query(`SET ROLE ${role}`);
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const setLimit = async (key, value) => {
    const list = (await admin.get("/api/v1/settings")).json.items;
    const cur = list.find((s) => s.key === key);
    ok(cur, `Admin phải thấy khóa ${key}`);
    const r = await admin.patch("/api/v1/settings", { changes: [{ key, value, version: cur.version }] });
    eq(r.status, 200, JSON.stringify(r.json));
  };

  try {
    // ------------------------------------------------------------ quyền
    await test("Chỉ Admin có quyền system.monitor; Trưởng nhà và thành viên bị chặn 403 ở cả hai API", async () => {
      ok((await admin.get("/api/v1/auth/me")).json.permissions.includes("system.monitor"), "Admin phải có system.monitor");
      for (const [who, c] of [["Trưởng nhà", head], ["thành viên", member]]) {
        ok(!(await c.get("/api/v1/auth/me")).json.permissions.includes("system.monitor"), `${who} không được có system.monitor`);
        eq((await c.get(OV)).status, 403, `${who}: số liệu`);
        eq((await c.get(PROV)).status, 403, `${who}: nhà cung cấp`);
      }
      const anon = await new Client("anon").init();
      eq((await anon.get(OV)).status, 401);
    });

    await test("Cấu hình hạn mức: Admin sửa được; Trưởng nhà (có quyền đọc cấu hình) chỉ xem, không sửa được", async () => {
      const mine = (await admin.get("/api/v1/settings")).json.items.filter((s) => s.key.startsWith("monitor."));
      eq(mine.length, 4, "Admin thấy 4 khóa monitor.*");
      ok(mine.every((s) => s.canWrite), "Admin sửa được cả bốn");
      const seen = (await head.get("/api/v1/settings")).json.items.filter((s) => s.key.startsWith("monitor."));
      ok(seen.every((s) => s.canWrite === false), "Trưởng nhà không có quyền sửa khóa nào");
      const k = mine.find((s) => s.key === "monitor.warn_percent");
      eq((await head.patch("/api/v1/settings", { changes: [{ key: k.key, value: 60, version: k.version }] })).status, 403, "Trưởng nhà không được sửa");
    });

    // ------------------------------------------------------------ số liệu CSDL + tệp
    const before = (await admin.get(`${OV}?days=30`)).json;
    await test("Số liệu: hình dạng đầy đủ, hạn mức mặc định theo gói miễn phí, đủ ngày/tháng", async () => {
      const o = before;
      ok(o.generatedAt && o.limits && o.database && o.files, "thiếu khối chính");
      eq(o.limits.dbLimitBytes, 500 * 1024 * 1024);
      eq(o.limits.storageLimitBytes, 1024 * 1024 * 1024);
      eq(o.limits.warnPercent, 70);
      eq(o.limits.criticalPercent, 90);
      ok(o.database.sizeBytes > 1_000_000, "kích thước CSDL phải > 1 MB");
      ok(o.database.tables.length > 0 && o.database.tables.length <= 10, "bảng lớn nhất 1–10");
      ok(o.database.tables.every((t, i, a) => i === 0 || a[i - 1].bytes >= t.bytes), "sắp xếp giảm dần theo dung lượng");
      eq(o.daily.length, 30, "30 ngày");
      eq(o.monthly.length, 12, "12 tháng");
      eq(o.periods.map((p) => p.key).join(","), "today,d7,d30,d90");
      ok(o.daily.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day)), "ngày dạng YYYY-MM-DD");
      ok(o.daily.every((d, i, a) => i === 0 || a[i - 1].day < d.day), "ngày tăng dần");
      ok(Array.isArray(o.history) && Array.isArray(o.topUploaders) && Array.isArray(o.largest), "mảng lịch sử/top/lớn nhất");
    });
    await test("?days: kẹp trong 7–365; giá trị rác dùng mặc định 30", async () => {
      eq((await admin.get(`${OV}?days=1`)).json.daily.length, 7);
      eq((await admin.get(`${OV}?days=9999`)).json.daily.length, 365);
      eq((await admin.get(`${OV}?days=abc`)).json.daily.length, 30);
    });

    await test("Tải một ảnh ⇒ số ảnh, dung lượng, hôm nay, theo ngày, bucket đều tăng đúng 1 ảnh; người tải xuất hiện ở top", async () => {
      const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 90, b: 40 } } }).jpeg({ quality: 85 }).toBuffer();
      const form = new FormData();
      form.append("bucket", "moments");
      form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "giam-sat.jpg");
      const up = await member.req("POST", "/api/v1/files", undefined, { form, raw: true });
      eq(up.status, 200);
      const after = (await admin.get(`${OV}?days=30`)).json;
      const kind = (o, k) => o.files.byKind.find((x) => x.kind === k) ?? { count: 0, bytes: 0 };
      eq(kind(after, "image").count, kind(before, "image").count + 1, "số ảnh");
      ok(kind(after, "image").bytes > kind(before, "image").bytes, "dung lượng ảnh tăng");
      eq(after.files.totals.count, before.files.totals.count + 1, "tổng số tệp");
      ok(after.files.totals.bytes - before.files.totals.bytes >= jpeg.length * 0.3, "tổng dung lượng tăng đáng kể");
      const today = (o) => o.periods.find((p) => p.key === "today");
      eq(today(after).images, today(before).images + 1, "hôm nay");
      eq(after.daily[after.daily.length - 1].images, before.daily[before.daily.length - 1].images + 1, "cột ngày cuối");
      const bucket = (o) => o.files.byBucket.find((b) => b.bucket === "moments") ?? { count: 0 };
      eq(bucket(after).count, bucket(before).count + 1, "bucket moments");
      ok((after.files.byStore.find((s) => s.store === "primary")?.count ?? 0) >= 1, "kho tệp chính có tệp");
      ok(after.topUploaders.length >= 1 && after.topUploaders.every((u) => u.name && u.bytes > 0), "có người tải lên ở top");
      ok(after.files.variantCount >= 2, "ảnh có bản thu nhỏ thumb/medium");
      ok(after.largest.length >= 1 && after.largest[0].bytes >= after.largest[after.largest.length - 1].bytes, "tệp lớn nhất sắp giảm dần");
    });

    // ------------------------------------------------------------ số đo nhà cung cấp
    await test("Nhà cung cấp: Supabase đo thư mục local; Cloudinary lấy từ API giả và chuẩn hóa; có bộ nhớ đệm", async () => {
      const r = await admin.get(PROV);
      eq(r.status, 200, JSON.stringify(r.json));
      if (!calls.length) {
        console.log("    (bỏ qua phần Cloudinary: máy chủ đang chạy không dùng CLOUDINARY_API_BASE_URL=http://127.0.0.1:3195)");
        return;
      }
      const j = r.json;
      eq(j.supabase.source, "local", "STORAGE_DRIVER=local ⇒ đo ổ đĩa");
      ok(j.supabase.objects >= 1 && j.supabase.usedBytes > 0, "đếm được tệp vừa tải");
      ok(j.supabase.buckets.some((b) => b.bucket === "moments"), "có bucket moments");
      const c = j.cloudinary;
      eq(c.configured, true);
      eq(c.ok, true, c.error);
      eq(c.plan, "Free");
      eq(c.creditsUsed, 18.5);
      eq(c.creditsLimit, 25);
      eq(c.creditsPercent, 74);
      eq(c.storageBytes, 1073741824);
      eq(c.bandwidthBytes, 2147483648);
      eq(c.transformations, 120);
      eq(c.resources, 7);
      ok(calls[0].auth.startsWith("Basic "), "gọi Cloudinary bằng HTTP Basic");
      const n = calls.length;
      const again = await admin.get(PROV);
      eq(again.json.cached, true, "lần hai lấy từ bộ nhớ đệm");
      eq(calls.length, n, "không gọi Cloudinary thêm");
      const forced = await admin.get(`${PROV}?refresh=1`);
      eq(forced.status, 200);
      ok(calls.length <= n + 1, "đo lại tối đa một lần gọi nữa (giãn cách 15 giây)");
    });

    // ------------------------------------------------------------ ảnh chụp hằng ngày + lịch sử
    await test("Ảnh chụp hằng ngày: chỉ vai trò nền ghi được; Admin thấy trong history; luuxa_app không đọc trực tiếp bảng", async () => {
      await sql("SELECT app.fn_usage_snapshot_save($1::bigint, 'supabase', 12.5, 25, 1000, 2000)", [123456789], "luuxa_worker");
      let h = (await admin.get(OV)).json.history;
      let today = h[h.length - 1];
      eq(today.storageBytes, 123456789);
      eq(today.storageSource, "supabase");
      eq(today.cloudinaryCreditsUsed, 12.5);
      ok(today.dbBytes > 1_000_000 && today.filesBytes >= 0, "CSDL + số tệp do hàm tự tính");
      // đo lại không ra kết quả (NULL) ⇒ giữ số đo tốt gần nhất của ngày
      await sql("SELECT app.fn_usage_snapshot_save(NULL, NULL, NULL, NULL, NULL, NULL)", [], "luuxa_worker");
      h = (await admin.get(OV)).json.history;
      today = h[h.length - 1];
      eq(today.storageBytes, 123456789, "giữ số cũ");
      eq(h.filter((x) => x.day === today.day).length, 1, "mỗi ngày đúng một dòng");
      let denied = false;
      try {
        await sql("SELECT count(*) FROM usage_snapshots", [], "luuxa_app");
      } catch {
        denied = true;
      }
      ok(denied, "luuxa_app không được đọc usage_snapshots");
      denied = false;
      try {
        await sql("SELECT app.fn_usage_snapshot_save(1, 'local', NULL, NULL, NULL, NULL)", [], "luuxa_app");
      } catch {
        denied = true;
      }
      ok(denied, "luuxa_app không được gọi hàm ghi ảnh chụp");
    });

    // ------------------------------------------------------------ hạn mức + cron cảnh báo
    await test("Đổi hạn mức: số liệu phản ánh ngay; dưới mức tối thiểu bị từ chối", async () => {
      await setLimit("monitor.supabase.db_limit_mb", 2048);
      await setLimit("monitor.supabase.storage_limit_mb", 2048);
      const l = (await admin.get(OV)).json.limits;
      eq(l.dbLimitBytes, 2048 * 1024 * 1024);
      eq(l.storageLimitBytes, 2048 * 1024 * 1024);
      const cur = (await admin.get("/api/v1/settings")).json.items.find((s) => s.key === "monitor.supabase.db_limit_mb");
      const bad = await admin.patch("/api/v1/settings", { changes: [{ key: cur.key, value: 1, version: cur.version }] });
      eq(bad.status, 400, "dưới mức tối thiểu 5 MB");
    });

    await test("Cron ?only=storage: cần CRON_SECRET; chạm ngưỡng ⇒ báo Admin đúng một lần mỗi tuần (CSDL nguy hiểm, Cloudinary cảnh báo)", async () => {
      eq((await cronGet(null)).status, 401, "không có khóa");
      eq((await cronGet("Bearer sai")).status, 401, "sai khóa");
      await setLimit("monitor.supabase.db_limit_mb", 5); // CSDL thử luôn > 5 MB ⇒ nguy hiểm
      const r1 = await cronGet("Bearer test-cron-secret-0001");
      eq(r1.status, 200);
      const j1 = await r1.json();
      ok(j1.notes.some((n) => /CSDL/.test(n) && /đã báo Admin/.test(n)), `phải báo CSDL: ${JSON.stringify(j1.notes)}`);
      if (calls.length) ok(j1.notes.some((n) => /Cloudinary/.test(n) && /74%/.test(n)), `phải báo Cloudinary 74%: ${JSON.stringify(j1.notes)}`);
      const mine = JSON.stringify((await admin.get("/api/v1/notifications")).json);
      ok(mine.includes("CSDL (Supabase Database) đã dùng"), "Admin nhận thông báo CSDL");
      ok(!JSON.stringify((await head.get("/api/v1/notifications")).json).includes("đã dùng"), "Trưởng nhà không nhận");
      ok(!JSON.stringify((await member.get("/api/v1/notifications")).json).includes("CSDL (Supabase Database)"), "thành viên không nhận");
      // chạy lại cùng tuần ⇒ không gửi trùng
      const j2 = await (await cronGet("Bearer test-cron-secret-0001")).json();
      ok(!j2.notes.some((n) => /đã báo Admin/.test(n)), `không được báo lại: ${JSON.stringify(j2.notes)}`);
      // cron cũng ghi ảnh chụp của hôm nay (số CSDL cập nhật)
      const h = (await admin.get(OV)).json.history;
      ok(h[h.length - 1].dbBytes > 1_000_000, "ảnh chụp hôm nay có số CSDL");
    });
  } finally {
    // trả hạn mức về mặc định
    for (const [key, v] of [["monitor.supabase.db_limit_mb", 500], ["monitor.supabase.storage_limit_mb", 1024]]) {
      await setLimit(key, v).catch(() => {});
    }
    await new Promise((r) => mock.close(r));
  }
}
