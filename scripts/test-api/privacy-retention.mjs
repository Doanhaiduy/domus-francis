// Kiểm thử QUYỀN RIÊNG TƯ — hạn lưu dữ liệu người đã rời nhà (khóa privacy.left_member_retention_days, bước cron tối "privacy-retention",
// app.fn_apply_member_retention + app.fn_anonymize_member bản db/app/1046):
//   • 0 = tắt (mặc định) ⇒ cron không ẩn danh ai
//   • bật (30 ngày) ⇒ lượt tối đầu tiên chỉ BÁO TRƯỚC người quản lý (system.privacy_retention + khóa system_post_log), chưa ẩn danh;
//     đã báo ≥ 7 ngày (lùi khóa bằng pgConfig) ⇒ lượt sau ẩn danh hóa hồ sơ "rời nhà" quá hạn
//   • KHÔNG đụng: người đang ở, người rời nhà chưa quá hạn, cựu thành viên (alumni), sổ quỹ (ledger_entries)
//   • xem trước (dry) không ghi gì
import pg from "pg";

/** Dọn thành viên thử: xóa mềm (ràng buộc: hồ sơ xóa mềm phải ở trạng thái rời nhà / cựu thành viên). */
const CLEANUP_SQL = `UPDATE members
    SET status = CASE WHEN status IN ('left', 'alumni') THEN status ELSE 'left'::member_status_t END,
        left_on = COALESCE(left_on, GREATEST(app.local_today(), joined_on)),
        left_reason = COALESCE(left_reason, 'Dữ liệu kiểm thử'),
        deleted_at = now()
  WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`;

const CRON_SECRET = "test-cron-secret-0001"; // máy chủ thử (scripts/test-api.mjs) đặt sẵn
const KEY = "privacy.left_member_retention_days";

