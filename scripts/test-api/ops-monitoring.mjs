// Kiểm thử GIÁM SÁT & VẬN HÀNH (gói A): Cài đặt → Hệ thống (/api/v1/system/*), nhịp tim sao lưu (/api/v1/public/ops-heartbeat),
// bước cron "ops-digest" (tóm tắt lỗi mới, nhắc giao dịch ngân hàng chưa khớp, sao lưu quá hạn), /api/health?deep=1 sau nhịp tim,
// nhật ký hoạt động (lọc hành động + cột lý do + trang lớn cho xuất Excel), cảnh báo ngân sách AI + ngắt mạch AI lưu CSDL (db/app/1043).
// Không có lưu lượng ra ngoài: AI dùng máy chủ GIẢ ở 127.0.0.1:3199 (AI_TEST_BASE_URL của máy chủ thử), Zalo trỏ loopback.
// Chạy lại được trên DB đã từng chạy: mọi dữ liệu thử có thẻ riêng và được dọn ở cuối (finally).
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";

const HB_SECRET = "test-ops-heartbeat-secret-0001";
const CRON = "test-cron-secret-0001";
const AI_MOCK_PORT = 3199;
const SECRETS = [HB_SECRET, CRON, "offline-test-zalo", "offline-test-key", "offline-test-gemini", "test-bank-webhook-secret-0001", "offline-test-resend"];

/** Tuần ISO giống src/server/cron/steps/ops-digest.ts */
function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const year = d.getUTCFullYear();
  const firstThu = new Date(Date.UTC(year, 0, 4));
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Máy chủ giả Groq/Gemini tối giản (chỉ tác vụ nhắc đóng quỹ). */
function startAiMock() {
  const state = { groq: "ok", gemini: "ok", calls: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const isGroq = (req.url ?? "").startsWith("/groq/");
      const provider = isGroq ? "groq" : "gemini";
      state.calls.push({ provider, url: req.url });
      const send = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (state[provider] === "down") return send(503, { error: "down" });
      const text = JSON.stringify({ message: "Chào cả nhà, nhắc nhẹ quỹ tháng này nhé." });
      if (isGroq) return send(200, { choices: [{ message: { content: text } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } });
      return send(200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } });
    });
  });
  return new Promise((resolve, reject) => server.once("error", reject).listen(AI_MOCK_PORT, "127.0.0.1", () => resolve({ state, server })));
}

