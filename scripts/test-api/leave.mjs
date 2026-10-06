// Kiểm thử ĐƠN XIN PHÉP (/api/v1/leave): phân quyền (tự gửi/tự xem, người duyệt xem tất cả), ràng buộc theo loại đơn, không tự duyệt đơn
// của mình (BR-EVT-07), duyệt/từ chối/hủy, đơn vắng sự kiện được duyệt ⇒ điểm danh "có phép", thông báo cho hai phía, chống trùng.
// Dữ liệu thử: tạo sự kiện MỚI (hậu tố thời gian) và dọn lại bằng cách hủy các đơn còn chờ.

export async function run({ as, test, eq, ok, section, BASE, Client }) {
  section("Đơn xin phép (vắng sự kiện, về muộn, ngủ ngoài, tạm vắng)");

  const anon = await new Client("anon").init();
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: leave.review
  const member = await as("tuan.nguyen@luuxa.local"); // Thành viên: leave.request
  const other = await as("hieu.bui@luuxa.local");
  const suffix = Date.now().toString(36);
  const hour = 3600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const late = (extra = {}) => ({ kind: "late_return", startsAt: iso(2 * hour), endsAt: iso(6 * hour), reason: `Thi cuối kỳ về muộn ${suffix}`, ...extra });
  const code = (r) => r.json?.code ?? "";
  const created = [];

  await test("Chưa đăng nhập: 401 ở mọi đường dẫn đơn xin phép", async () => {
    eq((await anon.get("/api/v1/leave")).status, 401);
    eq((await anon.post("/api/v1/leave", late())).status, 401);
    eq((await anon.get("/api/v1/leave/count")).status, 401);
  });

  await test("Thành viên: GET /leave → canRequest, không có quyền duyệt (review = null)", async () => {
    const r = await member.get("/api/v1/leave");
    eq(r.status, 200);
    eq(r.json.canRequest, true);
    eq(r.json.canReview, false);
    eq(r.json.review, null);
    ok(Array.isArray(r.json.mine) && Array.isArray(r.json.events), "thiếu mine/events");
  });

  await test("Gửi đơn về muộn → 201, hiện ở 'Đơn của tôi' với trạng thái chờ duyệt", async () => {
    const r = await member.post("/api/v1/leave", late());
    eq(r.status, 201, JSON.stringify(r.json));
    created.push(r.json.id);
    const mine = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === r.json.id);
    ok(mine, "đơn không hiện");
    eq(mine.status, "pending");
    eq(mine.kind, "late_return");
    eq(mine.isMine, true);
  });

  await test("Kiểm tra dữ liệu: kết thúc trước bắt đầu / lý do ngắn / đã qua / quá 120 ngày → 400", async () => {
    eq((await member.post("/api/v1/leave", late({ startsAt: iso(5 * hour), endsAt: iso(2 * hour) }))).status, 400);
    eq((await member.post("/api/v1/leave", late({ reason: "ngắn" }))).status, 400);
    eq((await member.post("/api/v1/leave", late({ startsAt: iso(-10 * hour), endsAt: iso(-5 * hour) }))).status, 400);
    eq((await member.post("/api/v1/leave", { kind: "long_leave", startsAt: iso(hour), endsAt: iso(130 * 24 * hour), reason: "Đi xa dài ngày", destination: "Quê" })).status, 400);
  });

  await test("Ngủ ngoài / tạm vắng dài bắt buộc có nơi đến; SĐT sai → 400", async () => {
    eq((await member.post("/api/v1/leave", { kind: "overnight_out", startsAt: iso(hour), endsAt: iso(14 * hour), reason: "Ngủ nhà bà con" })).status, 400);
    eq((await member.post("/api/v1/leave", { kind: "overnight_out", startsAt: iso(hour), endsAt: iso(14 * hour), reason: "Ngủ nhà bà con", destination: "Nha Trang", contactPhone: "abc" })).status, 400);
    const r = await member.post("/api/v1/leave", { kind: "overnight_out", startsAt: iso(hour), endsAt: iso(14 * hour), reason: "Ngủ nhà bà con", destination: "Nha Trang", contactPhone: "0912 334 782" });
    eq(r.status, 201, JSON.stringify(r.json));
    created.push(r.json.id);
    const it = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === r.json.id);
    eq(it.contactPhone, "+84912334782", "SĐT phải chuẩn hóa E.164");
    eq(it.destination, "Nha Trang");
  });

  // ---- đơn vắng sự kiện
  let evId;
  await test("Đơn vắng sự kiện: bắt buộc chọn sự kiện hợp lệ; sự kiện lạ → 400", async () => {
    const ev = await head.post("/api/v1/events", { title: `Họp nhà thử nghiệm ${suffix}`, startsAt: iso(30 * hour), endsAt: iso(32 * hour), categoryCode: "EVT_SOCIAL", hasCheckIn: true });
    eq(ev.status, 201, JSON.stringify(ev.json));
    evId = ev.json.id;
    const opts = (await member.get("/api/v1/leave")).json.events;
    ok(opts.some((e) => e.id === evId), "sự kiện mới phải có trong danh sách xin vắng");
    eq((await member.post("/api/v1/leave", { kind: "event_absence", startsAt: iso(30 * hour), endsAt: iso(32 * hour), reason: "Bận thi" })).status, 400, "thiếu sự kiện");
    eq((await member.post("/api/v1/leave", { kind: "event_absence", eventId: "00000000-0000-4000-8000-000000000000", startsAt: iso(30 * hour), endsAt: iso(32 * hour), reason: "Bận thi" })).status, 400, "sự kiện lạ");
  });
  let absenceId;
  await test("Gửi đơn vắng sự kiện → khung giờ lấy theo sự kiện; gửi lại → 409", async () => {
    const r = await member.post("/api/v1/leave", { kind: "event_absence", eventId: evId, startsAt: iso(hour), endsAt: iso(2 * hour), reason: "Em có lịch thi cùng giờ" });
    eq(r.status, 201, JSON.stringify(r.json));
    absenceId = r.json.id;
    created.push(absenceId);
    const it = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === absenceId);
    eq(it.eventId, evId);
    ok(Math.abs(new Date(it.startsAt).getTime() - (Date.now() + 30 * hour)) < 5 * 60_000, "giờ bắt đầu phải theo sự kiện");
    const dup = await member.post("/api/v1/leave", { kind: "event_absence", eventId: evId, startsAt: iso(hour), endsAt: iso(2 * hour), reason: "Gửi lại lần nữa" });
    eq(dup.status, 409);
    eq(code(dup), "LEAVE_DUPLICATE");
  });

  // ---- phân quyền xem / xử lý
  await test("Chỉ người duyệt thấy đơn của người khác; thành viên khác không thấy, không hủy được", async () => {
    const r = await head.get("/api/v1/leave");
    eq(r.json.canReview, true);
    const it = r.json.review.find((x) => x.id === absenceId);
    ok(it, "Trưởng nhà phải thấy đơn chờ duyệt");
    ok(it.memberName, "phải có tên người xin");
    ok(r.json.pendingCount >= 3, "pendingCount phải ≥ 3");
    ok(!(await other.get("/api/v1/leave")).json.mine.some((x) => x.id === absenceId), "người khác không được thấy đơn");
    eq((await other.patch(`/api/v1/leave/${absenceId}`, { action: "cancel" })).status, 404);
    eq((await other.patch(`/api/v1/leave/${absenceId}`, { action: "approve" })).status, 403);
  });
  await test("Huy hiệu: Trưởng nhà thấy số đơn chờ; thành viên thường = 0", async () => {
    ok((await head.get("/api/v1/leave/count")).json.pending >= 3, "đếm sai");
    eq((await member.get("/api/v1/leave/count")).json.pending, 0);
  });
  await test("Thành viên không tự duyệt đơn của mình (403)", async () => {
    eq((await member.patch(`/api/v1/leave/${absenceId}`, { action: "approve" })).status, 403);
  });
  await test("Trưởng nhà không tự duyệt đơn của CHÍNH MÌNH (BR-EVT-07 → 403)", async () => {
    const own = await head.post("/api/v1/leave", late({ reason: `Trưởng nhà về muộn ${suffix}` }));
    eq(own.status, 201, JSON.stringify(own.json));
    created.push(own.json.id);
    eq((await head.patch(`/api/v1/leave/${own.json.id}`, { action: "approve" })).status, 403);
    ok(!(await head.get("/api/v1/leave")).json.review.some((x) => x.id === own.json.id), "đơn của chính mình không nằm ở hàng chờ duyệt");
    eq((await head.patch(`/api/v1/leave/${own.json.id}`, { action: "cancel" })).status, 200);
  });
  await test("Từ chối phải có lý do (≥ 5 ký tự); đủ lý do → rejected", async () => {
    const lateId = created[0];
    eq((await head.patch(`/api/v1/leave/${lateId}`, { action: "reject" })).status, 400);
    eq((await head.patch(`/api/v1/leave/${lateId}`, { action: "reject", note: "ngắn" })).status, 400);
    eq((await head.patch(`/api/v1/leave/${lateId}`, { action: "reject", note: "Hôm đó có Thánh lễ chung, em về sớm nhé." })).status, 200);
    const it = (await member.get("/api/v1/leave")).json.mine.find((x) => x.id === lateId);
    eq(it.status, "rejected");
    eq(it.decisionNote, "Hôm đó có Thánh lễ chung, em về sớm nhé.");
    ok(it.decidedByName && it.decidedAt, "phải ghi nhận người duyệt");
  });
  await test("Duyệt đơn vắng sự kiện → approved; xử lý lại → 409; người xin không hủy được đơn đã duyệt (404)", async () => {
    eq((await head.patch(`/api/v1/leave/${absenceId}`, { action: "approve" })).status, 200);
    eq((await member.get("/api/v1/leave")).json.mine.find((x) => x.id === absenceId).status, "approved");
    const again = await head.patch(`/api/v1/leave/${absenceId}`, { action: "approve" });
    eq(again.status, 409);
    eq(code(again), "LEAVE_DECIDED");
    eq((await member.patch(`/api/v1/leave/${absenceId}`, { action: "cancel" })).status, 404);
  });
  await test("Đơn vắng sự kiện được duyệt ⇒ điểm danh sự kiện ghi 'có phép' (excused)", async () => {
    const r = await head.get(`/api/v1/events/${evId}/attendance`);
    eq(r.status, 200, JSON.stringify(r.json).slice(0, 200));
    const txt = JSON.stringify(r.json);
    ok(txt.includes("excused"), "bảng điểm danh phải có bản ghi excused: " + txt.slice(0, 300));
  });
  await test("Người xin hủy đơn đang chờ của mình → cancelled", async () => {
    const id = created[1];
    eq((await member.patch(`/api/v1/leave/${id}`, { action: "cancel" })).status, 200);
    eq((await member.get("/api/v1/leave")).json.mine.find((x) => x.id === id).status, "cancelled");
    eq((await head.patch(`/api/v1/leave/${id}`, { action: "approve" })).status, 409, "đơn đã hủy không duyệt được");
  });
  await test("Thông báo: người duyệt nhận 'đơn mới'; người xin nhận kết quả", async () => {
    const h = JSON.stringify((await head.get("/api/v1/notifications")).json);
    ok(h.includes("xin phép"), "Trưởng nhà phải nhận thông báo đơn mới");
    const m = JSON.stringify((await member.get("/api/v1/notifications")).json);
    ok(m.includes("Đơn xin phép của bạn đã được duyệt"), "người xin phải nhận kết quả duyệt");
    ok(m.includes("chưa được duyệt"), "người xin phải nhận kết quả từ chối");
  });

  // dọn dẹp
  for (const id of created) await member.patch(`/api/v1/leave/${id}`, { action: "cancel" });
  await head.del(`/api/v1/events/${evId}`);
}
