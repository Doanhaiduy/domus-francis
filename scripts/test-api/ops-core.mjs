// Kiểm thử NỀN GIÁM SÁT (db/app/1041, src/server/ops.ts, src/server/cron/daily.ts, /api/health?deep=1):
//   • lỗi giao diện gửi về /api/v1/public/client-error được GỘP vào error_events (đếm số lần, che email/số)
//   • lượt cron ghi job_runs (từng bước, đạt/lỗi); /api/cron/daily trả JSON có steps
//   • /api/health?deep=1 trả thêm mục kiểm tra (local: cron không xét)
//   • giới hạn tần suất dùng chung app.fn_rate_limit_hit
import pg from "pg";

export async function run({ test, eq, ok, section, BASE, pgConfig, Client }) {
  section("Nền giám sát (nhật ký lỗi, lượt chạy cron, health sâu, giới hạn tần suất)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const CRON = "test-cron-secret-0001";

  await test("Lỗi giao diện được ghi + gộp vào error_events (2 lần cùng lỗi ⇒ 1 dòng, count = 2); email bị che", async () => {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
    // chỉ chữ cái: dãy số dài trong thông điệp bị che thành <số> trước khi lưu
    const tag = `TestLoiGiaoDien${Math.random().toString(36).slice(2, 10).replace(/[0-9]/g, "q")}`;
    const body = { kind: "window", message: `${tag}: không đọc được thuộc tính x của anh.b@vidu.vn`, path: "/thu-chi", stack: "at f (webpack://x/src/app/thu-chi/page.tsx:12:3)" };
    const anon = await new Client("anon-ce").init();
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${BASE}/api/v1/public/client-error`, { method: "POST", headers: { "content-type": "application/json", cookie: anon.cookieHeader() }, body: JSON.stringify(body) });
      eq(r.status, 200);
    }
    let row;
    for (let i = 0; i < 10 && !row; i++) {
      await wait(300);
      row = (await sql("SELECT source, route, count, message FROM error_events WHERE message LIKE $1", [`${tag}%`])).rows[0];
    }
    ok(row, "phải có dòng error_events");
    eq(row.source, "client");
    eq(row.route, "/thu-chi");
    eq(row.count, 2);
    ok(!row.message.includes("anh.b@vidu.vn"), "email phải bị che");
  });

  await test("Lỗi do script của ứng dụng bọc trình duyệt chèn vào trang (Zalo: zaloJSV2) không phải lỗi của ứng dụng ⇒ bỏ qua, không ghi error_events (mã lỗi 5a4403dc)", async () => {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
    const tag = `zaloJSV2${Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "q")}`;
    const r = await fetch(`${BASE}/api/v1/public/client-error`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "window", message: `ReferenceError: Can't find variable: zaloJSV2 ${tag}`, path: "/dang-nhap" }),
    });
    eq(r.status, 200);
    await wait(800);
    eq((await sql("SELECT count(*)::int AS n FROM error_events WHERE message LIKE $1", [`%${tag}%`])).rows[0].n, 0);
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
  });

  await test("Báo lỗi giao diện bị giới hạn theo IP (20 lần / 10 phút) — vượt thì bỏ qua (vẫn 200, dropped)", async () => {
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
    let dropped = false;
    for (let i = 0; i < 22; i++) {
      const r = await fetch(`${BASE}/api/v1/public/client-error`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: `spam ${i}` }) });
      const j = await r.json();
      if (j.dropped) dropped = true;
    }
    ok(dropped, "lần thứ 21+ phải bị bỏ qua");
    await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
    await sql("DELETE FROM error_events WHERE message LIKE 'spam %'");
  });

  await test("app.fn_rate_limit_hit: cho phép đúng N lần trong cửa sổ rồi chặn", async () => {
    const key = `test:${Date.now()}`;
    const r = (await sql("SELECT array_agg(app.fn_rate_limit_hit($1, 60, 3) ORDER BY g) AS a FROM generate_series(1, 5) g", [key])).rows[0].a;
    eq(JSON.stringify(r), JSON.stringify([true, true, true, false, false]));
    await sql("DELETE FROM rate_limit_hits WHERE key = $1", [key]);
  });

  await test("Cron buổi tối chạy ⇒ ghi job_runs (kind cron:evening) với danh sách bước; phản hồi có steps", async () => {
    const r = await fetch(`${BASE}/api/cron/daily?slot=evening`, { headers: { authorization: `Bearer ${CRON}` } });
    const j = await r.json();
    ok([200, 500].includes(r.status), `HTTP ${r.status}`);
    ok(Array.isArray(j.steps) && j.steps.length >= 3, "phải có các bước");
    ok(j.steps.some((s) => s.name === "housekeeping"), "lượt tối phải có bước dọn dẹp");
    const run = (await sql("SELECT kind, ok, jsonb_array_length(steps) AS n, finished_at FROM job_runs WHERE kind = 'cron:evening' ORDER BY started_at DESC LIMIT 1")).rows[0];
    ok(run && run.finished_at, "phải có lượt chạy đã kết thúc");
    eq(run.n, j.steps.length);
    eq(run.ok, j.ok);
  });

  await test("Cron sai khóa → 401; cron buổi sáng chạy được (xem trước bằng API Admin không ghi job_runs)", async () => {
    eq((await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: "Bearer sai" } })).status, 401);
    const before = (await sql("SELECT count(*)::int AS n FROM job_runs")).rows[0].n;
    const admin = await new Client("admin").login("viet.vu@luuxa.local");
    const dry = await admin.post("/api/v1/integrations/cron/run", { slot: "morning", dry: true });
    eq(dry.status, 200, JSON.stringify(dry.json));
    eq(dry.json.dry, true);
    eq((await sql("SELECT count(*)::int AS n FROM job_runs")).rows[0].n, before, "xem trước không ghi job_runs");
  });

  await test("/api/health?deep=1 có mục kiểm tra cron + sao lưu (máy chủ thử không phải Vercel ⇒ cron không xét)", async () => {
    const r = await fetch(`${BASE}/api/health?deep=1`);
    const j = await r.json();
    ok(j.checks && "cron:morning" in j.checks && "backup" in j.checks, JSON.stringify(j));
    eq(j.checks["cron:morning"].ok, null);
  });

  await test("Phản hồi API có header Server-Timing (số vòng DB)", async () => {
    const r = await fetch(`${BASE}/api/health`);
    const st = r.headers.get("server-timing") ?? "";
    ok(/db;dur=/.test(st) && /round-trips/.test(st), `server-timing: ${st}`);
  });
}
