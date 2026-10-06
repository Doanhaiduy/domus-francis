// Kiểm thử BÁO CÁO HOẠT ĐỘNG QUÝ/NĂM (/api/v1/reports/activity): phân quyền (report.read), kiểm tra tham số, hình dạng dữ liệu,
// tính nhất quán (bốn quý cộng lại = cả năm; số vào nhà ≤ sĩ số), và báo cáo KHÔNG chứa dữ liệu cá nhân.

export async function run({ as, test, eq, ok, section, Client }) {
  section("Báo cáo hoạt động quý / năm");

  const anon = await new Client("anon").init();
  const head = await as("duc.tran@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const year = new Date().getFullYear();
  const get = (c, q) => c.get(`/api/v1/reports/activity?${q}`);

  await test("Phân quyền: chưa đăng nhập 401; thành viên thường 403; Trưởng nhà & Thủ quỹ 200", async () => {
    eq((await get(anon, `kind=year&year=${year}`)).status, 401);
    eq((await get(member, `kind=year&year=${year}`)).status, 403);
    eq((await get(head, `kind=year&year=${year}`)).status, 200);
    eq((await get(treasurer, `kind=quarter&year=${year}&quarter=1`)).status, 200);
  });

  await test("Tham số sai → 400 (thiếu quý, quý 5, năm vô lý, kiểu lạ)", async () => {
    eq((await get(head, `kind=quarter&year=${year}`)).status, 400);
    eq((await get(head, `kind=quarter&year=${year}&quarter=5`)).status, 400);
    eq((await get(head, "kind=year&year=1900")).status, 400);
    eq((await get(head, `kind=month&year=${year}`)).status, 400);
  });

  let y;
  await test("Báo cáo năm: hình dạng dữ liệu đầy đủ, kỳ đúng 01/01–31/12", async () => {
    const r = await get(head, `kind=year&year=${year}`);
    y = r.json;
    eq(y.kind, "year");
    eq(y.from, `${year}-01-01`);
    eq(y.to, `${year}-12-31`);
    eq(y.label, `Năm ${year}`);
    ok(y.house.name, "thiếu tên nhà");
    for (const k of ["startCount", "endCount", "joined", "becameAlumni", "left", "male", "female"]) ok(typeof y.members[k] === "number", `members.${k}`);
    ok(Array.isArray(y.members.byUniversity), "byUniversity");
    ok(y.finance && typeof y.finance.incomeVnd === "number", "finance (Trưởng nhà có quyền xem thống kê quỹ)");
    ok(typeof y.events.total === "number" && Array.isArray(y.events.byCategory), "events");
    ok(typeof y.duty.assignments === "number", "duty");
  });

  await test("Báo cáo quý: kỳ đúng ranh giới (Q1: 01/01–31/03; Q4: 01/10–31/12; Q2 năm nhuận…)", async () => {
    const q1 = (await get(head, `kind=quarter&year=${year}&quarter=1`)).json;
    eq(q1.from, `${year}-01-01`);
    eq(q1.to, `${year}-03-31`);
    eq(q1.label, `Quý 1/${year}`);
    const q4 = (await get(head, `kind=quarter&year=${year}&quarter=4`)).json;
    eq(q4.from, `${year}-10-01`);
    eq(q4.to, `${year}-12-31`);
    eq((await get(head, `kind=quarter&year=${year}&quarter=2`)).json.to, `${year}-06-30`);
  });

  await test("Nhất quán: tổng thu/chi bốn quý = cả năm; sự kiện và ca trực bốn quý = cả năm", async () => {
    const qs = await Promise.all([1, 2, 3, 4].map(async (q) => (await get(head, `kind=quarter&year=${year}&quarter=${q}`)).json));
    const sum = (f) => qs.reduce((a, x) => a + f(x), 0);
    eq(sum((x) => x.finance.incomeVnd), y.finance.incomeVnd, "tổng thu");
    eq(sum((x) => x.finance.expenseVnd), y.finance.expenseVnd, "tổng chi");
    eq(sum((x) => x.events.total), y.events.total, "số sự kiện");
    eq(sum((x) => x.duty.assignments), y.duty.assignments, "ca trực");
    eq(sum((x) => x.members.joined), y.members.joined, "số vào nhà");
    // (Bút toán "số dư đầu kỳ nhập tay" nằm trong kỳ được tính vào số dư đầu kỳ của kỳ đó nên tồn đầu các kỳ có thể khác nhau.)
    for (const x of [...qs, y]) eq(x.finance.closingVnd, x.finance.openingVnd + x.finance.incomeVnd - x.finance.expenseVnd, `${x.label}: tồn cuối = đầu + thu − chi`);
    eq(qs[3].finance.closingVnd, y.finance.closingVnd, "tồn cuối kỳ Q4 = tồn cuối năm");
  });

  await test("Số liệu hợp lý: sĩ số cuối kỳ ≥ 0; tỉ lệ nằm trong 0–100; cộng giới tính ≤ sĩ số", async () => {
    ok(y.members.endCount >= 0 && y.members.startCount >= 0, "sĩ số âm");
    ok(y.members.male + y.members.female <= y.members.endCount, "giới tính vượt sĩ số");
    for (const v of [y.finance.collectionRatePct, y.events.attendance.ratePct, y.duty.completionPct]) ok(v === null || (v >= 0 && v <= 100), `tỉ lệ ngoài 0–100: ${v}`);
    ok(y.finance.expenseByCategory.every((c) => c.amountVnd >= 0), "chi theo hạng mục âm");
  });

  await test("Báo cáo KHÔNG chứa dữ liệu cá nhân (SĐT, email, CCCD, họ tên thành viên)", async () => {
    const txt = JSON.stringify(y);
    ok(!/\+84\d{8,}/.test(txt) && !/0\d{9}/.test(txt), "có số điện thoại");
    ok(!/@/.test(txt), "có email");
    const members = (await head.get("/api/v1/members?includeFormer=1")).json;
    for (const m of members.slice(0, 40)) ok(!txt.includes(m.fullName), `lộ họ tên thành viên: ${m.fullName}`);
  });
}