export async function run({ as, test, eq, ok, section, BASE, Client, pgConfig }) {
  section("Giám sát & vận hành (Cài đặt → Hệ thống, nhịp tim sao lưu, ops-digest, nhật ký hoạt động, ngân sách AI)");

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
  /** Mốc thời gian theo đồng hồ CSDL (created_at của thông báo = now() của giao dịch tạo ra nó) */
  const dbNow = async () => (await sql("SELECT clock_timestamp() AS t")).rows[0].t;
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const week = isoWeek(today);
  const tag = `OpsMon${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
  const notes = async (email, type, since) =>
    (
      await sql(
        `SELECT n.title, n.body, n.payload FROM notifications n JOIN members m ON m.id = n.member_id JOIN users u ON u.id = m.user_id
          WHERE u.email = $1 AND n.type_code = $2 AND n.created_at >= $3 ORDER BY n.created_at DESC`,
        [email, type, since],
      )
    ).rows;
  const hb = (body, auth = `Bearer ${HB_SECRET}`) =>
    fetch(`${BASE}/api/v1/public/ops-heartbeat`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });

  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");

  // Dữ liệu thử tạo ra — dọn ở cuối
  const created = { runs: [], errors: [], bank: [], aged: [] };
  const fp = (s) => `opsmon-${tag}-${s}`.slice(0, 120);
  const recordError = async (suffix, source = "server", reqId = randomUUID()) =>
    (
      await sql("SELECT app.fn_error_event_record($1, $2, $3, $4, $5, $6, NULL) AS id", [fp(suffix), source, `GET /api/v1/thu/${suffix}`, "INTERNAL", `${tag} lỗi thử ${suffix}`, reqId])
    ).rows[0].id;

  try {
    // ------------------------------------------------------------ quyền
    await test("Quyền: Admin xem được Hệ thống (đầy đủ + tóm tắt); Trưởng nhà và thành viên 403; chưa đăng nhập 401", async () => {
      eq((await admin.get("/api/v1/system/status")).status, 200, "Admin: bản đầy đủ");
      eq((await admin.get("/api/v1/system/status?summary=1")).status, 200, "Admin: tóm tắt");
      for (const [who, c] of [
        ["Trưởng nhà", head],
        ["thành viên", member],
      ]) {
        for (const p of ["/api/v1/system/status", "/api/v1/system/status?summary=1", "/api/v1/system/job-runs", "/api/v1/system/errors"]) {
          eq((await c.get(p)).status, 403, `${who}: ${p}`);
        }
        eq((await c.patch(`/api/v1/system/errors/${randomUUID()}`, { status: "ack" })).status, 403, `${who}: đổi trạng thái lỗi`);
        eq((await c.patch("/api/v1/system/errors", { ids: [randomUUID()], status: "ack" })).status, 403, `${who}: đổi nhiều lỗi`);
      }
      const anon = await new Client("anon-ops").init();
      eq((await anon.get("/api/v1/system/status?summary=1")).status, 401);
    });

    await test("Bản đầy đủ: 4 loại tác vụ được theo dõi, kênh gửi, hạ tầng; biến môi trường CHỈ là cờ (không lộ giá trị khóa nào)", async () => {
      const r = await admin.get("/api/v1/system/status");
      eq(r.status, 200);
      const j = r.json;
      eq(JSON.stringify(j.jobs.map((x) => x.kind)), JSON.stringify(["cron:morning", "cron:evening", "backup", "backup:storage"]));
      eq(j.infra.onVercel, false, "máy chủ thử không phải Vercel");
      ok(j.jobs.filter((x) => x.kind.startsWith("cron:")).every((x) => x.watched === false), "cron không xét quá hạn khi không chạy trên Vercel");
      ok(Array.isArray(j.infra.envFlags) && j.infra.envFlags.length >= 10, "có danh sách biến môi trường");
      ok(j.infra.envFlags.every((f) => typeof f.set === "boolean" && !("value" in f)), "chỉ có cờ set: boolean");
      eq(j.infra.envFlags.find((f) => f.key === "OPS_HEARTBEAT_SECRET")?.set, true);
      eq(j.infra.envFlags.find((f) => f.key === "CRON_SECRET")?.set, true);
      const txt = JSON.stringify(j);
      for (const s of SECRETS) ok(!txt.includes(s), `không được lộ giá trị khóa (${s.slice(0, 12)}…)`);
      ok(typeof j.infra.audit.defaultRows === "number" && /^\d{4}-\d{2}$/.test(j.infra.audit.latestPartition ?? ""), "có thông tin phân vùng audit");
      ok(j.channels && j.channels.push && j.channels.zalo && j.channels.bank && j.channels.ai && Array.isArray(j.channels.outbox), "có số liệu kênh gửi");
      eq(j.channels.ai.providers.length, 2, "trạng thái Groq + Gemini");
      ok(["ok", "warn", "error"].includes(j.summary.level) && Array.isArray(j.notices), "có tóm tắt + cảnh báo phụ");
    });

    // ------------------------------------------------------------ nhật ký lỗi
    await test("Nhật ký lỗi: lỗi mới hiện trong danh sách (lọc trạng thái/nguồn, tìm theo mã lỗi 8 ký tự); đếm theo trạng thái", async () => {
      const reqId = randomUUID();
      created.errors.push(await recordError("a", "server", reqId));
      created.errors.push(await recordError("b", "cron"));
      const list = await admin.get(`/api/v1/system/errors?status=new&q=${tag}`);
      eq(list.status, 200, JSON.stringify(list.json));
      eq(list.json.items.length, 2, "hai lỗi mới của bộ thử");
      eq(list.json.counts.new, 2);
      const a = list.json.items.find((e) => e.message.endsWith(" a"));
      eq(a.shortCode, reqId.slice(0, 8), "mã lỗi = 8 ký tự đầu mã request");
      eq(a.source, "server");
      eq(a.count, 1);
      const byCode = await admin.get(`/api/v1/system/errors?status=all&q=${reqId.slice(0, 8)}`);
      ok(byCode.json.items.some((e) => e.id === a.id), "tìm được theo mã lỗi người dùng thấy");
      const cronOnly = await admin.get(`/api/v1/system/errors?status=all&source=cron&q=${tag}`);
      eq(cronOnly.json.items.length, 1, "lọc theo nguồn");
      eq((await admin.get("/api/v1/system/errors?status=xyz")).status, 400, "trạng thái lọc sai");
      eq((await admin.get("/api/v1/system/errors?source=abc")).status, 400, "nguồn sai");
      // gặp lại cùng lỗi ⇒ gộp, đếm 2
      await recordError("a", "server");
      const again = await admin.get(`/api/v1/system/errors?status=new&q=${tag}`);
      eq(again.json.items.find((e) => e.id === a.id).count, 2, "lỗi giống nhau được gộp");
    });

    await test("Đổi trạng thái lỗi: Đã xem → Đã sửa (ghi người sửa) → tái diễn tự mở lại; đổi nhiều lỗi một lần; id lạ 404, trạng thái sai 400", async () => {
      const [ida, idb] = created.errors;
      const ack = await admin.patch(`/api/v1/system/errors/${ida}`, { status: "ack" });
      eq(ack.status, 200, JSON.stringify(ack.json));
      eq(ack.json.status, "ack");
      const res = await admin.patch(`/api/v1/system/errors/${ida}`, { status: "resolved" });
      eq(res.json.status, "resolved");
      ok(res.json.resolvedAt && res.json.resolvedBy, "ghi lúc sửa + người sửa");
      await recordError("a", "server"); // tái diễn
      const reopened = (await admin.get(`/api/v1/system/errors?status=new&q=${tag}`)).json.items.find((e) => e.id === ida);
      ok(reopened && reopened.status === "new" && !reopened.resolvedAt, "lỗi đã sửa mà tái diễn phải mở lại (new)");
      const bulk = await admin.patch("/api/v1/system/errors", { ids: [ida, idb], status: "ack" });
      eq(bulk.status, 200, JSON.stringify(bulk.json));
      eq(bulk.json.updated, 2);
      const counts = (await admin.get(`/api/v1/system/errors?status=all&q=${tag}`)).json.counts;
      eq(counts.ack, 2);
      eq(counts.new, 0);
      eq((await admin.patch(`/api/v1/system/errors/${randomUUID()}`, { status: "ack" })).status, 404, "id lạ");
      eq((await admin.patch(`/api/v1/system/errors/${ida}`, { status: "deleted" })).status, 400, "trạng thái sai");
      eq((await admin.patch("/api/v1/system/errors", { ids: [], status: "ack" })).status, 400, "danh sách rỗng");
    });

    // ------------------------------------------------------------ nhịp tim sao lưu
    await test("Nhịp tim: thiếu / sai khóa ⇒ 401; nội dung sai ⇒ 400; đúng ⇒ 200 + một dòng job_runs (che bí mật trong lỗi)", async () => {
      await sql("DELETE FROM rate_limit_hits WHERE key = 'ops-heartbeat'");
      eq((await hb({ kind: "backup", ok: true }, null)).status, 401, "thiếu khóa");
      eq((await hb({ kind: "backup", ok: true }, "Bearer sai-khoa")).status, 401, "sai khóa");
      eq((await hb({ kind: "backup", ok: true }, HB_SECRET)).status, 401, "thiếu tiền tố Bearer");
      eq((await hb({ kind: "khac", ok: true })).status, 400, "kind sai");
      eq((await hb({ kind: "backup" })).status, 400, "thiếu ok");
      const r = await hb({
        kind: "backup",
        ok: true,
        summary: `luuxa-prod-${tag}.dump.gpg (12 MB)\ndiễn tập khôi phục: success`,
        steps: [
          { name: "pg_dump", ok: true, ms: 41000 },
          { name: "diễn tập khôi phục", ok: true, ms: 90000, error: "postgresql://user:matkhau@host/db password=abc123" },
        ],
      });
      eq(r.status, 200);
      const j = await r.json();
      ok(j.ok && j.id, "trả id lượt chạy");
      created.runs.push(j.id);
      const row = (await sql("SELECT kind, ok, steps, summary, started_at = finished_at AS same FROM job_runs WHERE id = $1", [j.id])).rows[0];
      eq(row.kind, "backup");
      eq(row.ok, true);
      eq(row.same, true, "started_at = finished_at");
      eq(row.steps.length, 2);
      ok(!JSON.stringify(row.steps).includes("matkhau") && !JSON.stringify(row.steps).includes("abc123"), "bí mật trong thông điệp lỗi phải bị che");
      ok(row.summary.includes(tag) && row.summary.includes("\n"), "giữ tóm tắt nhiều dòng");
    });

    await test("/api/health?deep=1 báo tuổi sao lưu sau nhịp tim (đạt, ~0 giờ); job-runs liệt kê lượt đó kèm các bước", async () => {
      const h = await (await fetch(`${BASE}/api/health?deep=1`)).json();
      ok(h.checks?.backup, JSON.stringify(h));
      eq(h.checks.backup.ok, true, "đã từng có nhịp tim ⇒ xét và đạt");
      ok(h.checks.backup.ageHours !== null && h.checks.backup.ageHours <= 0.1, `tuổi sao lưu ~0 giờ: ${h.checks.backup.ageHours}`);
      const runs = await admin.get("/api/v1/system/job-runs?kind=backup&limit=5");
      eq(runs.status, 200);
      const mine = runs.json.items.find((x) => x.id === created.runs[0]);
      ok(mine, "lượt sao lưu có trong lịch sử");
      eq(mine.kindLabel, "Sao lưu CSDL");
      eq(JSON.stringify(mine.steps.map((s) => s.name)), JSON.stringify(["pg_dump", "diễn tập khôi phục"]));
      eq(mine.ok, true);
      eq((await admin.get("/api/v1/system/job-runs?kind=DROP TABLE")).status, 400, "loại lượt chạy sai");
      const st = (await admin.get("/api/v1/system/status")).json.jobs.find((x) => x.kind === "backup");
      eq(st.level, "ok");
      eq(st.everSeen, true);
      eq(st.watched, true, "đã từng có nhịp tim ⇒ bắt đầu xét quá hạn");
    });

    await test("Nhịp tim: thời gian — không đo được thì KHÔNG ghi 0 (lịch sử hiện \"—\"); có durationMs/ms thì hiện đúng; lượt cũ lưu ms = 0 cũng hiện \"—\"", async () => {
      await sql("DELETE FROM rate_limit_hits WHERE key = 'ops-heartbeat'");
      const list = async () => (await admin.get("/api/v1/system/job-runs?kind=backup&limit=20")).json.items;
      // (1) có thời gian: durationMs lùi giờ bắt đầu lại, ms từng bước giữ nguyên; bước không kèm ms ⇒ không ghi ms
      const r = await hb({ kind: "backup", ok: true, summary: `thời gian ${tag}`, durationMs: 150_000, steps: [{ name: "pg_dump", ok: true, ms: 41000 }, { name: "kiểm tra", ok: true }] });
      eq(r.status, 200);
      const id1 = (await r.json()).id;
      created.runs.push(id1);
      const raw = (await sql("SELECT steps FROM job_runs WHERE id = $1", [id1])).rows[0].steps;
      eq(raw[0].ms, 41000);
      ok(!("ms" in raw[1]), `bước không kèm ms ⇒ không ghi ms: ${JSON.stringify(raw[1])}`);
      const m1 = (await list()).find((x) => x.id === id1);
      eq(m1.durationMs, 150000, "tổng thời gian = durationMs đã gửi");
      eq(m1.steps[0].ms, 41000);
      eq(m1.steps[1].ms, null, "bước không đo được ⇒ null (giao diện hiện —)");
      // (2) không gửi thời gian nào ⇒ tổng và từng bước đều null, không phải 0
      const r2 = await hb({ kind: "backup", ok: true, summary: `không đo ${tag}`, steps: [{ name: "pg_dump", ok: true }] });
      const id2 = (await r2.json()).id;
      created.runs.push(id2);
      const m2 = (await list()).find((x) => x.id === id2);
      eq(m2.durationMs, null, "không có durationMs ⇒ null");
      eq(m2.steps[0].ms, null);
      // (3) lượt cũ (trước khi sửa) đã lưu ms = 0 và started_at = finished_at ⇒ hiện null chứ không phải "0 ms"
      const id3 = (
        await sql(
          "INSERT INTO job_runs (kind, started_at, finished_at, ok, steps, summary) VALUES ('backup', now() - interval '5 minutes', now() - interval '5 minutes', true, $1::jsonb, $2) RETURNING id",
          [JSON.stringify([{ name: "pg_dump", ok: true, ms: 0 }]), `lượt cũ ${tag}`]
        )
      ).rows[0].id;
      created.runs.push(id3);
      const m3 = (await list()).find((x) => x.id === id3);
      eq(m3.durationMs, null, "lượt cũ: tổng 0 ⇒ null");
      eq(m3.steps[0].ms, null, "lượt cũ: ms 0 ⇒ null");
      // (4) giá trị không hợp lệ bị từ chối
      eq((await hb({ kind: "backup", ok: true, durationMs: -5 })).status, 400, "durationMs âm");
      eq((await hb({ kind: "backup", ok: true, durationMs: 1.5 })).status, 400, "durationMs không nguyên");
    });

    await test("Nhịp tim ok=false ⇒ Admin nhận cảnh báo (một lần/ngày), Trưởng nhà không; dải cảnh báo chuyển ĐỎ", async () => {
      await sql("DELETE FROM system_post_log WHERE key = $1", [`ops-alert:backup:storage:failed:${today}`]);
      const since = await dbNow();
      const r = await hb({ kind: "backup:storage", ok: false, summary: `storage ${tag}`, steps: [{ name: "tải tệp Storage", ok: false, error: "HTTP 500 từ Supabase" }] });
      eq(r.status, 200);
      created.runs.push((await r.json()).id);
      const mine = await notes("viet.vu@luuxa.local", "system.ops_alert", since);
      ok(mine.some((n) => /Sao lưu tệp.*THẤT BẠI/.test(n.title) && n.payload?.link === "/cai-dat?tab=system"), `Admin phải nhận cảnh báo: ${JSON.stringify(mine)}`);
      eq((await notes("duc.tran@luuxa.local", "system.ops_alert", since)).length, 0, "Trưởng nhà không nhận");
      // lần thất bại thứ hai trong ngày ⇒ không báo lại
      const r2 = await hb({ kind: "backup:storage", ok: false, summary: `storage lần 2 ${tag}` });
      created.runs.push((await r2.json()).id);
      eq((await notes("viet.vu@luuxa.local", "system.ops_alert", since)).filter((n) => /Sao lưu tệp/.test(n.title)).length, 1, "mỗi ngày một lần");
      const s = (await admin.get("/api/v1/system/status?summary=1")).json;
      eq(s.level, "error");
      ok(s.issues.some((i) => i.key === "backup:storage" && i.level === "error"), JSON.stringify(s.issues));
    });

    await test("Nhịp tim bị giới hạn 60 lần/giờ (429)", async () => {
      await sql("DELETE FROM rate_limit_hits WHERE key = 'ops-heartbeat'");
      await sql("INSERT INTO rate_limit_hits (key) SELECT 'ops-heartbeat' FROM generate_series(1, 60)");
      eq((await hb({ kind: "backup", ok: true })).status, 429);
      await sql("DELETE FROM rate_limit_hits WHERE key = 'ops-heartbeat'");
    });

    // ------------------------------------------------------------ cron ops-digest
    await test("Cron sáng (ops-digest): tóm tắt lỗi mới cho Admin + đánh dấu notified_at; nhắc Thủ quỹ/Trưởng nhà giao dịch ngân hàng chưa khớp > 7 ngày; báo sao lưu quá hạn", async () => {
      // lỗi mới chưa báo
      const fresh = await recordError("digest", "client");
      created.errors.push(fresh);
      await sql("DELETE FROM system_post_log WHERE key = ANY($1::text[])", [[`error-digest:${today}`, `bank-unmatched:${week}`, `ops-alert:backup-stale:${today}`]]);
      // giao dịch ngân hàng chưa khớp từ 9 ngày trước
      const bank = (
        await sql(
          `INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, source, imported_at)
           SELECT id, app.uuid_v7(), (now() - interval '9 days')::date, 'in', 12345, $1, $2, 'sepay', now() - interval '9 days'
             FROM funds WHERE is_active AND deleted_at IS NULL ORDER BY created_at LIMIT 1 RETURNING id`,
          [`TEST ${tag}`, `OPSMON-${tag}`],
        )
      ).rows[0].id;
      created.bank.push(bank);
      // sao lưu CSDL quá hạn: lượt đạt gần nhất 40 giờ trước (tạm đẩy lùi các lượt đạt mới hơn, trả lại ở cuối)
      created.aged.push(
        ...(
          await sql(
            "UPDATE job_runs SET started_at = started_at - interval '3 days', finished_at = finished_at - interval '3 days' WHERE kind = 'backup' AND started_at > now() - interval '40 hours' RETURNING id",
          )
        ).rows.map((x) => x.id),
      );
      created.runs.push(
        (await sql("INSERT INTO job_runs (kind, started_at, finished_at, ok, steps, summary) VALUES ('backup', now() - interval '40 hours', now() - interval '40 hours', true, '[]', $1) RETURNING id", [`cũ ${tag}`])).rows[0].id,
      );

      const since = await dbNow();
      const res = await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: `Bearer ${CRON}` } });
      const j = await res.json();
      ok([200, 500].includes(res.status), `HTTP ${res.status}`);
      const step = j.steps.find((s) => s.name === "ops-digest");
      ok(step, "lượt sáng phải có bước ops-digest");
      eq(step.ok, true, `ops-digest phải đạt: ${step.error ?? ""}`);
      const info = (step.info ?? []).join(" | ");
      ok(/đã gửi Admin tóm tắt \d+ lỗi mới/.test(info), `ghi chú tóm tắt lỗi: ${info}`);
      ok(/đã nhắc Thủ quỹ \+ Trưởng nhà/.test(info), `ghi chú nhắc ngân hàng: ${info}`);
      ok(/Sao lưu CSDL đã quá hạn/.test(info), `ghi chú sao lưu quá hạn: ${info}`);

      const nr = (await sql("SELECT notified_at FROM error_events WHERE id = $1", [fresh])).rows[0];
      ok(nr.notified_at, "lỗi đã báo phải có notified_at");
      const dig = await notes("viet.vu@luuxa.local", "system.error_digest", since);
      ok(dig.length === 1 && /lỗi hệ thống mới/.test(dig[0].title) && dig[0].payload?.link === "/cai-dat?tab=system", `Admin nhận đúng một bản tóm tắt: ${JSON.stringify(dig)}`);
      eq((await notes("duc.tran@luuxa.local", "system.error_digest", since)).length, 0, "Trưởng nhà không nhận tóm tắt lỗi");
      const bankT = await notes("bao.pham@luuxa.local", "finance.bank_unmatched", since);
      ok(bankT.length === 1 && bankT[0].payload?.link === "/thu-chi", `Thủ quỹ nhận nhắc ngân hàng: ${JSON.stringify(bankT)}`);
      eq((await notes("duc.tran@luuxa.local", "finance.bank_unmatched", since)).length, 1, "Trưởng nhà nhận nhắc ngân hàng");
      eq((await notes("tuan.nguyen@luuxa.local", "finance.bank_unmatched", since)).length, 0, "thành viên không nhận");
      ok((await notes("viet.vu@luuxa.local", "system.ops_alert", since)).some((n) => /Sao lưu CSDL đã quá hạn/.test(n.title)), "Admin nhận cảnh báo sao lưu quá hạn");
      const sum = (await admin.get("/api/v1/system/status?summary=1")).json;
      ok(sum.issues.some((i) => i.key === "backup" && i.level === "error"), "dải cảnh báo báo sao lưu CSDL quá hạn");
    });

    await test("Cron sáng chạy lại cùng ngày: không gửi lại tóm tắt; lỗi mới phát sinh sau đó để dành cho ngày mai (notified_at vẫn trống)", async () => {
      const later = await recordError("later", "server");
      created.errors.push(later);
      const since = await dbNow();
      const j = await (await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: `Bearer ${CRON}` } })).json();
      const step = j.steps.find((s) => s.name === "ops-digest");
      eq(step.ok, true, step.error ?? "");
      ok(/để dành cho bản ngày mai/.test((step.info ?? []).join(" ")), JSON.stringify(step.info));
      eq((await sql("SELECT notified_at FROM error_events WHERE id = $1", [later])).rows[0].notified_at, null);
      eq((await notes("viet.vu@luuxa.local", "system.error_digest", since)).length, 0, "không có bản tóm tắt thứ hai trong ngày");
      eq((await notes("bao.pham@luuxa.local", "finance.bank_unmatched", since)).length, 0, "tuần này đã nhắc ngân hàng");
    });

    await test("Xem trước tác vụ (dry): ops-digest chỉ ghi chú, không gửi và không ghi gì", async () => {
      await sql("DELETE FROM system_post_log WHERE key = $1", [`error-digest:${today}`]);
      const dry = await admin.post("/api/v1/integrations/cron/run", { slot: "morning", dry: true });
      eq(dry.status, 200, JSON.stringify(dry.json));
      const step = dry.json.steps.find((s) => s.name === "ops-digest");
      ok(step && step.ok, JSON.stringify(step));
      ok((step.info ?? []).some((t) => /\(xem trước\) sẽ gửi Admin tóm tắt/.test(t)), JSON.stringify(step.info));
      eq((await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key = $1", [`error-digest:${today}`])).rows[0].n, 0, "xem trước không ghi khóa chống trùng");
      eq((await sql("SELECT notified_at FROM error_events WHERE id = $1", [created.errors.at(-1)])).rows[0].notified_at, null, "xem trước không đánh dấu");
    });

    // ------------------------------------------------------------ nhật ký hoạt động
    await test("Nhật ký hoạt động: lọc theo hành động READ_SENSITIVE + trả cột LÝ DO; tìm theo lý do; trang 500 dòng cho xuất Excel", async () => {
      const m = (await sql("SELECT id FROM members WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1")).rows[0].id;
      const reason = `Kiểm tra hồ sơ ${tag}`;
      const rv = await admin.post(`/api/v1/members/${m}/national-id`, { reason });
      eq(rv.status, 200, JSON.stringify(rv.json));
      const list = await admin.get(`/api/v1/activity/changes?action=READ_SENSITIVE&q=${encodeURIComponent(tag)}`);
      eq(list.status, 200, JSON.stringify(list.json));
      eq(list.json.items.length, 1, "đúng một bản ghi xem dữ liệu nhạy cảm của bộ thử");
      const it = list.json.items[0];
      eq(it.reason, reason);
      eq(it.action, "READ_SENSITIVE");
      eq(it.actionLabel, "Xem dữ liệu nhạy cảm");
      eq(it.entityId, m);
      const upd = await admin.get("/api/v1/activity/changes?action=UPDATE&limit=500");
      eq(upd.status, 200, "trang 500 dòng (xuất Excel)");
      ok(upd.json.items.every((x) => x.action === "UPDATE" && "reason" in x), "lọc đúng hành động + mọi dòng có cột lý do");
      eq((await admin.get("/api/v1/activity/changes?action=HACK")).status, 400, "hành động lạ");
      eq((await admin.get("/api/v1/activity?limit=501")).status, 400, "quá 500 dòng/trang");
      eq((await admin.get("/api/v1/activity/logins?limit=500")).status, 200);
      eq((await head.get("/api/v1/activity/changes?action=READ_SENSITIVE")).status, 403, "Trưởng nhà không xem nhật ký hoạt động");
    });

    await test("Báo lỗi giao diện của người ĐÃ đăng nhập: vào nhật ký lỗi nhưng KHÔNG thành “thao tác” trong Nhật ký hoạt động", async () => {
      await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
      const since = await dbNow();
      const r = await member.post("/api/v1/public/client-error", { kind: "window", message: `${tag} loi giao dien thu`, path: "/cai-dat" });
      eq(r.status, 200, JSON.stringify(r.json));
      let rec;
      for (let i = 0; i < 10 && !rec; i++) {
        await wait(300);
        rec = (await sql("SELECT id FROM error_events WHERE message LIKE $1", [`${tag} loi giao dien thu%`])).rows[0];
      }
      ok(rec, "lỗi giao diện phải vào error_events");
      eq((await sql("SELECT count(*)::int AS n FROM activity_logs WHERE route = '/api/v1/public/client-error' AND occurred_at >= $1", [since])).rows[0].n, 0, "không ghi activity_logs");
      await sql("DELETE FROM error_events WHERE message LIKE $1", [`${tag} loi giao dien thu%`]);
      await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'client-error:%'");
    });

    // ------------------------------------------------------------ AI: ngân sách + ngắt mạch lưu CSDL
    let mock = null;
    try {
      mock = await startAiMock();
    } catch (e) {
      console.log(`      (bỏ qua ca AI: không mở được máy chủ giả cổng ${AI_MOCK_PORT}: ${e.message})`);
    }
    if (mock) {
      const settingsBefore = (await admin.get("/api/v1/settings")).json.items.find((s) => s.key === "feature.ai.enabled")?.value;
      const taskBefore = (await sql("SELECT is_enabled FROM ai_task_types WHERE code = 'finance.dues_message'")).rows[0]?.is_enabled;
      const budgetBefore = (await sql("SELECT limit_vnd, used_vnd, alert_threshold_pct, hard_stop FROM ai_budgets WHERE month = date_trunc('month', app.local_today())::date")).rows[0];
      const ym = today.slice(0, 7);
      const runAi = () => admin.post("/api/v1/ai/run", { task: "finance.dues_message", input: { amountVnd: 300000 + Math.floor(Math.random() * 50000) * 2, dueDate: "2026-11-05" } });
      try {
        await sql("DELETE FROM ai_provider_state");
        eq((await admin.patch("/api/v1/settings", { changes: [{ key: "feature.ai.enabled", value: true }] })).status, 200, "bật công tắc AI");
        eq((await admin.patch("/api/v1/ai/tasks/finance.dues_message", { enabled: true })).status, 200, "bật tác vụ nhắc quỹ");

        await test("Ngân sách AI: chi phí tháng chạm ngưỡng cảnh báo ⇒ Admin nhận thông báo một lần (khóa ai-budget:<tháng>:<mức>)", async () => {
          eq((await admin.req("PUT", "/api/v1/ai/budget", { limitVnd: 1000, alertThresholdPct: 80, hardStop: true })).status, 200);
          await sql("UPDATE ai_budgets SET used_vnd = 790 WHERE month = date_trunc('month', app.local_today())::date");
          await sql("DELETE FROM system_post_log WHERE key LIKE $1", [`ai-budget:${ym}:%`]);
          const since = await dbNow();
          mock.state.groq = "ok";
          const r = await runAi();
          eq(r.status, 200, JSON.stringify(r.json));
          let got = [];
          for (let i = 0; i < 15 && !got.length; i++) {
            await wait(300);
            got = (await notes("viet.vu@luuxa.local", "system.ops_alert", since)).filter((n) => /ngân sách/.test(n.title));
          }
          ok(got.length === 1 && got[0].payload?.link === "/cai-dat?tab=ai", `Admin nhận cảnh báo ngân sách: ${JSON.stringify(got)}`);
          ok(/đạt \d+% ngân sách/.test(got[0].title), got[0].title);
          eq((await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key = $1", [`ai-budget:${ym}:80`])).rows[0].n, 1);
          // lần sau cùng mức ⇒ không báo lại
          await runAi();
          await wait(800);
          eq((await notes("viet.vu@luuxa.local", "system.ops_alert", since)).filter((n) => /ngân sách/.test(n.title)).length, 1, "không báo lại cùng mức");
        });

        await test("Ngắt mạch AI lưu CSDL: Groq lỗi ⇒ ai_provider_state ghi 1 lỗi (chỉ mã trạng thái); thành công sau đó ⇒ xóa đếm lỗi; Hệ thống hiện trạng thái", async () => {
          eq((await admin.req("PUT", "/api/v1/ai/budget", { limitVnd: 100000 })).status, 200);
          mock.state.groq = "down";
          mock.state.gemini = "ok";
          const r = await runAi();
          eq(r.status, 200, JSON.stringify(r.json));
          eq(r.json.provider, "gemini", "Groq lỗi ⇒ dự phòng Gemini");
          const row = (await sql("SELECT failures, open_until, last_error FROM ai_provider_state WHERE provider = 'groq'")).rows[0];
          ok(row && row.failures === 1 && row.open_until === null, `đếm 1 lỗi: ${JSON.stringify(row)}`);
          ok(/HTTP 503/.test(row.last_error) && !/Chào cả nhà/.test(row.last_error), "chỉ lưu mã trạng thái, không lưu nội dung");
          const st = (await admin.get("/api/v1/system/status")).json.channels.ai.providers.find((p) => p.provider === "groq");
          eq(st.failures, 1);
          mock.state.groq = "ok";
          const r2 = await runAi();
          eq(r2.json.provider, "groq");
          eq((await sql("SELECT failures FROM ai_provider_state WHERE provider = 'groq'")).rows[0].failures, 0, "thành công ⇒ xóa đếm lỗi");
        });
      } finally {
        await admin.patch("/api/v1/settings", { changes: [{ key: "feature.ai.enabled", value: settingsBefore ?? false }] }).catch(() => {});
        if (taskBefore === false) await admin.patch("/api/v1/ai/tasks/finance.dues_message", { enabled: false }).catch(() => {});
        if (budgetBefore) {
          await sql("UPDATE ai_budgets SET limit_vnd = $1, used_vnd = $2, alert_threshold_pct = $3, hard_stop = $4 WHERE month = date_trunc('month', app.local_today())::date", [
            budgetBefore.limit_vnd,
            budgetBefore.used_vnd,
            budgetBefore.alert_threshold_pct,
            budgetBefore.hard_stop,
          ]).catch(() => {});
        }
        await sql("DELETE FROM ai_provider_state").catch(() => {});
        await new Promise((r) => mock.server.close(r));
      }
    }
  } finally {
    // dọn dữ liệu thử: lượt chạy, lỗi, giao dịch ngân hàng; trả lại thời gian các lượt sao lưu đã đẩy lùi
    if (created.runs.length) await sql("DELETE FROM job_runs WHERE id = ANY($1::uuid[])", [created.runs]).catch(() => {});
    if (created.aged.length) await sql("UPDATE job_runs SET started_at = started_at + interval '3 days', finished_at = finished_at + interval '3 days' WHERE id = ANY($1::uuid[])", [created.aged]).catch(() => {});
    await sql("DELETE FROM error_events WHERE fingerprint LIKE $1", [`opsmon-${tag}-%`]).catch(() => {});
    if (created.bank.length) await sql("DELETE FROM bank_statement_lines WHERE id = ANY($1::uuid[])", [created.bank]).catch(() => {});
    await sql("DELETE FROM rate_limit_hits WHERE key = 'ops-heartbeat'").catch(() => {});
  }
}
