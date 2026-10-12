// Kiểm thử QUYỀN RIÊNG TƯ — đồng ý Điều khoản sử dụng + Chính sách bảo mật theo PHIÊN BẢN (db/app/1046, src/content/legal.ts):
//   • tự đăng ký: thiếu acceptTerms ⇒ 400 TERMS_REQUIRED; có ⇒ bằng chứng (phiên bản 102, thời điểm, IP) lưu trên đơn, BẤT BIẾN; duyệt đơn ⇒ 2 dòng consents
//     đúng phiên bản, đúng thời điểm đăng ký ⇒ người mới KHÔNG bị hỏi lại
//   • tài khoản do người quản lý tạo (chưa từng xác nhận) / người chỉ có đồng ý phiên bản cũ ⇒ GET /api/v1/consents/legal báo required = true;
//     POST ⇒ ghi 2 đồng ý phiên bản hiện hành (IP + trình duyệt), gọi lại không ghi trùng, bản cũ được đánh dấu rút
//   • rút đồng ý "Lưu hồ sơ Công giáo" ⇒ XÓA hồ sơ Công giáo + Bí tích (không chỉ đặt withdrawn_at), rút luôn đồng ý chia sẻ
//   • quyền privacy.manage: Trưởng nhà + Admin
// Cuối bộ: các tài khoản demo xác nhận phiên bản hiện hành (như người dùng bấm "Tôi đã đọc và đồng ý") để ca giao diện của gói khác
// trên máy chủ thử dùng chung không bị hộp thoại bắt buộc che.
import pg from "pg";

/** Dọn thành viên thử: xóa mềm (ràng buộc: hồ sơ xóa mềm phải ở trạng thái rời nhà / cựu thành viên). */
const CLEANUP_SQL = `UPDATE members
    SET status = CASE WHEN status IN ('left', 'alumni') THEN status ELSE 'left'::member_status_t END,
        left_on = COALESCE(left_on, GREATEST(app.local_today(), joined_on)),
        left_reason = COALESCE(left_reason, 'Dữ liệu kiểm thử'),
        deleted_at = now()
  WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`;

const LEGAL_V = 102; // "1.2" — khớp LEGAL_VERSION (src/content/legal.ts)
const DEMO = [
  "duc.tran@luuxa.local",
  "bao.pham@luuxa.local",
  "viet.vu@luuxa.local",
  "phong.dang@luuxa.local",
  "khoi.hoang@luuxa.local",
  "khoa.ngo@luuxa.local",
  "tuan.nguyen@luuxa.local",
  "hieu.bui@luuxa.local",
  "kiet.do@luuxa.local",
  "nam.phan@luuxa.local",
  "phuoc.ly@luuxa.local",
  "long.le@luuxa.local",
];

