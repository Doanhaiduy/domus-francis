// Kiểm thử MẠNG LƯỚI CỰU THÀNH VIÊN (/api/v1/alumni): chỉ liệt kê người đã ra trường / đã rời; hồ sơ nghề nghiệp chỉ hiện với thành viên
// thường khi được đánh dấu "còn giữ liên lạc" (đã đồng ý chia sẻ); người quản lý xem/sửa tất cả; thành viên thường không sửa được hồ sơ người khác.
// Dữ liệu thử: tạo thành viên mới qua nhập hàng loạt rồi chuyển sang "cựu"; dọn dẹp bằng cách chuyển sang "đã rời".

export async function run({ as, test, eq, ok, section, Client }) {
  section("Mạng lưới cựu thành viên");

  const anon = await new Client("anon").init();
  const head = await as("duc.tran@luuxa.local"); // member.update
  const member = await as("tuan.nguyen@luuxa.local");
  const suffix = Date.now().toString(36);
  const nameA = `Cựu Thử Một ${suffix}`;
  const nameB = `Cựu Thử Hai ${suffix}`;
  const get = async (c) => (await c.get("/api/v1/alumni")).json;
  const idOf = async (nm) => (await head.get("/api/v1/members?includeFormer=1")).json.find((m) => m.fullName === nm)?.id;

  await test("Chưa đăng nhập: 401", async () => eq((await anon.get("/api/v1/alumni")).status, 401));

  let a, b;
  await test("Chuẩn bị: hai thành viên thử → chuyển sang 'cựu thành viên' / 'đã rời'", async () => {
    const r = await head.post("/api/v1/members/import", { dryRun: false, rows: [{ fullName: nameA, joinedOn: "01/09/2022" }, { fullName: nameB, joinedOn: "01/09/2022" }] });
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.created, 2, JSON.stringify(r.json.rows));
    a = await idOf(nameA);
    b = await idOf(nameB);
    eq((await head.post(`/api/v1/members/${a}/status`, { status: "alumni", leftOn: "2026-06-30", reason: "Ra trường" })).status, 200);
    eq((await head.post(`/api/v1/members/${b}/status`, { status: "left", leftOn: "2026-07-15", reason: "Chuyển chỗ ở" })).status, 200);
  });

  await test("Danh sách chỉ gồm người đã ra trường / đã rời (không có thành viên đang ở)", async () => {
    const r = await get(member);
    ok(r.items.length >= 2, "phải có ít nhất 2 cựu");
    ok(r.items.every((x) => x.status === "alumni" || x.status === "left"), "có người đang ở lọt vào danh sách cựu");
    const x = r.items.find((i) => i.id === a);
    eq(x.status, "alumni");
    eq(x.leftOn, "2026-06-30");
    eq(r.items.find((i) => i.id === b).status, "left");
    eq(r.canManage, false);
  });

  await test("Người quản lý lưu hồ sơ cựu; năm ra trường ngoài 1980–2100 → 400", async () => {
    eq((await head.req("PUT", `/api/v1/alumni/${a}`, { graduationYear: 1900 })).status, 400);
    const r = await head.req("PUT", `/api/v1/alumni/${a}`, { graduationYear: 2026, occupation: "Kỹ sư phần mềm", workplace: "Công ty ABC", city: "TP. Hồ Chí Minh", keepsContact: false, note: "Sẵn lòng hướng dẫn thực tập" });
    eq(r.status, 200, JSON.stringify(r.json));
    const x = (await get(head)).items.find((i) => i.id === a);
    eq(x.occupation, "Kỹ sư phần mềm");
    eq(x.graduationYear, 2026);
    eq(x.keepsContact, false);
    eq((await get(head)).canManage, true);
  });

  await test("Chưa 'giữ liên lạc' ⇒ thành viên thường KHÔNG thấy nghề nghiệp/nơi làm việc; người quản lý thấy", async () => {
    const asMember = (await get(member)).items.find((i) => i.id === a);
    eq(asMember.occupation, null);
    eq(asMember.workplace, null);
    eq(asMember.note, null);
    eq((await get(head)).items.find((i) => i.id === a).occupation, "Kỹ sư phần mềm");
  });

  await test("Bật 'còn giữ liên lạc' ⇒ thành viên thường thấy thông tin đã chia sẻ", async () => {
    eq((await head.req("PUT", `/api/v1/alumni/${a}`, { graduationYear: 2026, occupation: "Kỹ sư phần mềm", workplace: "Công ty ABC", city: "TP. Hồ Chí Minh", keepsContact: true, note: null })).status, 200);
    const x = (await get(member)).items.find((i) => i.id === a);
    eq(x.keepsContact, true);
    eq(x.workplace, "Công ty ABC");
    eq(x.city, "TP. Hồ Chí Minh");
    eq(x.canEdit, false, "thành viên thường không sửa được");
  });

  await test("Thành viên thường không sửa được hồ sơ cựu của người khác (403)", async () => {
    const r = await member.req("PUT", `/api/v1/alumni/${a}`, { occupation: "Hack", keepsContact: true });
    eq(r.status, 403, JSON.stringify(r.json));
    eq((await get(head)).items.find((i) => i.id === a).occupation, "Kỹ sư phần mềm");
  });

  await test("Xóa trắng các ô ⇒ lưu null; thành viên không tồn tại ⇒ 404", async () => {
    eq((await head.req("PUT", `/api/v1/alumni/${b}`, { occupation: "  ", workplace: "", keepsContact: false })).status, 200);
    const x = (await get(head)).items.find((i) => i.id === b);
    eq(x.occupation, null);
    eq(x.workplace, null);
    eq((await head.req("PUT", "/api/v1/alumni/00000000-0000-4000-8000-000000000000", { keepsContact: false })).status, 404);
  });

  // dọn dẹp
  for (const id of [a, b]) if (id) await head.post(`/api/v1/members/${id}/status`, { status: "left", leftOn: null, reason: "Dữ liệu thử nghiệm" });
}
