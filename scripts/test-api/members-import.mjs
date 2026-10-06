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

  // ---------------------------------------------------------------------------------------------------------
  // Đủ mọi cột của hồ sơ: tên gọi, Ẩn SĐT, ngày vào nhà (tháng/năm), CCCD, địa chỉ, tình trạng học tập, niên khóa, định mức quỹ…
  // ---------------------------------------------------------------------------------------------------------
  const extra = []; // tên các thành viên thử tạo thêm (để dọn dẹp)
  const lookups = (await head.get("/api/v1/lookups")).json;
  const uni = lookups.universities[0];
  const bedroom = (await head.get("/api/v1/house")).json.rooms.find((r) => r.type === "bedroom" && r.status === "active");
  const nid = `07920${n.padStart(7, "0")}`; // CCCD 12 số bắt đầu bằng 0 như mã tỉnh thật
  const full = {
    fullName: `Phạm Đầy Đủ ${suffix}`, displayName: "Đủ", gender: "Nữ", phone: `92${n.slice(-6)}3`, email: `daydu.${suffix}@example.com`, hidePhone: "Có", joinedOn: "09/2026",
    birthDate: "20/05/2004", nationalId: nid.slice(1) /* Excel làm mất số 0 đầu */, hometown: "Khánh Hòa", homeAddress: "5 Trần Phú, Nha Trang",
    studentStatus: "Bảo lưu", universityName: uni.name, major: "cong nghe thong tin", academicYear: "K66", enrollmentYear: "2022", expectedGraduationYear: "2026", studentCode: `MSV${suffix}`.toUpperCase(),
    fatherName: "Phạm Văn Cha", fatherPhone: "0903 111 222", motherName: "Lê Thị Mẹ", motherPhone: "0903 333 444", customDuesVnd: "150.000",
  };
  const detailOf = async (name) => {
    const m = (await head.get("/api/v1/members?includeFormer=1")).json.find((x) => x.fullName === name);
    ok(m, `thiếu thành viên ${name}`);
    return { id: m.id, d: (await head.get(`/api/v1/members/${m.id}`)).json };
  };

  await test("Đủ mọi cột: dryRun hợp lệ, không cảnh báo, không thông báo thiếu quyền", async () => {
    const r = await post(head, [full], true);
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.rows[0].status, "ok", JSON.stringify(r.json.rows[0]));
    eq(r.json.notices.length, 0, JSON.stringify(r.json.notices));
  });

  await test("Đủ mọi cột: tạo xong, đọc lại đúng từng trường (CCCD thiếu số 0 đầu được bù lại)", async () => {
    const r = await post(head, [full], false);
    eq(r.json.created, 1, JSON.stringify(r.json.rows));
    extra.push(full.fullName);
    const { id, d } = await detailOf(full.fullName);
    eq(d.name, "Đủ", "tên gọi");
    eq(d.gender, "Nữ");
    eq(d.hidePhone, true, "Ẩn SĐT");
    eq(d.joinedOn, "2026-09-01", "ngày vào nhà MM/YYYY ⇒ ngày 1");
    eq(d.birthDateIso, "2004-05-20");
    ok(String(d.identityCard ?? "").endsWith(nid.slice(-4)), `CCCD che: ${d.identityCard}`);
    eq(d.hometown, "Khánh Hòa");
    eq(d.homeAddress, "5 Trần Phú, Nha Trang");
    eq(d.studentStatus, "suspended", "tình trạng học tập");
    eq(d.universityId, uni.id);
    eq(d.major, "Công nghệ thông tin", "ngành được chuẩn hóa theo danh sách");
    eq(d.academicYear, "K66");
    eq(d.enrollmentYear, 2022, "năm nhập học");
    eq(d.expectedGraduationYear, 2026, "năm ra trường");
    eq(d.studentCode, full.studentCode);
    ok(String(d.fatherName ?? "").startsWith("Phạm Văn Cha"), `cha: ${d.fatherName}`);
    ok(String(d.motherName ?? "").startsWith("Lê Thị Mẹ"), `mẹ: ${d.motherName}`);
    eq(d.customDuesVnd, 150000, "định mức quỹ riêng");
    // CCCD đủ 12 số (có số 0 đầu) — kiểm tra bằng thao tác xem có lý do (ghi nhật ký kiểm toán)
    const reveal = await head.post(`/api/v1/members/${id}/national-id`, { reason: "Kiểm thử nhập hàng loạt" });
    eq(reveal.status, 200, JSON.stringify(reveal.json));
    eq(reveal.json.nationalId, nid, "CCCD lưu đủ 12 số");
  });

  await test("Trùng CCCD: với người đã có ⇒ dòng đó thất bại khi thêm (thông báo rõ, không tạo người thừa); giữa hai dòng trong tệp ⇒ báo ngay", async () => {
    // Cột CCCD cố ý không cho vai trò ứng dụng đọc ⇒ không kiểm tra trước được; chỉ mục unique của DB chặn lúc ghi, chỉ hủy dòng đó
    const dupName = `Trùng CCCD ${suffix}`;
    const r = await post(head, [{ fullName: dupName, nationalId: nid }, { fullName: `Dòng khác ${suffix}` }], false);
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.rows[0].status, "failed", JSON.stringify(r.json.rows[0]));
    ok(r.json.rows[0].messages.some((m) => m.includes("CCCD") && m.includes("đã có")), `thông báo: ${r.json.rows[0].messages}`);
    ok(!JSON.stringify(r.json).includes(nid), "không được lộ số CCCD trong kết quả");
    eq(r.json.rows[1].status, "created", "dòng hợp lệ khác vẫn được thêm");
    extra.push(`Dòng khác ${suffix}`);
    ok(!(await listNames()).includes(dupName), "dòng trùng CCCD không được để lại hồ sơ dở dang");
    const nid2 = `07930${n.padStart(7, "0")}`;
    const r2 = await post(head, [{ fullName: `CCCD A ${suffix}`, nationalId: nid2 }, { fullName: `CCCD B ${suffix}`, nationalId: nid2 }], true);
    eq(r2.json.rows[0].status, "ok");
    eq(r2.json.rows[1].status, "error");
    ok(r2.json.rows[1].messages.some((m) => m.includes("dòng 1")), "phải chỉ ra dòng 1");
  });

  await test("Cột mới sai định dạng ⇒ lỗi/cảnh báo đúng dòng, kèm thông điệp tiếng Việt", async () => {
    const bad = [
      { fullName: `CCCD ngắn ${suffix}`, nationalId: "12345" },
      { fullName: `Năm sai ${suffix}`, enrollmentYear: "20x2" },
      { fullName: `Thứ tự năm ${suffix}`, universityName: uni.name, enrollmentYear: "2026", expectedGraduationYear: "2022" },
      { fullName: `Quỹ sai ${suffix}`, customDuesVnd: "nhiều" },
      { fullName: `Tháng sai ${suffix}`, joinedOn: "13/2026" },
      { fullName: `Tình trạng lạ ${suffix}`, universityName: uni.name, studentStatus: "mơ mộng", hidePhone: "có thể" },
      { fullName: `Học vụ không trường ${suffix}`, major: "Toán", enrollmentYear: "2022", studentStatus: "Đã tốt nghiệp" },
    ];
    const r = await post(head, bad, true);
    eq(r.status, 200, JSON.stringify(r.json));
    const by = (line) => r.json.rows.find((x) => x.line === line);
    const has = (line, text) => ok(by(line).messages.some((m) => m.includes(text)), `dòng ${line} phải có “${text}”: ${JSON.stringify(by(line))}`);
    eq(by(1).status, "error"); has(1, "CCCD");
    eq(by(2).status, "error"); has(2, "Năm nhập học");
    eq(by(3).status, "error"); has(3, "sau");
    eq(by(4).status, "error"); has(4, "Định mức quỹ");
    eq(by(5).status, "error"); has(5, "Ngày vào nhà");
    eq(by(6).status, "warning"); has(6, "Tình trạng học tập"); has(6, "Ẩn SĐT");
    eq(by(7).status, "warning"); has(7, "trường");
  });

  await test("Ngày vào nhà MM/YYYY (và YYYY-MM), tiền “300k”, phòng gọi theo tên: tạo được và lưu đúng", async () => {
    const row = { fullName: `Tháng năm ${suffix}`, joinedOn: "2026-09", customDuesVnd: "300k", ...(bedroom ? { roomCode: bedroom.name } : {}) };
    const dry = await post(head, [row], true);
    eq(dry.json.rows[0].status, "ok", JSON.stringify(dry.json.rows[0]));
    const r = await post(head, [row], false);
    eq(r.json.created, 1, JSON.stringify(r.json.rows));
    extra.push(row.fullName);
    const { d } = await detailOf(row.fullName);
    eq(d.joinedOn, "2026-09-01");
    eq(d.customDuesVnd, 300000);
  });

  await test("Người nhập chỉ có member.create (thiếu quyền sửa hồ sơ/ghi riêng tư): các cột đó bị bỏ qua kèm thông báo, dòng vẫn thêm được", async () => {
    const admin = await as("viet.vu@luuxa.local");
    const tuanUid = (await admin.get("/api/v1/accounts")).json.items.find((a) => a.email === "tuan.nguyen@luuxa.local")?.userId;
    ok(tuanUid, "không thấy tài khoản tuan.nguyen");
    const roleCode = `imp_${suffix}`;
    eq((await admin.post("/api/v1/rbac/roles", { code: roleCode, name: `Ban Nhập thử ${suffix}`, permissions: ["member.read", "member.create"] })).status, 201);
    try {
      eq((await admin.post(`/api/v1/accounts/${tuanUid}/roles`, { role: roleCode, grant: true })).status, 200);
      const row = {
        fullName: `Hạn quyền ${suffix}`, phone: `93${n.slice(-6)}4`, hidePhone: "Có", birthDate: "01/01/2004", nationalId: `07940${n.padStart(7, "0")}`, fatherName: "Cha Thử",
        universityName: uni.name, major: "Toán", enrollmentYear: "2022", customDuesVnd: "100000",
      };
      const dry = await post(member, [row], true);
      eq(dry.status, 200, JSON.stringify(dry.json));
      eq(dry.json.rows[0].status, "ok", JSON.stringify(dry.json.rows[0]));
      eq(dry.json.notices.length, 4, JSON.stringify(dry.json.notices)); // riêng tư + Ẩn SĐT + học vụ + định mức quỹ
      const r = await post(member, [row], false);
      eq(r.json.created, 1, JSON.stringify(r.json.rows));
      extra.push(row.fullName);
      const { d } = await detailOf(row.fullName);
      eq(d.hidePhone, false, "Ẩn SĐT không được ghi");
      ok(!d.birthDateIso && !d.identityCard && !d.fatherName, "thông tin riêng tư không được ghi");
      ok(!d.universityId && !d.enrollmentYear, "học vụ không được ghi");
      ok(d.customDuesVnd === null || d.customDuesVnd === undefined, "định mức quỹ không được ghi");
    } finally {
      await admin.post(`/api/v1/accounts/${tuanUid}/roles`, { role: roleCode, grant: false });
      await admin.del(`/api/v1/rbac/roles/${roleCode}`);
    }
    eq((await post(member, [{ fullName: `Sau thu hồi ${suffix}` }], true)).status, 403, "thu hồi vai trò xong lại 403");
  });

  // dọn dẹp: đánh dấu đã rời để không lẫn vào sĩ số
  const all = (await head.get("/api/v1/members?includeFormer=1")).json;
  for (const nm of [...Object.values(names), ...extra]) {
    const m = all.find((x) => x.fullName === nm);
    if (m) await head.post(`/api/v1/members/${m.id}/status`, { status: "left", leftOn: null, reason: "Dữ liệu thử nghiệm" });
  }
}