export async function run({ as, test, eq, ok, section, Client, pgConfig }) {
  section("Quyền riêng tư — đồng ý Điều khoản & Chính sách theo phiên bản");
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
  const created = []; // member_id để dọn cuối bộ

  /** Thành viên mới do người quản lý tạo (kèm tài khoản, đã đổi mật khẩu tạm) — chưa từng xác nhận điều khoản. */
  async function freshMember(label) {
    const email = `pv.${label}.${tag}@luuxa.local`;
    const r = await head.post("/api/v1/members", { fullName: `Giuse Thử Riêng Tư ${label} ${tag}`, email, createAccount: true, roomCode: null });
    if (r.status !== 201) throw new Error(`tạo thành viên lỗi ${r.status} ${JSON.stringify(r.json)}`);
    created.push(r.json.id);
    const c = await new Client(email).login(email, r.json.account.temporaryPassword);
    const pw = "MatKhauRieng2026x";
    const ch = await c.post("/api/v1/auth/password", { currentPassword: r.json.account.temporaryPassword, newPassword: pw });
    if (ch.status !== 200) throw new Error(`đổi mật khẩu tạm lỗi ${ch.status}`);
    // chốt mật khẩu tạm được đệm ~2 giây ⇒ chờ API dùng được
    for (let i = 0; i < 8; i++) {
      if ((await c.get("/api/v1/consents/legal")).status === 200) break;
      await wait(700);
    }
    return { id: r.json.id, email, c };
  }

  await test("Quyền privacy.manage: Trưởng nhà + Admin có; thành viên thường không", async () => {
    ok((await head.get("/api/v1/auth/me")).json.permissions.includes("privacy.manage"), "Trưởng nhà thiếu privacy.manage");
    ok((await admin.get("/api/v1/auth/me")).json.roles.includes("admin"), "Admin");
    const roleRows = (await sql("SELECT r.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.permission_code = 'privacy.manage'")).rows.map((x) => x.code);
    ok(roleRows.includes("house_head") && roleRows.includes("admin"), "privacy.manage phải cấp cho house_head + admin: " + roleRows.join(","));
    ok(!(await member.get("/api/v1/auth/me")).json.permissions.includes("privacy.manage"), "thành viên không được có privacy.manage");
  });

  // ---------------------------------------------------------------- tự đăng ký
  await sql("DELETE FROM rate_limit_hits WHERE key LIKE 'register:%'");
  const regEmail = `pv.dangky.${tag}@luuxa.local`;
  const regName = `Phêrô Đăng Ký Riêng Tư ${tag}`;
  let appId;
  await test("Đăng ký thiếu tick đồng ý (acceptTerms) ⇒ 400 TERMS_REQUIRED, không tạo tài khoản", async () => {
    const anon = await new Client("pv-anon-1").init();
    const r = await anon.post("/api/v1/auth/register", { fullName: regName, email: regEmail, password: "MatKhau2026" });
    eq(r.status, 400, JSON.stringify(r.json));
    eq(r.json.code, "TERMS_REQUIRED");
    ok(/Điều khoản sử dụng/.test(r.json.detail ?? ""), "thông báo tiếng Việt");
    const r2 = await anon.post("/api/v1/auth/register", { fullName: regName, email: regEmail, password: "MatKhau2026", acceptTerms: false });
    eq(r2.status, 400);
    eq((await sql("SELECT count(*)::int AS n FROM users WHERE email = $1", [regEmail])).rows[0].n, 0, "không được tạo tài khoản");
  });

  await test("Đăng ký có tick đồng ý ⇒ 201; đơn lưu bằng chứng: phiên bản 102, thời điểm, IP, trình duyệt", async () => {
    const anon = await new Client("pv-anon-2").init();
    const r = await anon.post("/api/v1/auth/register", { fullName: regName, email: regEmail, password: "MatKhau2026", universityName: "ĐH Nha Trang", acceptTerms: true });
    eq(r.status, 201, JSON.stringify(r.json));
    const a = (await sql("SELECT id, terms_version, terms_accepted_at, host(terms_ip) AS ip, terms_user_agent FROM member_applications WHERE email = $1", [regEmail])).rows[0];
    ok(a, "phải có đơn");
    appId = a.id;
    eq(a.terms_version, LEGAL_V, "phiên bản đồng ý");
    ok(a.terms_accepted_at && Date.now() - new Date(a.terms_accepted_at).getTime() < 120_000, "thời điểm đồng ý");
    ok(a.ip, "IP lúc đồng ý");
  });

  await test("Bằng chứng đồng ý trên đơn là BẤT BIẾN (sửa ⇒ lỗi, kể cả quyền chủ DB)", async () => {
    let err = null;
    try {
      await sql("UPDATE member_applications SET terms_version = 1 WHERE id = $1", [appId]);
    } catch (e) {
      err = e;
    }
    ok(err && /không được sửa/.test(err.message), "phải chặn sửa bằng chứng: " + (err?.message ?? "không lỗi"));
  });

  await test("Duyệt đơn ⇒ 2 dòng consents (terms_of_use + privacy_notice_ack) đúng phiên bản + thời điểm đăng ký; người mới không bị hỏi lại", async () => {
    const r = await head.post(`/api/v1/applications/${appId}/approve`, { note: "Duyệt thử riêng tư" });
    eq(r.status, 200, JSON.stringify(r.json));
    created.push(r.json.memberId);
    const rows = (
      await sql(
        `SELECT c.purpose_code, c.policy_version, c.method, c.granted_at, a.terms_accepted_at, c.withdrawn_at, host(c.ip) AS ip, c.recorded_by = a.user_id AS by_self
           FROM consents c JOIN member_applications a ON a.resulting_member_id = c.member_id
          WHERE a.id = $1 ORDER BY c.purpose_code`,
        [appId],
      )
    ).rows;
    eq(rows.map((x) => x.purpose_code).join(","), "privacy_notice_ack,terms_of_use");
    for (const x of rows) {
      eq(x.policy_version, LEGAL_V);
      eq(x.method, "in_app");
      eq(new Date(x.granted_at).getTime(), new Date(x.terms_accepted_at).getTime(), "granted_at = lúc tick khi đăng ký");
      eq(x.withdrawn_at, null);
      ok(x.ip && x.by_self, "IP + người ghi = chính người đăng ký");
    }
    const c = await new Client("pv-approved").login(regEmail, "MatKhau2026");
    const st = await c.get("/api/v1/consents/legal");
    eq(st.status, 200, JSON.stringify(st.json));
    eq(st.json.version, "1.2");
    eq(st.json.accepted, true);
    eq(st.json.required, false, "đã đồng ý khi đăng ký ⇒ không hiện hộp thoại");
  });

  // ---------------------------------------------------------------- hộp thoại bắt buộc (ConsentGate)
  let fresh;
  await test("Tài khoản do người quản lý tạo (chưa từng xác nhận) ⇒ required = true", async () => {
    fresh = await freshMember("gate");
    const st = await fresh.c.get("/api/v1/consents/legal");
    eq(st.status, 200, JSON.stringify(st.json));
    eq(st.json.required, true);
    eq(st.json.accepted, false);
    eq(st.json.hadPrevious, false);
    eq(st.json.acceptedAt, null);
  });

  await test("“Tôi đã đọc và đồng ý” ⇒ ghi 2 đồng ý phiên bản hiện hành (IP + trình duyệt); gọi lại không ghi trùng", async () => {
    const r = await fresh.c.post("/api/v1/consents/legal", {});
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.accepted, true);
    eq(r.json.required, false);
    ok(r.json.acceptedAt, "có thời điểm đồng ý");
    eq((await fresh.c.post("/api/v1/consents/legal", {})).status, 200);
    const rows = (
      await sql(
        "SELECT purpose_code, policy_version, method, host(ip) AS ip, user_agent, evidence_note, withdrawn_at FROM consents WHERE member_id = $1 AND purpose_code IN ('terms_of_use','privacy_notice_ack') ORDER BY purpose_code",
        [fresh.id],
      )
    ).rows;
    eq(rows.length, 2, "đúng 2 dòng (không trùng): " + JSON.stringify(rows));
    for (const x of rows) {
      eq(x.policy_version, LEGAL_V);
      eq(x.method, "in_app");
      eq(x.withdrawn_at, null);
      ok(x.ip, "có IP");
      ok(/1\.2/.test(x.evidence_note ?? ""), "ghi chú nêu phiên bản văn bản");
    }
  });

  await test("Chỉ có đồng ý phiên bản cũ ⇒ được hỏi lại (hadPrevious); đồng ý lại ⇒ bản cũ đánh dấu rút, bản mới 102", async () => {
    const old = await freshMember("old");
    await sql(
      `INSERT INTO consents (member_id, purpose_code, policy_version, method, evidence_note)
       SELECT $1, c, 1, 'paper', 'Phiếu giấy (phiên bản cũ) — dữ liệu thử' FROM unnest(ARRAY['terms_of_use','privacy_notice_ack']) AS c`,
      [old.id],
    );
    const st = (await old.c.get("/api/v1/consents/legal")).json;
    eq(st.required, true, "phiên bản cũ ⇒ phải hỏi lại");
    eq(st.hadPrevious, true);
    ok(st.previousVersion, "nêu phiên bản đã đồng ý trước đó");
    eq((await old.c.post("/api/v1/consents/legal", {})).status, 200);
    const rows = (await sql("SELECT policy_version, withdrawn_at IS NOT NULL AS withdrawn FROM consents WHERE member_id = $1 AND purpose_code = 'terms_of_use' ORDER BY granted_at", [old.id])).rows;
    eq(rows.length, 2);
    eq(rows[0].policy_version, 1);
    eq(rows[0].withdrawn, true, "bản cũ được đánh dấu rút (giữ lịch sử)");
    eq(rows[1].policy_version, LEGAL_V);
    eq(rows[1].withdrawn, false);
    eq((await old.c.get("/api/v1/consents/legal")).json.required, false);
  });

  await test("Chưa đăng nhập ⇒ 401; consent_purposes đã nâng phiên bản 102 cho 2 mục đích", async () => {
    const anon = await new Client("pv-anon-3").init();
    eq((await anon.get("/api/v1/consents/legal")).status, 401);
    const v = (await sql("SELECT code, current_version FROM consent_purposes WHERE code IN ('terms_of_use','privacy_notice_ack')")).rows;
    ok(v.length === 2 && v.every((x) => x.current_version === LEGAL_V), JSON.stringify(v));
  });

  // ---------------------------------------------------------------- rút đồng ý hồ sơ Công giáo = xóa
  await test("Rút đồng ý “Lưu hồ sơ Công giáo” ⇒ XÓA hồ sơ Công giáo + Bí tích, rút luôn đồng ý chia sẻ", async () => {
    const m = await freshMember("cg");
    eq((await m.c.req("PUT", "/api/v1/consents", { purpose: "catholic_profile", granted: true })).status, 200);
    eq((await m.c.req("PUT", "/api/v1/consents", { purpose: "catholic_share_leadership", granted: true })).status, 200);
    const up = await m.c.patch(`/api/v1/members/${m.id}`, { holyName: "Phaolô", parish: "Giáo xứ Thử Riêng Tư", pastor: "Cha Giuse Thử", sacraments: ["Rửa tội", "Thêm sức"] });
    eq(up.status, 200, JSON.stringify(up.json));
    const before = (await sql("SELECT (SELECT count(*)::int FROM catholic_profiles WHERE member_id = $1) AS cp, (SELECT count(*)::int FROM member_sacraments WHERE member_id = $1) AS sac", [m.id])).rows[0];
    eq(before.cp, 1, "đã lưu hồ sơ Công giáo");
    ok(before.sac >= 1, "đã lưu Bí tích");
    const r = await m.c.req("PUT", "/api/v1/consents", { purpose: "catholic_profile", granted: false });
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.consented, false);
    eq(r.json.deleted?.catholicProfiles, 1, "báo đã xóa hồ sơ Công giáo");
    const after = (
      await sql(
        `SELECT (SELECT count(*)::int FROM catholic_profiles WHERE member_id = $1) AS cp,
                (SELECT count(*)::int FROM member_sacraments WHERE member_id = $1) AS sac,
                (SELECT count(*)::int FROM consents WHERE member_id = $1 AND purpose_code IN ('catholic_profile','catholic_share_leadership') AND withdrawn_at IS NULL) AS active,
                (SELECT count(*)::int FROM consents WHERE member_id = $1 AND purpose_code IN ('catholic_profile','catholic_share_leadership')) AS kept`,
        [m.id],
      )
    ).rows[0];
    eq(after.cp, 0, "hồ sơ Công giáo phải bị xóa");
    eq(after.sac, 0, "Bí tích phải bị xóa");
    eq(after.active, 0, "cả hai đồng ý đã rút");
    eq(after.kept, 2, "bằng chứng đồng ý vẫn giữ (đánh dấu rút)");
    const c2 = (await m.c.get("/api/v1/consents")).json;
    eq(c2.catholic_profile, false);
    eq(c2.catholic_share_leadership, false);
    // Chưa đồng ý lại thì không lưu được hồ sơ Công giáo nữa (trigger yêu cầu đồng ý)
    await m.c.patch(`/api/v1/members/${m.id}`, { holyName: "Phêrô" });
    eq((await sql("SELECT count(*)::int AS n FROM catholic_profiles WHERE member_id = $1", [m.id])).rows[0].n, 0, "không tự lưu lại khi chưa đồng ý");
  });

  await test("Rút đồng ý KHÁC (gắn thẻ ảnh) chỉ đặt withdrawn_at, không có trường deleted", async () => {
    eq((await member.req("PUT", "/api/v1/consents", { purpose: "photo_tagging", granted: true })).status, 200);
    const r = await member.req("PUT", "/api/v1/consents", { purpose: "photo_tagging", granted: false });
    eq(r.status, 200);
    eq(r.json.deleted, undefined);
    eq((await member.req("PUT", "/api/v1/consents", { purpose: "photo_tagging", granted: true })).status, 200, "bật lại như cũ");
  });

  // ---------------------------------------------------------------- dọn + tài khoản demo xác nhận phiên bản hiện hành
  await test("Dọn dữ liệu thử; tài khoản demo xác nhận phiên bản hiện hành (không còn bị hộp thoại chặn)", async () => {
    await sql(CLEANUP_SQL, [created]);
    for (const e of DEMO) {
      let c;
      try {
        c = await as(e);
      } catch {
        continue; // tài khoản không có ở DB này
      }
      const st = await c.get("/api/v1/consents/legal");
      if (st.status === 200 && st.json.required) eq((await c.post("/api/v1/consents/legal", {})).status, 200, e);
    }
    eq((await member.get("/api/v1/consents/legal")).json.required, false);
  });
}