export async function run({ as, test, eq, ok, section, BASE, Client, pgConfig }) {
  section("Quyền riêng tư — hạn lưu dữ liệu & tự ẩn danh người đã rời nhà (cron tối)");
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
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const prev = (await sql("SELECT value FROM settings WHERE key = $1", [KEY])).rows[0]?.value ?? 0;
  const created = [];

  /** Chạy lượt cron tối; trả thông tin bước privacy-retention (các bước khác có thể lỗi do dịch vụ giả không chạy — không ảnh hưởng). */
  async function evening() {
    const res = await fetch(`${BASE}/api/cron/daily?slot=evening`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    const j = await res.json().catch(() => ({}));
    const step = (j.steps ?? []).find((s) => s.name === "privacy-retention");
    if (!step) throw new Error(`không thấy bước privacy-retention (HTTP ${res.status}): ${JSON.stringify(j).slice(0, 400)}`);
    return step;
  }
  async function setRetention(days) {
    const r = await admin.patch("/api/v1/settings", { changes: [{ key: KEY, value: days }] });
    if (r.status !== 200) throw new Error(`đặt hạn lưu lỗi ${r.status} ${JSON.stringify(r.json)}`);
  }
  async function leftMember(label, daysAgo, status = "left") {
    const email = `pr.${label}.${tag}@luuxa.local`;
    const fullName = `Gioan Hạn Lưu ${label} ${tag}`;
    const r = await head.post("/api/v1/members", { fullName, email, createAccount: true, roomCode: null });
    if (r.status !== 201) throw new Error(`tạo thành viên lỗi ${r.status} ${JSON.stringify(r.json)}`);
    created.push(r.json.id);
    if (status !== "active") {
      // ngày vào/rời lùi về quá khứ (ràng buộc: rời ≥ vào; trạng thái rời ⇔ có ngày rời)
      await sql(
        `UPDATE members SET joined_on = app.local_today() - ($2::int + 200), status = $3::member_status_t, left_on = app.local_today() - $2::int, left_reason = 'Thử hạn lưu'
          WHERE id = $1`,
        [r.json.id, daysAgo, status],
      );
    }
    return { id: r.json.id, email, fullName };
  }
  const state = async (id) =>
    (await sql("SELECT m.full_name, m.status::text AS status, u.status::text AS ustatus FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = $1", [id])).rows[0];
  const warned = async (id) => (await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key = $1", [`privacy-retention-warn:${id}`])).rows[0].n > 0;

  let A, B, C;
  try {
    await test("Khóa cấu hình cho phép 0 (= tắt); người thường không sửa được", async () => {
      const row = (await sql("SELECT value, min_value, max_value FROM settings WHERE key = $1", [KEY])).rows[0];
      ok(row, "khóa phải có trong bảng settings");
      eq(Number(row.min_value), 0, "min_value = 0 (0 = tắt)");
      await setRetention(0);
      const member = await as("tuan.nguyen@luuxa.local");
      ok((await member.patch("/api/v1/settings", { changes: [{ key: KEY, value: 10 }] })).status >= 400, "thành viên thường không sửa được");
    });

    await test("Chuẩn bị: A rời nhà 40 ngày, B rời nhà 5 ngày, C cựu thành viên (alumni) rời 400 ngày", async () => {
      A = await leftMember("a", 40);
      B = await leftMember("b", 5);
      C = await leftMember("c", 400, "alumni");
      eq((await state(A.id)).status, "left");
      eq((await state(C.id)).status, "alumni");
    });

    await test("Hạn lưu = 0 (tắt) ⇒ cron tối không ẩn danh, không báo trước", async () => {
      const step = await evening();
      eq(step.ok, true, JSON.stringify(step));
      ok((step.info ?? []).some((x) => /đang tắt/.test(x)), "ghi chú 'đang tắt': " + JSON.stringify(step.info));
      ok(!(await state(A.id)).full_name.startsWith("[Đã ẩn danh]"));
      eq(await warned(A.id), false);
    });

    await test("Xem trước (dry) với hạn lưu 30 ngày: chỉ đếm, không ghi gì", async () => {
      await setRetention(30);
      const r = await admin.post("/api/v1/integrations/cron/run", { slot: "evening", dry: true });
      eq(r.status, 200, JSON.stringify(r.json).slice(0, 300));
      const step = (r.json.steps ?? []).find((s) => s.name === "privacy-retention");
      ok(step && (step.info ?? []).some((x) => /xem trước/.test(x)), "ghi chú xem trước: " + JSON.stringify(step));
      eq(await warned(A.id), false, "xem trước không ghi khóa báo trước");
    });

    const ledgerBefore = (await sql("SELECT count(*)::int AS n, COALESCE(sum(amount_vnd), 0)::bigint AS s FROM ledger_entries")).rows[0];
    await test("Lượt tối đầu tiên (30 ngày): BÁO TRƯỚC người quản lý A (quá hạn) + B (sắp tới hạn), CHƯA ẩn danh ai", async () => {
      const step = await evening();
      eq(step.ok, true, JSON.stringify(step));
      eq(await warned(A.id), true, "A phải được báo trước");
      eq(await warned(B.id), true, "B (tới hạn trong 30 ngày) cũng được báo trước");
      eq(await warned(C.id), false, "cựu thành viên không bị báo");
      eq((await state(A.id)).full_name.startsWith("[Đã ẩn danh]"), false, "chưa đủ 7 ngày kể từ khi báo ⇒ chưa ẩn danh");
      const me = (await head.get("/api/v1/auth/me")).json.member.id;
      const n = (
        await sql(
          "SELECT title, body, payload FROM notifications WHERE member_id = $1 AND type_code = 'system.privacy_retention' AND title LIKE '%sắp được ẩn danh%' AND created_at > now() - interval '5 minutes' ORDER BY created_at DESC",
          [me],
        )
      ).rows;
      ok(n.length >= 1, "Trưởng nhà phải nhận thông báo báo trước");
      ok(/sắp được ẩn danh/.test(n[0].title) && (n[0].payload?.link ?? "").startsWith("/thanh-vien"), JSON.stringify(n[0]));
    });

    await test("Đã báo trước ≥ 7 ngày ⇒ lượt tối sau ẩn danh hóa A; B, C, người đang ở và sổ quỹ không bị đụng", async () => {
      await sql("UPDATE system_post_log SET created_at = now() - interval '8 days' WHERE key = ANY($1::text[])", [[`privacy-retention-warn:${A.id}`, `privacy-retention-warn:${B.id}`]]);
      const step = await evening();
      eq(step.ok, true, JSON.stringify(step));
      ok((step.info ?? []).some((x) => /Đã ẩn danh hóa \d+ hồ sơ/.test(x)), "ghi chú số hồ sơ đã ẩn danh: " + JSON.stringify(step.info));
      const a = await state(A.id);
      eq(a.full_name, "[Đã ẩn danh]");
      eq(a.ustatus, "disabled", "tài khoản bị khóa");
      ok(!(await state(B.id)).full_name.startsWith("[Đã ẩn danh]"), "B chưa quá hạn");
      ok(!(await state(C.id)).full_name.startsWith("[Đã ẩn danh]"), "cựu thành viên (alumni) không tự ẩn danh");
      const tuan = (await sql("SELECT full_name FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = 'tuan.nguyen@luuxa.local'")).rows[0];
      ok(tuan && tuan.full_name !== "[Đã ẩn danh]", "người đang ở không bị đụng");
      const ledgerAfter = (await sql("SELECT count(*)::int AS n, COALESCE(sum(amount_vnd), 0)::bigint AS s FROM ledger_entries")).rows[0];
      eq(String(ledgerAfter.s), String(ledgerBefore.s), "sổ quỹ không đổi");
      ok(ledgerAfter.n >= ledgerBefore.n, "không xóa bút toán");
      const audit = (await sql("SELECT count(*)::int AS n FROM audit_logs WHERE entity_table = 'members' AND entity_id = $1 AND reason LIKE 'MEMBER_ANONYMIZED%'", [A.id])).rows[0].n;
      ok(audit >= 1, "nhật ký kiểm toán");
      const me = (await head.get("/api/v1/auth/me")).json.member.id;
      const n = (await sql("SELECT count(*)::int AS n FROM notifications WHERE member_id = $1 AND type_code = 'system.privacy_retention' AND title LIKE 'Đã ẩn danh hóa%' AND created_at > now() - interval '5 minutes'", [me])).rows[0].n;
      ok(n >= 1, "báo người quản lý đã ẩn danh");
      // tài khoản đã ẩn danh không đăng nhập được
      const login = await (await new Client("pr-gone").init()).post("/api/v1/auth/login", { identifier: A.email, password: "x" });
      ok(login.status >= 400);
    });

    await test("Chạy lại: không ẩn danh lần hai, không báo trùng", async () => {
      const step = await evening();
      eq(step.ok, true);
      const n = (await sql("SELECT count(*)::int AS n FROM audit_logs WHERE entity_table = 'members' AND entity_id = $1 AND reason LIKE 'MEMBER_ANONYMIZED%'", [A.id])).rows[0].n;
      eq(n, 1, "chỉ ẩn danh một lần");
    });
  } finally {
    await setRetention(typeof prev === "number" ? prev : 0).catch(() => sql("UPDATE settings SET value = $2::jsonb WHERE key = $1", [KEY, JSON.stringify(prev)]));
    await sql(CLEANUP_SQL, [created]);
    await wait(10);
  }
}
