// Kiểm thử ĐƠN XIN PHÉP — nhờ người để cửa, xin thêm giờ và tin vào nhóm Zalo (db/app/1034). KHÔNG có lưu lượng ra Zalo thật: máy chủ thử được
// trỏ ZALO_TEST_BASE_URL tới một máy chủ GIẢ chạy ngay trong tiến trình này (127.0.0.1:3196) ghi lại mọi tin nhận được.
import http from "node:http";

const MOCK_PORT = 3196;

function startMock() {
  const state = { messages: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const m = /\/bot[^/]+\/sendMessage$/.exec(req.url ?? "");
        if (m) state.messages.push(JSON.parse(raw));
      } catch {
        /* bỏ qua */
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: "m1" } }));
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve({ state, server })));
}

export async function run({ as, test, eq, ok, section }) {
  const { state: zalo, server } = await startMock();
  const admin = await as("viet.vu@luuxa.local");
  let restore = [];
  try {
    section("Đơn xin phép — người để cửa, xin thêm giờ, tin nhóm Zalo");
    const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: leave.review
    const member = await as("tuan.nguyen@luuxa.local");
    const door = await as("bao.pham@luuxa.local");
    const other = await as("hieu.bui@luuxa.local");
    const suffix = Date.now().toString(36);
    const hour = 3600_000;
    const iso = (ms) => new Date(Date.now() + ms).toISOString();
    const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member;
    const mem = await meOf(member);
    const doorMem = await meOf(door);
    const created = [];
    const sent = () => zalo.messages.map((m) => m.text ?? "");
    const late = (extra = {}) => ({ kind: "late_return", startsAt: iso(hour), endsAt: iso(5 * hour), reason: `Thi cuối kỳ nên về muộn ${suffix}`, destination: "Thư viện trường", doorMemberId: doorMem.id, ...extra });

    // Bật nhóm Zalo (chat_id giả) cho phần kiểm thử; trả lại giá trị cũ ở cuối
    const items = (await admin.get("/api/v1/settings")).json.items;
    const old = (k) => items.find((s) => s.key === k)?.value;
    restore = [
      { key: "integration.zalo.group_enabled", value: old("integration.zalo.group_enabled") ?? false },
      { key: "integration.zalo.group_chat_id", value: old("integration.zalo.group_chat_id") ?? "" },
    ];
    const on = await admin.patch("/api/v1/settings", { changes: [{ key: "integration.zalo.group_enabled", value: true }, { key: "integration.zalo.group_chat_id", value: "test-chat-leave" }] });
    eq(on.status, 200, JSON.stringify(on.json));

    await test("Nhờ người để cửa: chính mình / người lạ → 400; người hợp lệ → 201 và hiện tên ở đơn", async () => {
      eq((await member.post("/api/v1/leave", late({ doorMemberId: mem.id }))).status, 400, "không tự nhờ mình");
      eq((await member.post("/api/v1/leave", late({ doorMemberId: "00000000-0000-4000-8000-000000000000" }))).status, 400, "người không tồn tại");
      const r = await member.post("/api/v1/leave", late());
      eq(r.status, 201, JSON.stringify(r.json));
      created.push(r.json.id);
      const it = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === r.json.id);
      eq(it.doorMemberId, doorMem.id);
      ok(it.doorMemberName && it.doorMemberName.length > 0, "thiếu tên người để cửa");
      eq(it.extensions.length, 0);
      eq(it.canExtend, true, "đơn về muộn của mình còn xin thêm giờ được");
      eq(it.effectiveEndsAt, it.endsAt);
    });

    await test("Đơn về muộn: tin vào nhóm Zalo có tên người xin, giờ về và người để cửa", async () => {
      const text = sent().find((t) => t.includes("VỀ MUỘN") && t.includes(suffix));
      ok(text, "không có tin về muộn trong nhóm Zalo: " + JSON.stringify(sent()));
      ok(text.includes(mem.displayName ?? mem.fullName), "thiếu tên người xin");
      ok(/Dự kiến về lúc/.test(text), "thiếu giờ về");
      ok(text.includes(doorMem.displayName ?? doorMem.fullName), "thiếu người để cửa");
      ok(text.includes("Thư viện trường"), "thiếu nơi đang ở");
      eq(zalo.messages[zalo.messages.length - 1].chat_id, "test-chat-leave", "gửi đúng nhóm");
    });

    await test("Người được nhờ để cửa thấy việc của mình (không kèm lý do / nơi đến); người khác không thấy", async () => {
      const d = (await door.get("/api/v1/leave")).json.doorDuties;
      const duty = d.find((x) => x.leaveId === created[0]);
      ok(duty, "người để cửa phải thấy đơn: " + JSON.stringify(d));
      eq(duty.kind, "late_return");
      ok(!("reason" in duty) && !("destination" in duty) && !("contactPhone" in duty), "không được lộ lý do/nơi đến/số điện thoại");
      eq((await other.get("/api/v1/leave")).json.doorDuties.some((x) => x.leaveId === created[0]), false);
      eq((await member.get("/api/v1/leave")).json.doorDuties.some((x) => x.leaveId === created[0]), false);
    });

    await test("Đơn ngủ ngoài báo vào nhóm Zalo; đơn vắng sự kiện / tạm vắng dài KHÔNG báo", async () => {
      const before = zalo.messages.length;
      const sleep = await member.post("/api/v1/leave", { kind: "overnight_out", startsAt: iso(2 * hour), endsAt: iso(14 * hour), reason: `Ngủ nhà bà con ${suffix}`, destination: "Nha Trang", doorMemberId: doorMem.id });
      eq(sleep.status, 201, JSON.stringify(sleep.json));
      created.push(sleep.json.id);
      ok(sent().some((t) => t.includes("NGỦ NGOÀI") && t.includes(suffix) && t.includes("Từ ")), "thiếu tin ngủ ngoài");
      const n = zalo.messages.length;
      const long = await member.post("/api/v1/leave", { kind: "long_leave", startsAt: iso(48 * hour), endsAt: iso(96 * hour), reason: `Về quê ${suffix}`, destination: "Phú Yên" });
      eq(long.status, 201, JSON.stringify(long.json));
      created.push(long.json.id);
      eq(zalo.messages.length, n, "tạm vắng dài không báo nhóm Zalo");
      ok(zalo.messages.length > before, "đã có tin mới trước đó");
      // người để cửa chỉ áp dụng cho đơn về muộn / ngủ ngoài
      const withDoor = await member.post("/api/v1/leave", { kind: "long_leave", startsAt: iso(48 * hour), endsAt: iso(96 * hour), reason: `Về quê lần hai ${suffix}`, destination: "Phú Yên", doorMemberId: doorMem.id });
      eq(withDoor.status, 201);
      created.push(withDoor.json.id);
      eq((await member.get("/api/v1/leave")).json.mine.find((x) => x.id === withDoor.json.id).doorMemberId, null, "đơn tạm vắng dài không lưu người để cửa");
    });

    await test("Xin thêm giờ: giờ không muộn hơn → 400; người khác → 403/404; đơn tạm vắng dài → 400", async () => {
      const id = created[0];
      const cur = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
      eq((await member.post(`/api/v1/leave/${id}/extend`, { newEndsAt: cur.endsAt, reason: "Xe hỏng giữa đường" })).status, 400, "bằng giờ cũ");
      eq((await member.post(`/api/v1/leave/${id}/extend`, { newEndsAt: new Date(new Date(cur.endsAt).getTime() + 30 * 24 * hour).toISOString(), reason: "Xe hỏng giữa đường" })).status, 400, "xa quá 24 giờ");
      eq((await member.post(`/api/v1/leave/${id}/extend`, { newEndsAt: new Date(new Date(cur.endsAt).getTime() + hour).toISOString(), reason: "ngắn" })).status, 400, "lý do quá ngắn");
      const hacker = await other.post(`/api/v1/leave/${id}/extend`, { newEndsAt: new Date(new Date(cur.endsAt).getTime() + hour).toISOString(), reason: "Giả mạo xin hộ" });
      ok([403, 404].includes(hacker.status), `người khác không được xin hộ: ${hacker.status}`);
      eq((await member.post(`/api/v1/leave/${created[2]}/extend`, { newEndsAt: iso(100 * hour), reason: "Ở lại thêm vài hôm" })).status, 400, "chỉ về muộn / ngủ ngoài");
    });

    await test("Xin thêm giờ hợp lệ → 201; đơn có lịch sử, giờ hiệu lực mới; tin Zalo báo lại; người để cửa thấy giờ mới", async () => {
      const id = created[0];
      const cur = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
      const newEnd = new Date(new Date(cur.endsAt).getTime() + 90 * 60_000).toISOString();
      const before = zalo.messages.length;
      const r = await member.post(`/api/v1/leave/${id}/extend`, { newEndsAt: newEnd, reason: `Xe hỏng giữa đường ${suffix}` });
      eq(r.status, 201, JSON.stringify(r.json));
      const it = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
      eq(it.extensions.length, 1);
      eq(it.extensions[0].newEndsAt, newEnd);
      eq(it.effectiveEndsAt, newEnd);
      eq(it.endsAt, cur.endsAt, "giờ gốc giữ nguyên");
      ok(zalo.messages.length > before, "phải có tin Zalo báo xin thêm giờ");
      const text = sent().slice(before).find((t) => t.includes("XIN THÊM GIỜ") && t.includes(suffix));
      ok(text, "thiếu tin xin thêm giờ: " + JSON.stringify(sent().slice(before)));
      ok(text.includes(mem.displayName ?? mem.fullName), "thiếu tên người xin");
      ok(text.includes(doorMem.displayName ?? doorMem.fullName), "thiếu người để cửa");
      const duty = (await door.get("/api/v1/leave")).json.doorDuties.find((x) => x.leaveId === id);
      eq(duty.effectiveEndsAt, newEnd, "người để cửa thấy giờ mới");
      // người duyệt thấy lịch sử xin thêm giờ
      const rev = (await head.get("/api/v1/leave")).json.review.find((x) => x.id === id);
      eq(rev.extensions.length, 1);
      eq(rev.reason.includes(suffix), true);
    });

    await test("Lần xin thêm kế tiếp phải muộn hơn lần trước; đơn bị từ chối/hủy → không xin thêm được", async () => {
      const id = created[0];
      const cur = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id);
      eq((await member.post(`/api/v1/leave/${id}/extend`, { newEndsAt: cur.endsAt, reason: "Cố tình lùi giờ lại" })).status, 400, "không được ≤ giờ hiệu lực hiện tại");
      const later = new Date(new Date(cur.effectiveEndsAt).getTime() + 30 * 60_000).toISOString();
      eq((await member.post(`/api/v1/leave/${id}/extend`, { newEndsAt: later, reason: `Vẫn chưa sửa xong xe ${suffix}` })).status, 201);
      // hủy đơn rồi xin thêm → 400
      eq((await member.patch(`/api/v1/leave/${created[1]}`, { action: "cancel" })).status, 200);
      const gone = await member.post(`/api/v1/leave/${created[1]}/extend`, { newEndsAt: iso(30 * hour), reason: "Đơn đã hủy rồi" });
      eq(gone.status, 400, JSON.stringify(gone.json));
      const dto = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === created[1]);
      eq(dto.canExtend, false);
    });

    for (const id of created) await member.patch(`/api/v1/leave/${id}`, { action: "cancel" });
  } finally {
    if (restore.length) await admin.patch("/api/v1/settings", { changes: restore });
    server.close();
  }
}
