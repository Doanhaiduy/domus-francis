// Kiểm thử THÔNG BÁO + LIÊN KẾT THẲNG (gói B):
//   • giao việc sửa chữa ⇒ người được giao nhận thông báo facility.issue_assigned có link mở thẳng sự cố; giao lại đúng người đó (chỉ sửa ghi chú)
//     không báo lại; đổi người ⇒ người mới nhận; đổi trạng thái ⇒ người báo hỏng nhận thông báo có link; báo hỏng mới ⇒ Trưởng nhà nhận (có link)
//   • thông báo thiếu payload.link ⇒ hộp thư suy link theo LOẠI trước (rồi bảng / nhóm); link ngoài ("//…") bị bỏ
//   • mở từ thông báo đẩy (?n=<id>) ⇒ POST /api/v1/notifications/<id>/read đánh dấu đã đọc; không đánh dấu được thông báo của người khác
//   • biến {link} của tin nhóm Zalo = URL tuyệt đối (máy chủ Zalo GIẢ ở 127.0.0.1:3196 — không có lưu lượng ra ngoài); mẫu tùy chỉnh dùng được {link}
import http from "node:http";
import pg from "pg";

const MOCK_PORT = 3196;

function startZaloMock() {
  const state = { messages: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        if (/\/bot[^/]+\/sendMessage$/.test(req.url ?? "")) state.messages.push(JSON.parse(raw));
      } catch {
        /* bỏ qua */
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: "m1" } }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOCK_PORT, "127.0.0.1", () => resolve({ state, server }));
  });
}

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Thông báo giao việc sửa chữa, liên kết thẳng, đánh dấu đã đọc, {link} trong tin Zalo");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const tag = `inbox-n-${Date.now().toString(36)}`;
  const head = await as("duc.tran@luuxa.local");
  const admin = await as("viet.vu@luuxa.local");
  const reporter = await as("tuan.nguyen@luuxa.local");
  const fixer = await as("hieu.bui@luuxa.local");
  const fixer2 = await as("kiet.do@luuxa.local");
  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member;
  const fixerMe = await meOf(fixer);
  const fixer2Me = await meOf(fixer2);
  const reporterMe = await meOf(reporter);
  const notifs = async (c) => {
    const r = await c.get("/api/v1/notifications");
    eq(r.status, 200, JSON.stringify(r.json));
    return r.json.items;
  };
  const issueLink = (id) => `/hau-can?tab=bao-hong&issue=${id}`;
  const cleanups = [];

  try {
    let issueId = null;
    let issueCode = null;
    await test("Báo hỏng mới ⇒ Trưởng nhà nhận facility.issue_new có link mở thẳng sự cố", async () => {
      const r = await reporter.post("/api/v1/issues", { title: `Vòi nước rò rỉ ${tag}`, locationText: "Nhà vệ sinh tầng 2", urgency: "high" });
      eq(r.status, 201, JSON.stringify(r.json));
      issueId = r.json.id;
      issueCode = r.json.code;
      cleanups.push(() => admin.del(`/api/v1/issues/${issueId}`));
      const n = (await notifs(head)).find((x) => x.type === "facility.issue_new" && x.body?.includes(tag));
      ok(n, "Trưởng nhà phải nhận thông báo báo hỏng mới");
      eq(n.link, issueLink(issueId));
      ok(!(await notifs(reporter)).some((x) => x.type === "facility.issue_new" && x.body?.includes(tag)), "người báo không tự nhận thông báo của mình");
    });

    await test("Giao việc sửa ⇒ người được giao nhận facility.issue_assigned (link mở thẳng sự cố, kèm vị trí/mức độ/ghi chú)", async () => {
      const r = await head.post(`/api/v1/issues/${issueId}/assign`, { memberId: fixerMe.id, note: `Mua gioăng mới ${tag}` });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.assignees[0]?.memberId, fixerMe.id, "phải trả sự cố đã giao");
      const list = (await notifs(fixer)).filter((x) => x.type === "facility.issue_assigned" && x.link === issueLink(issueId));
      eq(list.length, 1, "đúng một thông báo giao việc");
      const n = list[0];
      ok(n.title.includes(issueCode), n.title);
      ok(n.body.includes("Nhà vệ sinh tầng 2") && n.body.includes(tag), n.body);
      eq(n.isRead, false);
      eq(n.category, "facility");
    });

    await test("Giao lại đúng người (chỉ sửa ghi chú) ⇒ không báo lại; đổi người ⇒ người mới nhận", async () => {
      eq((await head.post(`/api/v1/issues/${issueId}/assign`, { memberId: fixerMe.id, note: "Đổi ghi chú" })).status, 200);
      eq((await notifs(fixer)).filter((x) => x.type === "facility.issue_assigned" && x.link === issueLink(issueId)).length, 1, "không báo trùng");
      eq((await head.post(`/api/v1/issues/${issueId}/assign`, { memberId: fixer2Me.id, note: null })).status, 200);
      eq((await notifs(fixer2)).filter((x) => x.type === "facility.issue_assigned" && x.link === issueLink(issueId)).length, 1, "người mới được giao phải nhận");
    });

    await test("Người quản lý tự giao cho chính mình ⇒ không tự báo cho mình", async () => {
      const headMe = await meOf(head);
      eq((await head.post(`/api/v1/issues/${issueId}/assign`, { memberId: headMe.id, note: null })).status, 200);
      ok(!(await notifs(head)).some((x) => x.type === "facility.issue_assigned" && x.link === issueLink(issueId)), "không tự báo cho mình");
    });

    await test("Đổi trạng thái sự cố ⇒ người báo hỏng nhận facility.issue_updated có link mở thẳng sự cố", async () => {
      eq((await head.patch(`/api/v1/issues/${issueId}`, { status: "in_progress" })).status, 200);
      const n = (await notifs(reporter)).find((x) => x.type === "facility.issue_updated" && x.link === issueLink(issueId));
      ok(n, "người báo phải nhận cập nhật tiến độ");
      ok(n.title.includes(issueCode), n.title);
    });

    await test("Mở từ thông báo đẩy (?n=<id>): POST /notifications/<id>/read đánh dấu đã đọc; thông báo của người khác ⇒ 404", async () => {
      const n = (await notifs(fixer)).find((x) => x.type === "facility.issue_assigned" && x.link === issueLink(issueId));
      eq((await fixer.post(`/api/v1/notifications/${n.id}/read`, {})).status, 200);
      eq((await notifs(fixer)).find((x) => x.id === n.id).isRead, true);
      eq((await fixer.post(`/api/v1/notifications/${n.id}/read`, {})).status, 200, "đánh dấu lại vẫn 200 (idempotent)");
      eq((await reporter.post(`/api/v1/notifications/${n.id}/read`, {})).status, 404, "không đánh dấu được thông báo của người khác");
    });

    await test("Thông báo thiếu payload.link ⇒ suy link theo LOẠI (trước bảng / nhóm); link ngoài bị bỏ; link hợp lệ giữ nguyên", async () => {
      const rows = (
        await sql(
          `INSERT INTO notifications (member_id, type_code, title, body, payload, entity_table)
           SELECT $1::uuid, x.t, x.title, $2::text, x.p::jsonb, x.tbl
             FROM (VALUES ('duty.week_reviewed', 'Kiểm thử loại 1', '{}', NULL),
                          ('facility.issue_updated', 'Kiểm thử loại 2', '{"link": "//evil.example.com/x"}', 'maintenance_issues'),
                          ('finance.claim_decided', 'Kiểm thử loại 3', '{"link": "/thu-chi?tab=tong-quan&plan=abc"}', 'contribution_claims'),
                          ('system.manager_digest', 'Kiểm thử loại 4', '{}', NULL),
                          ('member.application_new', 'Kiểm thử loại 5', '{}', 'member_applications')) AS x(t, title, p, tbl)
           RETURNING id, type_code`,
          [reporterMe.id, tag]
        )
      ).rows;
      cleanups.push(() => sql("DELETE FROM notifications WHERE id = ANY ($1::uuid[])", [rows.map((r) => r.id)]));
      const items = (await notifs(reporter)).filter((x) => x.body === tag);
      const link = (t) => items.find((x) => x.type === t)?.link;
      eq(link("duty.week_reviewed"), "/hau-can?tab=truc-nhat");
      eq(link("facility.issue_updated"), "/hau-can?tab=bao-hong", "link ngoài bị bỏ ⇒ theo loại");
      eq(link("finance.claim_decided"), "/thu-chi?tab=tong-quan&plan=abc", "link hợp lệ giữ nguyên");
      eq(link("system.manager_digest"), "/");
      eq(link("member.application_new"), "/thanh-vien?tab=applications");
    });

    await test("Tin nhóm Zalo: biến {link} = URL tuyệt đối mở thẳng sự cố; mẫu tùy chỉnh dùng được {link}, biến lạ bị từ chối", async () => {
      let mock;
      try {
        mock = await startZaloMock();
      } catch (e) {
        ok(false, `không mở được máy chủ Zalo giả ở cổng ${MOCK_PORT}: ${e.message}`);
      }
      const items = (await admin.get("/api/v1/settings")).json.items;
      const old = (k) => items.find((s) => s.key === k)?.value;
      const restore = [
        { key: "integration.zalo.group_enabled", value: old("integration.zalo.group_enabled") ?? false },
        { key: "integration.zalo.group_chat_id", value: old("integration.zalo.group_chat_id") ?? "" },
        { key: "integration.zalo.templates", value: old("integration.zalo.templates") ?? {} },
      ];
      try {
        const on = await admin.patch("/api/v1/settings", {
          changes: [
            { key: "integration.zalo.group_enabled", value: true },
            { key: "integration.zalo.group_chat_id", value: "test-chat-inbox" },
            { key: "integration.zalo.templates", value: {} },
          ],
        });
        eq(on.status, 200, JSON.stringify(on.json));
        const r = await reporter.post("/api/v1/issues", { title: `Ổ cắm cháy ${tag}`, locationText: "Phòng học chung", urgency: "critical" });
        eq(r.status, 201, JSON.stringify(r.json));
        cleanups.push(() => admin.del(`/api/v1/issues/${r.json.id}`));
        const text = mock.state.messages.map((m) => m.text ?? "").find((t) => t.includes(tag));
        ok(text, `không có tin báo hỏng trong nhóm Zalo: ${JSON.stringify(mock.state.messages.map((m) => m.text))}`);
        ok(text.includes(`👉 Xem: ${BASE}${issueLink(r.json.id)}`), `thiếu liên kết tuyệt đối tới sự cố:\n${text}`);

        const good = await admin.patch("/api/v1/settings", { changes: [{ key: "integration.zalo.templates", value: { birthday: "🎂 Mừng sinh nhật {names}!\n👉 {link}" } }] });
        eq(good.status, 200, JSON.stringify(good.json));
        const bad = await admin.patch("/api/v1/settings", { changes: [{ key: "integration.zalo.templates", value: { birthday: "🎂 {names} {khongco}" } }] });
        eq(bad.status, 400, "biến không khai báo phải bị từ chối");
      } finally {
        await admin.patch("/api/v1/settings", { changes: restore });
        await new Promise((resolve) => mock?.server.close(resolve));
      }
    });
  } finally {
    for (const f of cleanups.reverse()) {
      try {
        await f();
      } catch {
        /* dọn tiếp */
      }
    }
    await sql("DELETE FROM notifications WHERE body = $1", [tag]).catch(() => {});
  }
}
