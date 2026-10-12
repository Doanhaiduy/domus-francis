// Kiểm thử QUYỀN RIÊNG TƯ — "Tải dữ liệu của tôi" + yêu cầu về dữ liệu cá nhân (data_subject_requests, db/app/1046):
//   • GET /api/v1/me/export: tệp JSON (Content-Disposition) chỉ chứa dữ liệu của CHÍNH người tải; CCCD + SĐT phụ huynh chỉ 4 số cuối;
//     ghi nhật ký kiểm toán EXPORT; chưa đăng nhập ⇒ 401
//   • thành viên gửi yêu cầu (mô tả bắt buộc với loại cần mô tả), chỉ thấy yêu cầu của mình; không gửi trạng thái/hạn hộ được;
//     người quản lý (privacy.manage) thấy tất cả + đổi trạng thái + trả lời ⇒ người gửi nhận thông báo system.data_request;
//     người quản lý nhận thông báo khi có yêu cầu mới; quá hạn 72 giờ ⇒ overdue; tối đa 5 yêu cầu mở/người
//   • yêu cầu xóa của người ĐÃ RỜI NHÀ ⇒ người quản lý ẩn danh hóa (gõ đúng họ tên) — giữ sổ quỹ, yêu cầu tự đóng
import pg from "pg";

/** Dọn thành viên thử: xóa mềm (ràng buộc: hồ sơ xóa mềm phải ở trạng thái rời nhà / cựu thành viên). */
const CLEANUP_SQL = `UPDATE members
    SET status = CASE WHEN status IN ('left', 'alumni') THEN status ELSE 'left'::member_status_t END,
        left_on = COALESCE(left_on, GREATEST(app.local_today(), joined_on)),
        left_reason = COALESCE(left_reason, 'Dữ liệu kiểm thử'),
        deleted_at = now()
  WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`;

