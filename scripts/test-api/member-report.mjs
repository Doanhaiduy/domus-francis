// Kiểm thử TỔNG KẾT THEO THÀNH VIÊN (GET /api/v1/reports/members): tháng / quý / năm, phạm vi cả nhà ("all") và của chính mình ("me"),
// phân quyền theo từng mục, số liệu khớp dữ liệu đã tạo (xin phép, vi phạm, ủng hộ), danh mục sự kiện mới (hành hương, lần chuỗi).

export async function run({ as, test, eq, ok, section, Client }) {
  section("Tổng kết theo thành viên");

  const head = await as("duc.tran@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const stamp = Date.now().toString(36);

  const today = (await treasurer.get("/api/v1/finance/options")).json.today; // ngày hiện tại theo giờ VN
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const memberId = (await member.get("/api/v1/auth/me")).json.member.id;
  const otherId = (await other.get("/api/v1/auth/me")).json.member.id;
  const rep = (c, qs) => c.get(`/api/v1/reports/members?${qs}`);
  const monthQs = (scope) => `kind=month&year=${y}&month=${m}&scope=${scope}`;
  const rowOf = (r, id) => r.json.members.find((x) => x.memberId === id);

  await test("Phân quyền & tham số: chưa đăng nhập 401; thành viên xem cả nhà 403 nhưng xem của mình 200; tham số sai 400", async () => {
    const anon = await new Client("anon").init();
    eq((await rep(anon, monthQs("all"))).status, 401);
    eq((await rep(member, monthQs("all"))).status, 403);
    const mine = await rep(member, monthQs("me"));
    eq(mine.status, 200, JSON.stringify(mine.json));
    eq(mine.json.members.length, 1, "phạm vi 'me' chỉ có đúng một dòng");
    eq(mine.json.members[0].memberId, memberId);
    eq((await rep(head, `kind=month&year=${y}&scope=all`)).status, 400, "thiếu tháng");
    eq((await rep(head, `kind=quarter&year=${y}&scope=all`)).status, 400, "thiếu quý");
    eq((await rep(head, `kind=week&year=${y}`)).status, 400, "kiểu kỳ lạ");
    eq((await rep(head, `kind=year&year=1800`)).status, 400, "năm vô lý");
  });

  await test("Kỳ báo cáo: tháng (kể cả năm nhuận), quý, năm có ranh giới đúng", async () => {
    const feb = (await rep(head, "kind=month&year=2024&month=2&scope=all")).json;
    eq(feb.from, "2024-02-01");
    eq(feb.to, "2024-02-29");
    eq(feb.label, "Tháng 2/2024");
    const q4 = (await rep(head, "kind=quarter&year=2026&quarter=4&scope=all")).json;
    eq(q4.from, "2026-10-01");
    eq(q4.to, "2026-12-31");
    const yr = (await rep(head, "kind=year&year=2026&scope=all")).json;
    eq(yr.from, "2026-01-01");
    eq(yr.to, "2026-12-31");
    eq(yr.label, "Năm 2026");
  });

  let baseRow;
  let baseOther;
  let baseHouse;
  let baseMe;
  let baseOtherMe;

  await test("Dữ liệu tạo ra khớp trong tổng kết: xin phép, vi phạm (số lượng phạt), ủng hộ", async () => {
    // Các bộ kiểm thử khác có thể đã tạo dữ liệu trong cùng tháng ⇒ lấy đường cơ sở trước rồi so theo phần tăng
    const b = await rep(head, monthQs("all"));
    baseRow = rowOf(b, memberId);
    baseOther = rowOf(b, otherId);
    baseHouse = b.json.house_totals;
    baseMe = (await rep(member, monthQs("me"))).json.members[0];
    baseOtherMe = (await rep(other, monthQs("me"))).json.members[0];
    // xin phép: 2 đơn trong tháng này (một đơn về muộn đã duyệt, một đơn ngủ ngoài chờ duyệt)
    const mk = (kind, extra = {}) => member.post("/api/v1/leave", { kind, startsAt: `${today}T11:00:00.000Z`, endsAt: `${today}T16:30:00.000Z`, reason: `Tổng kết thử ${stamp}`, ...extra });
    const l1 = await mk("late_return");
    eq(l1.status, 201, JSON.stringify(l1.json));
    eq((await head.patch(`/api/v1/leave/${l1.json.id}`, { action: "approve" })).status, 200);
    eq((await mk("overnight_out", { destination: "Nhà người quen" })).status, 201);

    // vi phạm: 2 bản ghi tháng này của member (5 lần chuỗi + 3 ngày đi lễ), 1 bản ghi của người khác
    const ruleTitle = `Điều thử tổng kết ${stamp}`;
    const rec = (memberId2, extra) => head.post("/api/v1/discipline/records", { memberId: memberId2, ruleTitle, occurredOn: today, penaltyKind: "none", ...extra });
    eq((await rec(memberId, { penaltyKind: "rosary", penaltyQty: 5, penaltyStartsOn: today, penaltyEndsOn: today })).status, 201);
    eq((await rec(memberId, { penaltyKind: "mass", penaltyQty: 3 })).status, 201);
    eq((await rec(otherId, {})).status, 201);

    // ủng hộ đã nhận: một của member, một của người ngoài
    const fund = (await treasurer.get("/api/v1/finance/options")).json.funds.find((f) => f.type === "cash") ?? (await treasurer.get("/api/v1/finance/options")).json.funds[0];
    eq((await treasurer.post("/api/v1/donations", { donorMemberId: memberId, amountVnd: 250000, donatedOn: today, method: "cash", fundId: fund.id, received: true })).status, 201);
    eq((await treasurer.post("/api/v1/donations", { donorName: `Ân nhân ${stamp}`, amountVnd: 400000, donatedOn: today, method: "cash", fundId: fund.id, received: true })).status, 201);

    const r = await rep(head, monthQs("all"));
    eq(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const row = rowOf(r, memberId);
    ok(row, "có dòng của thành viên");
    eq(row.leave.total - baseRow.leave.total, 2);
    eq(row.leave.lateReturn - baseRow.leave.lateReturn, 1);
    eq(row.leave.overnightOut - baseRow.leave.overnightOut, 1);
    eq(row.leave.approved - baseRow.leave.approved, 1);
    eq(row.leave.pending - baseRow.leave.pending, 1);
    eq(row.discipline.count - baseRow.discipline.count, 2);
    eq(row.discipline.rosary - baseRow.discipline.rosary, 5);
    eq(row.discipline.mass - baseRow.discipline.mass, 3);
    ok(row.discipline.active - baseRow.discipline.active >= 1, "có hình phạt đang xử lý");
    eq(rowOf(r, otherId).discipline.count - baseOther.discipline.count, 1);
    eq(row.donations.count - baseRow.donations.count, 1);
    eq(row.donations.totalVnd - baseRow.donations.totalVnd, 250000);
    const hd = r.json.house_totals.donations;
    eq(hd.totalVnd - baseHouse.donations.totalVnd, 650000, "tổng ủng hộ cả nhà tăng đúng 250k + 400k (gồm người ngoài)");
    ok(hd.donors - baseHouse.donations.donors >= 1, "có thêm người ngoài ủng hộ: " + JSON.stringify(hd));
    ok(hd.memberDonors >= 1);
    eq(r.json.house_totals.discipline.count - baseHouse.discipline.count, 3);

    // tổng cả nhà = cộng các dòng
    const sum = (f) => r.json.members.reduce((s, x) => s + (f(x) ?? 0), 0);
    eq(r.json.house_totals.leave.total, sum((x) => x.leave?.total));
    eq(r.json.house_totals.discipline.count, sum((x) => x.discipline?.count));
    eq(r.json.house_totals.discipline.rosary, sum((x) => x.discipline?.rosary));
    eq(r.json.house_totals.memberCount, r.json.members.length);

    // quý và năm bao gồm tháng này
    const qr = rowOf(await rep(head, `kind=quarter&year=${y}&quarter=${q}&scope=all`), memberId);
    ok(qr.discipline.count >= row.discipline.count && qr.leave.total >= row.leave.total && qr.donations.count >= row.donations.count, "quý chứa tháng này");
    const yr = rowOf(await rep(head, `kind=year&year=${y}&scope=all`), memberId);
    ok(yr.discipline.count >= qr.discipline.count && yr.donations.totalVnd >= qr.donations.totalVnd, "năm chứa quý này");
    // tháng không có dữ liệu thì bằng 0
    const old = rowOf(await rep(head, "kind=month&year=2021&month=3&scope=all"), memberId);
    if (old) {
      eq(old.discipline.count, 0);
      eq(old.leave.total, 0);
    }

    // chi tiết đi kèm (cho trang tính Excel)
    ok(r.json.details.discipline.some((d) => d.ruleTitle === ruleTitle && d.memberName), "chi tiết vi phạm");
    ok(r.json.details.donations.some((d) => d.donorName.includes(stamp) && d.isMember === false), "chi tiết ủng hộ có người ngoài");
  });

  await test("Phân quyền theo mục: Thủ quỹ thấy quỹ/ủng hộ nhưng không thấy vi phạm; Trưởng nhà thấy vi phạm; mục không thấy là null", async () => {
    const t = await rep(treasurer, monthQs("all"));
    eq(t.status, 200);
    eq(t.json.sections.discipline, false);
    eq(t.json.sections.finance, true);
    eq(t.json.sections.donations, true);
    ok(t.json.members.every((x) => x.discipline === null), "Thủ quỹ không được thấy vi phạm của ai");
    eq(t.json.details.discipline, null);
    const h = await rep(head, monthQs("all"));
    eq(h.json.sections.discipline, true);
    ok(h.json.members.every((x) => x.discipline !== null));
  });

  await test("Phạm vi 'me': thành viên chỉ thấy số liệu của chính mình (vi phạm, ủng hộ, xin phép) và không có chi tiết cả nhà", async () => {
    const r = await rep(member, monthQs("me"));
    const row = r.json.members[0];
    eq(row.discipline.count - baseMe.discipline.count, 2);
    eq(row.discipline.rosary - baseMe.discipline.rosary, 5);
    eq(row.donations.count - baseMe.donations.count, 1);
    eq(row.donations.totalVnd - baseMe.donations.totalVnd, 250000);
    eq(row.leave.total - baseMe.leave.total, 2);
    eq(r.json.scope, "me");
    eq(r.json.details.discipline, null);
    eq(r.json.details.donations, null);
    eq(r.json.house_totals.donations, null, "thành viên thường không thấy tổng ủng hộ cả nhà");
    const o = await rep(other, monthQs("me"));
    eq(o.json.members[0].memberId, otherId);
    eq(o.json.members[0].discipline.count - baseOtherMe.discipline.count, 1, "người khác chỉ thấy vi phạm của mình");
    eq(o.json.members[0].donations.count - baseOtherMe.donations.count, 0, "khoản ủng hộ của người khác không lẫn sang");
  });

  await test("Danh mục sự kiện mới: Hành hương và Lần chuỗi có sẵn để thống kê", async () => {
    const cats = await member.get("/api/v1/events/categories");
    eq(cats.status, 200);
    const codes = JSON.stringify(cats.json);
    ok(codes.includes("EVT_PILGRIM") && codes.includes("EVT_ROSARY"), "thiếu danh mục hành hương/lần chuỗi: " + codes.slice(0, 300));
    const r = (await rep(head, `kind=year&year=${y}&scope=all`)).json;
    ok(typeof r.house_totals.events.pilgrimages === "number" && typeof r.house_totals.events.rosary === "number");
    ok(Array.isArray(r.house_totals.events.byCategory));
  });
}
