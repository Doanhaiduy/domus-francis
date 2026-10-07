// Kiểm thử VI PHẠM & KỶ LUẬT (db/app/1029): danh mục điều luật + mức phạt, ghi nhận vi phạm, hình phạt có ngày bắt đầu/kết thúc,
// hoàn thành / miễn / mở lại, quyền riêng tư (thành viên chỉ thấy của mình), thông báo, nhập điều luật từ "Luật nhà".

export async function run({ as, test, eq, ok, section }) {
  section("Vi phạm & kỷ luật");

  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("bao.pham@luuxa.local");
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const day = (n) => new Date(Date.now() + 7 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member.id;
  const memberId = await meOf(member);
  const otherId = await meOf(other);
  const rule = (extra = {}) => ({ code: `T${stamp}`, title: `Điều luật thử ${stamp}`, defaultPenaltyKind: "rosary", defaultPenaltyQty: 5, ...extra });

  await test("Quyền: Trưởng nhà & Admin có discipline.read/manage; thành viên thì không", async () => {
    for (const c of [head, admin]) {
      const p = (await c.get("/api/v1/auth/me")).json.permissions;
      ok(p.includes("discipline.read") && p.includes("discipline.manage"), "thiếu quyền kỷ luật");
    }
    const p = (await member.get("/api/v1/auth/me")).json.permissions;
    ok(!p.includes("discipline.read") && !p.includes("discipline.manage"), "thành viên không được có quyền kỷ luật");
  });

  let ruleId;
  await test("Điều luật: Trưởng nhà thêm được; thành viên 403; mã trùng 409; dữ liệu sai 400", async () => {
    eq((await member.post("/api/v1/discipline/rules", rule())).status, 403);
    const r = await head.post("/api/v1/discipline/rules", rule());
    eq(r.status, 201, JSON.stringify(r.json));
    ruleId = r.json.id;
    eq((await head.post("/api/v1/discipline/rules", rule())).status, 409, "mã trùng");
    eq((await head.post("/api/v1/discipline/rules", rule({ code: "sai ma!" }))).status, 400, "mã sai định dạng");
    eq((await head.post("/api/v1/discipline/rules", rule({ code: `U${stamp}`, defaultPenaltyQty: null }))).status, 400, "phạt lần chuỗi thiếu số lượng");
  });

  await test("Điều luật: thành viên đọc được điều đang áp dụng; điều bị ẩn chỉ người quản lý thấy; usageCount chỉ hiện cho người quản lý", async () => {
    const m1 = (await member.get("/api/v1/discipline/rules")).json;
    eq(m1.canManage, false);
    ok(m1.rules.some((x) => x.id === ruleId), "thành viên phải thấy điều đang áp dụng");
    eq(m1.rules.find((x) => x.id === ruleId).usageCount, 0);
    eq((await head.patch(`/api/v1/discipline/rules/${ruleId}`, { isActive: false })).status, 200);
    ok(!(await member.get("/api/v1/discipline/rules")).json.rules.some((x) => x.id === ruleId), "điều bị ẩn không được hiện với thành viên");
    const h = (await head.get("/api/v1/discipline/rules")).json;
    eq(h.canManage, true);
    ok(h.rules.some((x) => x.id === ruleId && x.isActive === false), "người quản lý vẫn thấy điều đã ẩn");
    eq((await head.patch(`/api/v1/discipline/rules/${ruleId}`, { isActive: true })).status, 200);
    eq((await member.patch(`/api/v1/discipline/rules/${ruleId}`, { title: "Sửa lén" })).status, 403);
  });

  // ---------------------------------------------------------------- ghi nhận
  const rec = (extra = {}) => ({ memberId, ruleId, occurredOn: day(0), note: `Ghi nhận thử ${stamp}`, penaltyKind: "rosary", penaltyQty: 5, penaltyStartsOn: day(0), penaltyEndsOn: day(7), ...extra });
  let rServing;
  let rUpcoming;
  let rOverdue;
  let rNone;
  let rOther;

  await test("Ghi nhận: Trưởng nhà ghi được; thành viên 403; kiểm tra dữ liệu", async () => {
    eq((await member.post("/api/v1/discipline/records", rec())).status, 403);
    const r = await head.post("/api/v1/discipline/records", rec());
    eq(r.status, 201, JSON.stringify(r.json));
    rServing = r.json.id;
    eq((await head.post("/api/v1/discipline/records", rec({ penaltyQty: null }))).status, 400, "lần chuỗi thiếu số lượng");
    eq((await head.post("/api/v1/discipline/records", rec({ penaltyStartsOn: day(5), penaltyEndsOn: day(1) }))).status, 400, "ngày kết thúc trước ngày bắt đầu");
    eq((await head.post("/api/v1/discipline/records", rec({ penaltyKind: "other", penaltyQty: null, penaltyDetail: null }))).status, 400, "phạt khác thiếu mô tả");
    eq((await head.post("/api/v1/discipline/records", rec({ ruleId: null, ruleTitle: null }))).status, 400, "thiếu điều luật/tên điều vi phạm");
    eq((await head.post("/api/v1/discipline/records", rec({ memberId: "00000000-0000-4000-8000-000000000000" }))).status, 400, "thành viên không tồn tại");
  });

  await test("Giai đoạn tự tính: sắp tới / đang chấp hành / quá hạn / chỉ ghi nhận / phạt khác", async () => {
    rUpcoming = (await head.post("/api/v1/discipline/records", rec({ occurredOn: day(0), penaltyKind: "mass", penaltyQty: 3, penaltyStartsOn: day(2), penaltyEndsOn: day(5) }))).json.id;
    rOverdue = (await head.post("/api/v1/discipline/records", rec({ occurredOn: day(-20), penaltyKind: "duty", penaltyQty: 2, penaltyStartsOn: day(-15), penaltyEndsOn: day(-8) }))).json.id;
    rNone = (await head.post("/api/v1/discipline/records", rec({ penaltyKind: "none", penaltyQty: null, penaltyStartsOn: null, penaltyEndsOn: null }))).json.id;
    rOther = (await head.post("/api/v1/discipline/records", rec({ memberId: otherId, penaltyKind: "other", penaltyQty: null, penaltyDetail: "Dọn nhà vệ sinh tầng 2 cả tuần" }))).json.id;
    const all = (await head.get(`/api/v1/discipline/records?q=${stamp}`)).json;
    const phase = (id) => all.records.find((x) => x.id === id)?.phase;
    eq(phase(rServing), "serving");
    eq(phase(rUpcoming), "upcoming");
    eq(phase(rOverdue), "overdue");
    eq(phase(rNone), "recorded");
    eq(phase(rOther), "serving", "phạt khác chưa có ngày ⇒ đang chấp hành");
    ok(all.summary.overdue >= 1 && all.summary.active >= 4, JSON.stringify(all.summary));
    const kinds = Object.fromEntries(all.summary.byKind.map((k) => [k.kind, k]));
    ok(kinds.rosary?.qty >= 5 && kinds.mass?.qty >= 3 && kinds.duty?.qty >= 2, "tổng số lượng theo loại phạt: " + JSON.stringify(all.summary.byKind));
  });

  await test("Riêng tư: thành viên chỉ thấy vi phạm của MÌNH (kể cả khi không gắn ?mine=1); không thấy của người khác", async () => {
    const mine = (await member.get("/api/v1/discipline/records")).json;
    eq(mine.canReadAll, false);
    eq(mine.canManage, false);
    ok(mine.records.length >= 4 && mine.records.every((x) => x.memberId === memberId && x.isMine), "chỉ của chính mình");
    ok(!mine.records.some((x) => x.id === rOther), "không thấy bản ghi của người khác");
    const spy = (await member.get(`/api/v1/discipline/records?memberId=${otherId}`)).json;
    ok(spy.records.every((x) => x.memberId === memberId), "lọc theo người khác vẫn chỉ trả của mình");
    const otherSees = (await other.get("/api/v1/discipline/records")).json;
    ok(!otherSees.records.some((x) => x.memberId === memberId), "người khác không thấy của mình");
    const head1 = (await head.get(`/api/v1/discipline/records?memberId=${otherId}&q=${stamp}`)).json;
    ok(head1.records.length >= 1 && head1.records.every((x) => x.memberId === otherId), "Trưởng nhà lọc theo thành viên");
  });

  await test("Bộ lọc: theo giai đoạn (active/overdue), khoảng ngày vi phạm và từ khóa", async () => {
    const act = (await head.get(`/api/v1/discipline/records?phase=active&q=${stamp}`)).json;
    ok(act.records.length >= 4 && act.records.every((x) => ["upcoming", "serving", "overdue"].includes(x.phase)), "phase=active");
    const od = (await head.get(`/api/v1/discipline/records?phase=overdue&q=${stamp}`)).json;
    ok(od.records.length >= 1 && od.records.every((x) => x.phase === "overdue"));
    const old = (await head.get(`/api/v1/discipline/records?from=${day(-30)}&to=${day(-10)}&q=${stamp}`)).json;
    ok(old.records.length >= 1 && old.records.every((x) => x.occurredOn >= day(-30) && x.occurredOn <= day(-10)), "lọc theo ngày vi phạm");
    eq((await head.get("/api/v1/discipline/records?q=zzzkhongcoai")).json.records.length, 0);
  });

  await test("Thông báo: thành viên nhận thông báo khi được ghi nhận", async () => {
    const n = await member.get("/api/v1/notifications");
    eq(n.status, 200);
    ok(JSON.stringify(n.json).includes("Vi phạm & kỷ luật"), "thiếu thông báo ghi nhận vi phạm");
  });

  await test("Hoàn thành / mở lại / miễn: chỉ người quản lý; miễn cần lý do", async () => {
    eq((await member.patch(`/api/v1/discipline/records/${rServing}`, { action: "complete" })).status, 403);
    eq((await head.patch(`/api/v1/discipline/records/${rOverdue}`, { action: "complete" })).status, 200);
    const done = (await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.find((x) => x.id === rOverdue);
    eq(done.phase, "completed");
    ok(done.completedAt, "có ngày hoàn thành");
    eq((await head.patch(`/api/v1/discipline/records/${rOverdue}`, { action: "reopen" })).status, 200);
    eq((await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.find((x) => x.id === rOverdue).phase, "overdue");
    eq((await head.patch(`/api/v1/discipline/records/${rUpcoming}`, { action: "waive" })).status, 400, "miễn thiếu lý do");
    eq((await head.patch(`/api/v1/discipline/records/${rUpcoming}`, { action: "waive", reason: "Đã xin lỗi trước nhà" })).status, 200);
    const w = (await head.get(`/api/v1/discipline/records?q=${stamp}`)).json;
    const wr = w.records.find((x) => x.id === rUpcoming);
    eq(wr.phase, "waived");
    eq(wr.waiveReason, "Đã xin lỗi trước nhà");
    const kinds = Object.fromEntries(w.summary.byKind.map((k) => [k.kind, k]));
    ok(!kinds.mass, "hình phạt được miễn không tính vào tổng số lượng phạt");
    eq((await head.patch(`/api/v1/discipline/records/${rUpcoming}`, { action: "reopen" })).status, 200);
    eq((await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.find((x) => x.id === rUpcoming).waiveReason, null, "mở lại xóa lý do miễn");
  });

  await test("Sửa nội dung: đổi số lượng, ngày, chuyển sang không phạt; dữ liệu sai bị từ chối", async () => {
    eq((await member.patch(`/api/v1/discipline/records/${rServing}`, { penaltyQty: 9 })).status, 403);
    eq((await head.patch(`/api/v1/discipline/records/${rServing}`, { penaltyQty: 8, penaltyEndsOn: day(10), note: "Đã sửa" })).status, 200);
    const r1 = (await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.find((x) => x.id === rServing);
    eq(r1.penaltyQty, 8);
    eq(r1.penaltyEndsOn, day(10));
    eq(r1.note, "Đã sửa");
    eq((await head.patch(`/api/v1/discipline/records/${rServing}`, { penaltyStartsOn: day(20) })).status, 400, "bắt đầu sau ngày kết thúc");
    eq((await head.patch(`/api/v1/discipline/records/${rServing}`, { penaltyKind: "none" })).status, 200);
    const r2 = (await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.find((x) => x.id === rServing);
    eq(r2.penaltyKind, "none");
    eq(r2.penaltyQty, null);
    eq(r2.phase, "recorded");
  });

  await test("Xóa điều luật: vi phạm đã ghi vẫn giữ nguyên tên điều luật; nhập từ Luật nhà; xóa bản ghi", async () => {
    const before = (await head.get("/api/v1/discipline/rules")).json.rules.find((x) => x.id === ruleId);
    ok(before.usageCount >= 4, "điều luật đã được dùng: " + before.usageCount);
    eq((await member.del(`/api/v1/discipline/rules/${ruleId}`)).status, 403);
    eq((await head.del(`/api/v1/discipline/rules/${ruleId}`)).status, 200);
    const kept = (await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.find((x) => x.id === rNone);
    ok(kept && kept.ruleId === null && kept.ruleTitle === `Điều luật thử ${stamp}` && kept.ruleCode === `T${stamp}`, "bản sao tên điều luật còn nguyên: " + JSON.stringify(kept));
    eq((await member.post("/api/v1/discipline/rules/import")).status, 403);
    const imp = await head.post("/api/v1/discipline/rules/import");
    eq(imp.status, 200, JSON.stringify(imp.json));
    ok(typeof imp.json.created === "number" && typeof imp.json.skipped === "number");
    const again = await head.post("/api/v1/discipline/rules/import");
    eq(again.json.created, 0, "nhập lần hai không tạo trùng");
    eq((await member.del(`/api/v1/discipline/records/${rNone}`)).status, 403);
    for (const id of [rServing, rUpcoming, rOverdue, rNone, rOther]) eq((await head.del(`/api/v1/discipline/records/${id}`)).status, 200);
    eq((await head.del(`/api/v1/discipline/records/${rNone}`)).status, 404);
    ok(!(await head.get(`/api/v1/discipline/records?q=${stamp}`)).json.records.some((x) => x.ruleTitle.includes(stamp)), "đã xóa hết bản ghi thử");
  });
}