export async function run({ as, test, eq, ok, section, Client, pgConfig }) {
  section("Quyền riêng tư — tải dữ liệu của tôi & yêu cầu về dữ liệu");
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
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const created = [];

  async function freshMember(label) {
    const email = `pd.${label}.${tag}@luuxa.local`;
    const fullName = `Antôn Dữ Liệu ${label} ${tag}`;
    const r = await head.post("/api/v1/members", { fullName, email, createAccount: true, roomCode: null });
    if (r.status !== 201) throw new Error(`tạo thành viên lỗi ${r.status} ${JSON.stringify(r.json)}`);
    created.push(r.json.id);
    const c = await new Client(email).login(email, r.json.account.temporaryPassword);
    const ch = await c.post("/api/v1/auth/password", { currentPassword: r.json.account.temporaryPassword, newPassword: "MatKhauDuLieu2026x" });
    if (ch.status !== 200) throw new Error(`đổi mật khẩu tạm lỗi ${ch.status}`);
    for (let i = 0; i < 8; i++) {
      if ((await c.get("/api/v1/data-requests")).status === 200) break;
      await wait(700);
    }
    return { id: r.json.id, email, fullName, c };
  }

  // ---------------------------------------------------------------- tải dữ liệu của tôi
  await test("Chưa đăng nhập ⇒ 401", async () => {
    const anon = await new Client("pd-anon").init();
    eq((await anon.get("/api/v1/me/export")).status, 401);
  });

  await test("Tải dữ liệu của tôi: tệp JSON tải về, đúng người, CCCD + SĐT phụ huynh chỉ 4 số cuối, có ghi chú cách xem đầy đủ", async () => {
    const res = await member.get("/api/v1/me/export", { raw: true });
    eq(res.status, 200);
    ok(/attachment; filename="du-lieu-ca-nhan-\d{4}-\d{2}-\d{2}\.json"/.test(res.headers.get("content-disposition") ?? ""), "Content-Disposition: " + res.headers.get("content-disposition"));
    ok((res.headers.get("content-type") ?? "").includes("application/json"));
    eq(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    const j = JSON.parse(text);
    const me = (await member.get("/api/v1/auth/me")).json;
    eq(j.profile.fullName, me.member.fullName, "hồ sơ của chính mình");
    eq(j.account.loginEmail, "tuan.nguyen@luuxa.local");
    ok(j.meta.format === "luuxa-personal-data/1" && j.meta.legalVersion === "1.2", "meta");
    ok(Object.keys(j.meta.sections).length >= 25, "liệt kê các mục");
    if (j.privateDetails?.nationalIdMasked) ok(/^(•••• ){2}\d{4}$/.test(j.privateDetails.nationalIdMasked), "CCCD che: " + j.privateDetails.nationalIdMasked);
    for (const g of j.guardians) ok(g.phoneMasked === null || /^•••• \d{4}$/.test(g.phoneMasked), "SĐT phụ huynh che: " + g.phoneMasked);
    ok(!/"(national_id|phone)_enc"|nationalIdFull/.test(text), "không có trường mã hóa");
    // không lộ dãy số CCCD đầy đủ (12 số) ở bất kỳ đâu
    const nid = (await sql("SELECT national_id_last4 FROM member_private_details WHERE member_id = $1", [me.member.id])).rows[0]?.national_id_last4;
    if (nid) ok(!new RegExp(`\\d{8}${nid}`).test(text), "không có số CCCD đầy đủ");
    ok(j.meta.notes.some((n) => /4 số cuối/.test(n) && /Hồ sơ cá nhân/.test(n)), "ghi chú cách xem đầy đủ");
    ok(Array.isArray(j.consents) && j.consents.length > 0, "có bằng chứng đồng ý");
    ok(Array.isArray(j.devices) && j.devices.length > 0, "có thiết bị đăng nhập");
  });

  await test("Tệp chỉ có dữ liệu của mình: không lẫn họ tên / email / SĐT của thành viên khác", async () => {
    const m = await freshMember("xuat");
    const res = await m.c.get("/api/v1/me/export", { raw: true });
    eq(res.status, 200);
    const text = await res.text();
    const j = JSON.parse(text);
    eq(j.profile.fullName, m.fullName);
    const others = (await sql("SELECT m.full_name, u.email::text AS email, m.contact_phone_e164 AS phone FROM members m JOIN users u ON u.id = m.user_id WHERE m.id <> $1 AND m.deleted_at IS NULL AND m.full_name NOT LIKE '%' || $2 || '%'", [m.id, tag])).rows;
    for (const o of others) {
      ok(!text.includes(o.email), "lộ email người khác: " + o.email);
      ok(!text.includes(o.full_name), "lộ tên người khác: " + o.full_name);
      if (o.phone) ok(!text.includes(o.phone), "lộ SĐT người khác");
    }
    const audit = (await sql("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'EXPORT' AND entity_table = 'members' AND entity_id = $1", [m.id])).rows[0].n;
    ok(audit >= 1, "phải ghi nhật ký kiểm toán EXPORT");
  });

  // ---------------------------------------------------------------- yêu cầu về dữ liệu
  let reqId;
  await test("Gửi yêu cầu: loại cần mô tả mà thiếu ⇒ 400; loại lạ ⇒ 400; hợp lệ ⇒ 201 + hạn 72 giờ", async () => {
    eq((await member.post("/api/v1/data-requests", { type: "other" })).status, 400, "loại 'khác' cần mô tả");
    eq((await member.post("/api/v1/data-requests", { type: "rectification", details: "ngắn" })).status, 400);
    eq((await member.post("/api/v1/data-requests", { type: "khong-co" })).status, 400);
    const r = await member.post("/api/v1/data-requests", { type: "rectification", details: `Ngày vào nhà của tôi bị ghi sai, đúng là 09/2024 (${tag})` });
    eq(r.status, 201, JSON.stringify(r.json));
    reqId = r.json.id;
    const row = (await sql("SELECT status::text AS status, extract(epoch FROM due_at - received_at)::int AS secs FROM data_subject_requests WHERE id = $1", [reqId])).rows[0];
    eq(row.status, "received");
    eq(row.secs, 72 * 3600, "hạn phản hồi 72 giờ");
  });

  await test("Người quản lý (Trưởng nhà, Admin) nhận thông báo system.data_request có liên kết tới tab Yêu cầu dữ liệu", async () => {
    let n = [];
    for (let i = 0; i < 6 && !n.length; i++) {
      n = (await sql("SELECT payload FROM notifications WHERE type_code = 'system.data_request' AND entity_id = $1", [reqId])).rows;
      if (!n.length) await wait(400);
    }
    ok(n.length >= 2, "Trưởng nhà + Admin phải nhận thông báo: " + n.length);
    ok(n.every((x) => (x.payload?.link ?? "").startsWith("/thanh-vien?tab=data-requests")), "liên kết: " + JSON.stringify(n[0]?.payload));
  });

  await test("Thành viên chỉ thấy yêu cầu của mình; người khác không thấy; không gửi được trạng thái/hạn hộ", async () => {
    const mine = (await member.get("/api/v1/data-requests")).json;
    eq(mine.canManage, false);
    eq(mine.all, null, "thành viên không có danh sách tất cả");
    ok(mine.mine.some((x) => x.id === reqId), "thấy yêu cầu của mình");
    const o = (await other.get("/api/v1/data-requests")).json;
    eq(o.mine.some((x) => x.id === reqId), false, "người khác không thấy");
    eq(o.all, null);
    // cố gửi kèm trạng thái/hạn ⇒ bị bỏ qua (schema) và không có quyền cột
    const r = await other.post("/api/v1/data-requests", { type: "access", status: "completed", dueAt: "2000-01-01T00:00:00Z" });
    eq(r.status, 201);
    eq((await sql("SELECT status::text AS s FROM data_subject_requests WHERE id = $1", [r.json.id])).rows[0].s, "received");
    await sql("UPDATE data_subject_requests SET status = 'rejected', completed_at = now(), resolution_note = 'Dọn dữ liệu thử' WHERE id = $1", [r.json.id]);
  });

  await test("Thành viên không đổi trạng thái / trả lời được (403)", async () => {
    eq((await member.patch(`/api/v1/data-requests/${reqId}`, { status: "completed", resolutionNote: "Tự hoàn tất" })).status, 403);
    eq((await other.patch(`/api/v1/data-requests/${reqId}`, { status: "in_progress" })).status, 403);
  });

  await test("Người quản lý thấy tất cả (kèm tên + trạng thái cư trú của người gửi); quá hạn ⇒ overdue", async () => {
    const all = (await head.get("/api/v1/data-requests")).json;
    eq(all.canManage, true);
    const mineOnly = (await head.get("/api/v1/data-requests?scope=mine")).json;
    eq(mineOnly.all, null, "?scope=mine không tải danh sách của người quản lý");
    eq(mineOnly.canManage, true);
    const it = all.all.find((x) => x.id === reqId);
    ok(it, "người quản lý phải thấy");
    ok(it.member?.name && it.member.status === "active", "kèm người gửi: " + JSON.stringify(it.member));
    eq(it.overdue, false);
    await sql("UPDATE data_subject_requests SET received_at = now() - interval '80 hours', due_at = now() - interval '8 hours' WHERE id = $1", [reqId]);
    const again = (await admin.get("/api/v1/data-requests")).json;
    const it2 = again.all.find((x) => x.id === reqId);
    eq(it2.overdue, true, "quá 72 giờ ⇒ quá hạn");
    ok(again.overdueCount >= 1 && again.openCount >= 1, "đếm quá hạn / đang mở");
    eq(again.all[0].overdue, true, "yêu cầu quá hạn lên đầu danh sách");
  });

  await test("Hoàn tất / từ chối mà không trả lời ⇒ 400; trả lời ⇒ người gửi nhận thông báo + thấy câu trả lời", async () => {
    eq((await head.patch(`/api/v1/data-requests/${reqId}`, { status: "completed" })).status, 400, "thiếu trả lời");
    eq((await head.patch(`/api/v1/data-requests/${reqId}`, { status: "rejected", resolutionNote: "ok" })).status, 400, "trả lời quá ngắn");
    eq((await head.patch(`/api/v1/data-requests/${reqId}`, { status: "in_progress" })).status, 200);
    const r = await head.patch(`/api/v1/data-requests/${reqId}`, { status: "completed", resolutionNote: `Đã sửa ngày vào nhà thành 09/2024 (${tag}).` });
    eq(r.status, 200, JSON.stringify(r.json));
    const mine = (await member.get("/api/v1/data-requests")).json.mine.find((x) => x.id === reqId);
    eq(mine.status, "completed");
    ok(mine.resolutionNote?.includes(tag) && mine.completedAt && mine.handledByName, "người gửi thấy trả lời + người xử lý");
    eq(mine.overdue, false, "đã đóng thì không còn quá hạn");
    const me = (await member.get("/api/v1/auth/me")).json;
    const n = (await sql("SELECT title, payload FROM notifications WHERE type_code = 'system.data_request' AND member_id = $1 AND entity_id = $2", [me.member.id, reqId])).rows;
    ok(n.length >= 1, "người gửi phải nhận thông báo");
    ok(n.some((x) => (x.payload?.link ?? "").startsWith("/cai-dat?tab=profile")), "liên kết về Hồ sơ cá nhân");
  });

  await test("Tối đa 5 yêu cầu đang mở mỗi người ⇒ yêu cầu thứ 6: 429", async () => {
    const m = await freshMember("gioihan");
    for (let i = 0; i < 5; i++) eq((await m.c.post("/api/v1/data-requests", { type: "access", details: `Lần ${i}` })).status, 201);
    const r = await m.c.post("/api/v1/data-requests", { type: "access" });
    eq(r.status, 429, JSON.stringify(r.json));
    eq(r.json.code, "TOO_MANY_OPEN");
    await sql("UPDATE data_subject_requests SET status = 'rejected', completed_at = now(), resolution_note = 'Dọn dữ liệu thử' WHERE member_id = $1 AND status = 'received'", [m.id]);
  });

  // ---------------------------------------------------------------- yêu cầu xóa ⇒ ẩn danh hóa
  await test("Yêu cầu xóa của người ĐÃ RỜI NHÀ ⇒ người quản lý ẩn danh hóa (gõ đúng họ tên), giữ sổ quỹ, yêu cầu tự đóng", async () => {
    const m = await freshMember("xoa");
    eq((await m.c.req("PUT", "/api/v1/consents", { purpose: "catholic_profile", granted: true })).status, 200);
    eq((await m.c.patch(`/api/v1/members/${m.id}`, { holyName: "Giacôbê", parish: "Giáo xứ Xóa Thử" })).status, 200);
    const pay = await m.c.req("PUT", `/api/v1/members/${m.id}/payment-account`, { bankBin: "970436", bankName: "Vietcombank", accountNo: "0123456789", accountName: "NGUOI THU" });
    ok([200, 201].includes(pay.status), "khai tài khoản nhận tiền: " + pay.status + " " + JSON.stringify(pay.json));
    const r = await m.c.post("/api/v1/data-requests", { type: "erasure", details: "Tôi đã rời nhà, xin xóa dữ liệu cá nhân." });
    eq(r.status, 201);
    const id = r.json.id;
    // còn đang ở ⇒ chặn
    const still = await head.post(`/api/v1/data-requests/${id}/anonymize`, { confirmName: m.fullName, reason: "Thành viên yêu cầu xóa dữ liệu" });
    eq(still.status, 422, JSON.stringify(still.json));
    eq(still.json.code, "MEMBER_STILL_ACTIVE");
    // chuyển trạng thái rời nhà (người quản lý)
    const st = await head.post(`/api/v1/members/${m.id}/status`, { status: "left", leftOn: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }), reason: "Ra trường" });
    eq(st.status, 200, JSON.stringify(st.json));
    eq((await member.post(`/api/v1/data-requests/${id}/anonymize`, { confirmName: m.fullName, reason: "Thành viên yêu cầu xóa dữ liệu" })).status, 403, "thành viên thường không ẩn danh được");
    const wrong = await head.post(`/api/v1/data-requests/${id}/anonymize`, { confirmName: "Tên Khác Hẳn", reason: "Thành viên yêu cầu xóa dữ liệu" });
    eq(wrong.status, 400, "gõ sai họ tên ⇒ chặn");
    const done = await head.post(`/api/v1/data-requests/${id}/anonymize`, { confirmName: m.fullName.toUpperCase(), reason: "Thành viên đã rời nhà yêu cầu xóa dữ liệu cá nhân" });
    eq(done.status, 200, JSON.stringify(done.json));
    const row = (
      await sql(
        `SELECT m.full_name, m.contact_email, u.status::text AS ustatus, u.email::text AS uemail,
                (SELECT count(*)::int FROM catholic_profiles WHERE member_id = m.id) AS cp,
                (SELECT count(*)::int FROM member_payment_accounts WHERE member_id = m.id) AS pay,
                (SELECT count(*)::int FROM consents WHERE member_id = m.id AND withdrawn_at IS NULL) AS active_consents,
                (SELECT count(*)::int FROM consents WHERE member_id = m.id) AS consents_kept,
                (SELECT status::text FROM data_subject_requests WHERE id = $2) AS dsr,
                (SELECT count(*)::int FROM audit_logs WHERE entity_table = 'members' AND entity_id = m.id::text AND reason LIKE 'MEMBER_ANONYMIZED%') AS audit
           FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
        [m.id, id],
      )
    ).rows[0];
    eq(row.full_name, "[Đã ẩn danh]");
    eq(row.contact_email, null);
    eq(row.ustatus, "disabled");
    ok(row.uemail.endsWith("@an-danh.invalid"), "email đăng nhập đã ẩn danh");
    eq(row.cp, 0, "hồ sơ Công giáo bị xóa");
    eq(row.pay, 0, "tài khoản nhận tiền bị xóa");
    eq(row.active_consents, 0, "mọi đồng ý đã rút");
    ok(row.consents_kept >= 1, "bằng chứng đồng ý vẫn giữ");
    eq(row.dsr, "completed", "yêu cầu tự đóng");
    ok(row.audit >= 1, "nhật ký kiểm toán MEMBER_ANONYMIZED");
    eq((await head.post(`/api/v1/data-requests/${id}/anonymize`, { confirmName: "[Đã ẩn danh]", reason: "Gọi lại lần hai cho chắc" })).status, 409, "ẩn danh lần hai ⇒ 409");
    // tài khoản không đăng nhập được nữa
    const login = await (await new Client("pd-gone").init()).post("/api/v1/auth/login", { identifier: m.email, password: "MatKhauDuLieu2026x" });
    ok(login.status >= 400, "tài khoản đã ẩn danh không đăng nhập được: " + login.status);
  });

  await test("Dọn dữ liệu thử", async () => {
    await sql(CLEANUP_SQL, [created]);
    await sql("UPDATE data_subject_requests SET status = 'rejected', completed_at = COALESCE(completed_at, now()), resolution_note = COALESCE(resolution_note, 'Dọn dữ liệu thử') WHERE details LIKE '%' || $1 || '%' AND status IN ('received','in_progress')", [tag]);
    ok(true);
  });
}
