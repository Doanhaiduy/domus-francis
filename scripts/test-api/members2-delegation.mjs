// Kiểm thử gói E — Ủy quyền vai trò tạm thời (role_delegations, GET/POST /api/v1/delegations, DELETE /api/v1/delegations/:id):
// người giữ vai trò (Trưởng nhà) ủy quyền cho thành viên trong khoảng ngày (≤ 60 ngày, không Admin, phải đang giữ vai trò, có lý do);
// người được ủy quyền CÓ quyền của vai trò (phiên làm việc tính ủy quyền), nhận thông báo; thu hồi sớm ⇒ mất quyền; thành viên thường không tạo/thu hồi được;
// Admin (auth.role.assign) thấy tất cả và thu hồi hộ, người ủy quyền được báo.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Thành viên — ủy quyền vai trò tạm thời");
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
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà (house_head): auth.role.delegate
  const admin = await as("viet.vu@luuxa.local"); // auth.role.assign
  const treasurer = await as("bao.pham@luuxa.local"); // Thủ quỹ: không giữ vai trò Trưởng nhà
  const delegate = await as("kiet.do@luuxa.local"); // thành viên thường
  const other = await as("hieu.bui@luuxa.local");
  const idOf = async (c) => (await c.get("/api/v1/auth/me")).json.member.id;
  const delegateId = await idOf(delegate);
  const headId = await idOf(head);
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
  const created = [];
  // Quyền của vai trò Trưởng nhà dùng để kiểm: kiet chưa có discipline.manage
  const hasPerm = async (c, perm) => (await c.get("/api/v1/auth/me")).json.permissions.includes(perm);
  // Phiên làm việc có thể được đệm vài giây ⇒ chờ trạng thái mong muốn
  const waitPerm = async (c, perm, want) => {
    for (let i = 0; i < 12; i++) {
      if ((await hasPerm(c, perm)) === want) return true;
      await wait(2000);
    }
    return false;
  };
  const body = (extra = {}) => ({ roleCode: "house_head", delegateMemberId: delegateId, startsOn: today, endsOn: addDays(today, 5), reason: `Về quê dịp kiểm thử ${Date.now().toString(36)}`, ...extra });
  const count = async (memberId, type) => Number((await sql("SELECT count(*)::int AS n FROM notifications WHERE member_id = $1 AND type_code = $2", [memberId, type])).rows[0].n);

  try {
    await test("Danh sách: Trưởng nhà ủy quyền được vai trò mình giữ (không có Admin); thành viên thường không có quyền tạo", async () => {
      const a = (await head.get("/api/v1/delegations")).json;
      eq(a.canDelegate, true);
      ok(a.myRoles.some((r) => r.code === "house_head"), "Trưởng nhà ủy quyền được vai trò house_head");
      ok(!a.myRoles.some((r) => r.code === "admin"), "không ủy quyền Admin");
      eq(a.maxDays, 60);
      const b = (await delegate.get("/api/v1/delegations")).json;
      eq(b.canDelegate, false);
      eq(b.myRoles.length, 0);
    });

    await test("Kiểm tra dữ liệu: vai trò Admin, tự ủy quyền, quá 60 ngày, lý do ngắn, kết thúc trước bắt đầu ⇒ 400; không giữ vai trò ⇒ 400; thành viên thường ⇒ 403", async () => {
      eq((await head.post("/api/v1/delegations", body({ roleCode: "admin" }))).status, 400, "không ủy quyền Admin");
      eq((await head.post("/api/v1/delegations", body({ delegateMemberId: headId }))).status, 400, "không tự ủy quyền");
      eq((await head.post("/api/v1/delegations", body({ endsOn: addDays(today, 60) }))).status, 400, "61 ngày");
      eq((await head.post("/api/v1/delegations", body({ reason: "ngắn" }))).status, 400, "lý do ngắn");
      eq((await head.post("/api/v1/delegations", body({ startsOn: addDays(today, 5), endsOn: today }))).status, 400, "ngược ngày");
      const notHolder = await treasurer.post("/api/v1/delegations", body({ roleCode: "house_head" }));
      eq(notHolder.status, 400, JSON.stringify(notHolder.json));
      eq((await delegate.post("/api/v1/delegations", body({ delegateMemberId: await idOf(other) }))).status, 403, "thành viên thường không có quyền ủy quyền");
      eq((await head.post("/api/v1/delegations", body({ roleCode: "khong-co-vai-tro" }))).status, 404);
    });

    let first;
    await test("Tạo ủy quyền 6 ngày: người được ủy quyền CÓ quyền của vai trò trong phiên; được thông báo; hai bên đều thấy trong danh sách", async () => {
      ok(!(await hasPerm(delegate, "discipline.manage")), "trước ủy quyền chưa có quyền");
      const r = await head.post("/api/v1/delegations", body());
      eq(r.status, 200, JSON.stringify(r.json));
      first = r.json.id;
      created.push(first);
      ok(await waitPerm(delegate, "discipline.manage", true), "sau ủy quyền phải có quyền của Trưởng nhà");
      const me = (await delegate.get("/api/v1/auth/me")).json;
      ok(me.roles.includes("house_head"), "phiên có vai trò house_head: " + me.roles.join(","));
      eq((await delegate.get(`/api/v1/discipline/repeat?${new URLSearchParams({ memberId: headId })}`)).status, 200, "dùng được API cần quyền Trưởng nhà");
      ok((await count(delegateId, "delegation.received")) >= 1, "người nhận được thông báo");
      const mine = (await head.get("/api/v1/delegations")).json.items.find((i) => i.id === first);
      ok(mine && mine.asDelegator && mine.canRevoke && mine.phase === "active", JSON.stringify(mine));
      const theirs = (await delegate.get("/api/v1/delegations")).json.items.find((i) => i.id === first);
      ok(theirs && theirs.asDelegate, "người nhận thấy ủy quyền của mình: " + JSON.stringify(theirs));
      eq((await other.get("/api/v1/delegations")).json.items.some((i) => i.id === first), false, "người ngoài không thấy");
      const row = (await sql("SELECT ends_at - starts_at < interval '60 days' AS ok FROM role_delegations WHERE id = $1", [first])).rows[0];
      eq(row.ok, true);
    });

    await test("Ủy quyền trùng khoảng ngày (cùng vai trò, cùng người) ⇒ 409", async () => {
      const r = await head.post("/api/v1/delegations", body({ startsOn: addDays(today, 2), endsOn: addDays(today, 8) }));
      eq(r.status, 409, JSON.stringify(r.json));
      eq(r.json.code, "DELEGATION_OVERLAP");
    });

    await test("Người được ủy quyền và thành viên khác KHÔNG thu hồi được; Trưởng nhà thu hồi sớm ⇒ người nhận mất quyền + được báo; thu hồi lại ⇒ 409", async () => {
      // Người nhận ủy quyền Thủ quỹ (không có quyền gán vai trò) không tự thu hồi được; Thủ quỹ thu hồi được
      const tr = await treasurer.post("/api/v1/delegations", body({ roleCode: "treasurer", delegateMemberId: await idOf(other), reason: "Đi vắng ngắn ngày kiểm thử" }));
      eq(tr.status, 200, JSON.stringify(tr.json));
      created.push(tr.json.id);
      eq((await other.del(`/api/v1/delegations/${tr.json.id}`)).status, 403, "người nhận không thu hồi được");
      eq((await treasurer.del(`/api/v1/delegations/${tr.json.id}`)).status, 200, "người ủy quyền thu hồi được");
      eq((await other.del(`/api/v1/delegations/${first}`)).status, 404, "thành viên ngoài cuộc không thấy ủy quyền ⇒ 404");
      const before = await count(delegateId, "delegation.revoked");
      const r = await head.del(`/api/v1/delegations/${first}`);
      eq(r.status, 200, JSON.stringify(r.json));
      ok(await waitPerm(delegate, "discipline.manage", false), "thu hồi ⇒ mất quyền");
      ok((await count(delegateId, "delegation.revoked")) > before, "người nhận được báo thu hồi");
      eq((await head.del(`/api/v1/delegations/${first}`)).status, 409);
      const item = (await head.get("/api/v1/delegations")).json.items.find((i) => i.id === first);
      eq(item.phase, "revoked");
    });

    await test("Ủy quyền bắt đầu trong tương lai: chưa có quyền ngay (sắp hiệu lực); Admin thấy mọi ủy quyền và thu hồi hộ — người ủy quyền được báo", async () => {
      const r = await head.post("/api/v1/delegations", body({ startsOn: addDays(today, 3), endsOn: addDays(today, 10) }));
      eq(r.status, 200, JSON.stringify(r.json));
      const id = r.json.id;
      created.push(id);
      await wait(1500);
      eq(await hasPerm(delegate, "discipline.manage"), false, "chưa đến ngày ⇒ chưa có quyền");
      const seen = (await admin.get("/api/v1/delegations")).json.items.find((i) => i.id === id);
      ok(seen && seen.phase === "upcoming" && seen.canRevoke, "Admin thấy và thu hồi được: " + JSON.stringify(seen));
      const before = await count(headId, "delegation.revoked");
      eq((await admin.del(`/api/v1/delegations/${id}`)).status, 200);
      ok((await count(headId, "delegation.revoked")) > before, "người ủy quyền được báo khi Admin thu hồi hộ");
    });

    await test("Kiểm toán: tạo & thu hồi ủy quyền có ghi nhật ký (audit_logs)", async () => {
      const n = (await sql("SELECT count(*)::int AS n FROM audit_logs WHERE entity_table = 'role_delegations' AND entity_id = $1", [first])).rows[0].n;
      ok(n >= 2, `thiếu nhật ký: ${n}`);
    });
  } finally {
    for (const id of created) await sql("UPDATE role_delegations SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1", [id]);
  }
}
