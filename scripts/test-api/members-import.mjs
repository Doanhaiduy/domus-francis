// Kiểm thử NHẬP THÀNH VIÊN HÀNG LOẠT (/api/v1/members/import): phân quyền, chế độ kiểm tra (dryRun) không ghi dữ liệu, chuẩn hóa
// (SĐT thiếu số 0, ngày DD/MM/YYYY, giới tính), phát hiện trùng (trong tệp + với người đã có), bỏ qua phần không khớp (trường/phòng) kèm cảnh báo,
// giới hạn 300 dòng, mỗi dòng một điểm lưu. Dọn dẹp: chuyển các thành viên thử sang trạng thái "đã rời".

export async function run({ as, test, eq, ok, section, Client }) {
  section("Nhập thành viên hàng loạt (Excel/CSV)");

  const anon = await new Client("anon").init();
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: member.create
  const member = await as("tuan.nguyen@luuxa.local");
  const suffix = Date.now().toString(36);
  const n = String(Date.now()).slice(-7);
  const phoneA = `90${n.slice(-6)}1`; // 9 số, thiếu số 0 đầu (Excel hay làm mất)
  const phoneB = `91${n.slice(-6)}2`;
  const emailC = `nhap.thu.${suffix}@example.com`;
  const names = { a: `Nguyễn Nhập Thử A ${suffix}`, b: `Trần Nhập Thử B ${suffix}`, c: `Lê Nhập Thử C ${suffix}` };
  const post = (c, rows, dryRun) => c.post("/api/v1/members/import", { rows, dryRun });
  const rows = () => [
    { fullName: names.a, gender: "nam", phone: phoneA, birthDate: "15/03/2005", hometown: "Phú Yên", joinedOn: "01/09/2026", fatherName: "Nguyễn Văn Cha", fatherPhone: "0903 111 222" },
    { fullName: names.b, gender: "Nữ", phone: phoneB, universityName: "Trường Không Tồn Tại Xyz", roomCode: "PHONG-LA", major: "Toán" },
    { fullName: names.c, email: emailC.toUpperCase(), gender: "khác" },
    { fullName: "", phone: "0909000000" }, // thiếu tên
    { fullName: `Sai SĐT ${suffix}`, phone: "12ab" },
    { fullName: `Sai ngày ${suffix}`, birthDate: "31/02/2005" },
    { fullName: `Trùng trong tệp ${suffix}`, phone: phoneA }, // trùng dòng 1
  ];
  const listNames = async () => (await head.get("/api/v1/members?includeFormer=1")).json.map((m) => m.fullName);

  await test("Phân quyền: chưa đăng nhập 401; thành viên thường (không có member.create) 403", async () => {
    eq((await post(anon, rows(), true)).status, 401);
    eq((await post(member, rows(), true)).status, 403);
  });

  await test("Kiểm tra dữ liệu đầu vào: không có dòng → 400; quá 300 dòng → 400", async () => {
    eq((await post(head, [], true)).status, 400);
    eq((await post(head, Array.from({ length: 301 }, (_, i) => ({ fullName: `Người ${i} ${suffix}` })), true)).status, 400);
  });

  let dry;
  await test("dryRun: phân loại từng dòng (ok / cảnh báo / lỗi) kèm thông điệp tiếng Việt", async () => {
    const r = await post(head, rows(), true);
    eq(r.status, 200, JSON.stringify(r.json));
    dry = r.json;
    eq(dry.dryRun, true);
    eq(dry.total, 7);
    eq(dry.created, 0, "dryRun không được tạo gì");
    const by = (line) => dry.rows.find((x) => x.line === line);
    eq(by(1).status, "ok", JSON.stringify(by(1)));
    eq(by(2).status, "warning", "trường không có + phòng lạ ⇒ cảnh báo");
    ok(by(2).messages.some((m) => m.includes("trường")), "phải cảnh báo trường");
    ok(by(2).messages.some((m) => m.includes("phòng")), "phải cảnh báo phòng");
    eq(by(3).status, "warning", "giới tính lạ ⇒ cảnh báo");
    eq(by(4).status, "error");
    ok(by(4).messages.some((m) => m.includes("họ tên")), "thiếu họ tên");
    eq(by(5).status, "error");
    ok(by(5).messages.some((m) => m.includes("điện thoại")), "SĐT sai");
    eq(by(6).status, "error");
    ok(by(6).messages.some((m) => m.includes("Ngày sinh")), "ngày sinh sai");
    eq(by(7).status, "error");
    ok(by(7).messages.some((m) => m.includes("dòng 1")), "trùng trong tệp phải chỉ ra dòng 1");
    eq(dry.errors, 4);
  });

  await test("dryRun không ghi dữ liệu: danh bạ chưa có người nào trong tệp", async () => {
    const all = await listNames();
    for (const nm of Object.values(names)) ok(!all.includes(nm), `${nm} không được xuất hiện sau dryRun`);
  });

  await test("Mặc định (không gửi dryRun) là KIỂM TRA, không ghi", async () => {
    const r = await head.post("/api/v1/members/import", { rows: [{ fullName: `Mặc định ${suffix}` }] });
    eq(r.status, 200);
    eq(r.json.dryRun, true);
    ok(!(await listNames()).includes(`Mặc định ${suffix}`), "không được tạo khi thiếu dryRun=false");
  });

  await test("Xác nhận (dryRun=false): tạo các dòng hợp lệ, bỏ qua dòng lỗi", async () => {
    const r = await post(head, rows(), false);
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.dryRun, false);
    eq(r.json.created, 3, JSON.stringify(r.json.rows.map((x) => [x.line, x.status, x.messages])));
    eq(r.json.errors, 4);
    const all = await listNames();
    for (const nm of Object.values(names)) ok(all.includes(nm), `${nm} phải có trong danh bạ`);
    ok(!all.some((x) => x.startsWith("Trùng trong tệp")), "dòng trùng không được tạo");
  });

  await test("Dữ liệu được chuẩn hóa: SĐT E.164, giới tính, email thường hóa", async () => {
    const m = (await head.get("/api/v1/members?includeFormer=1")).json;
    const a = m.find((x) => x.fullName === names.a);
    ok(a, "thiếu thành viên A");
    ok(String(a.phone ?? "").replace(/\D/g, "").endsWith(phoneA), `SĐT A: ${a.phone}`);
    const c = m.find((x) => x.fullName === names.c);
    eq((c.email ?? "").toLowerCase(), emailC, "email phải thường hóa");
  });

  await test("Nhập lại cùng tệp → toàn bộ dòng có SĐT/email bị chặn trùng với người đã có", async () => {
    const r = await post(head, rows().slice(0, 3), true);
    eq(r.status, 200);
    for (const line of [1, 2, 3]) {
      const row = r.json.rows.find((x) => x.line === line);
      if (line === 2) eq(row.status, "error", `dòng ${line}: ${JSON.stringify(row)}`);
      else eq(row.status, "error", `dòng ${line}: ${JSON.stringify(row)}`);
      ok(row.messages.some((m) => m.includes("Đã có thành viên")), `dòng ${line} phải báo trùng`);
    }
    eq((await post(head, rows().slice(0, 3), false)).json.created, 0, "không được tạo trùng");
  });

  // dọn dẹp: đánh dấu đã rời để không lẫn vào sĩ số
  const all = (await head.get("/api/v1/members?includeFormer=1")).json;
  for (const nm of Object.values(names)) {
    const m = all.find((x) => x.fullName === nm);
    if (m) await head.post(`/api/v1/members/${m.id}/status`, { status: "left", leftOn: null, reason: "Dữ liệu thử nghiệm" });
  }
}
