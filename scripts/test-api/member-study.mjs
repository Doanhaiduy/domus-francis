// Kiểm thử HỒ SƠ HỌC VỤ: niên khóa (năm nhập học → năm dự kiến ra trường), ngành học (chuỗi tự do — giao diện chọn từ danh sách + "Khác"),
// tháng/năm vào nhà lưu xá. Kiểm tra lưu/đọc, ràng buộc năm, xóa trắng, và khôi phục dữ liệu cũ sau khi chạy.

export async function run({ as, test, eq, ok, section }) {
  section("Hồ sơ học vụ: niên khóa, ngành, ngày vào nhà");

  const head = await as("duc.tran@luuxa.local"); // member.update
  const member = await as("tuan.nguyen@luuxa.local");
  const me = (await member.get("/api/v1/auth/me")).json;
  const id = me.member.id;
  const read = async () => (await head.get(`/api/v1/members/${id}`)).json;
  const before = await read();
  ok(before.universityId, "thành viên demo phải có hồ sơ học tập (trường) để lưu niên khóa");

  await test("Lưu niên khóa + ngành + tháng/năm vào nhà → đọc lại đúng (cả chi tiết lẫn danh bạ)", async () => {
    const r = await head.patch(`/api/v1/members/${id}`, { enrollmentYear: 2022, expectedGraduationYear: 2026, major: "Công nghệ thông tin", joinedOn: "2022-09-01" });
    eq(r.status, 200, JSON.stringify(r.json));
    const d = await read();
    eq(d.enrollmentYear, 2022);
    eq(d.expectedGraduationYear, 2026);
    eq(d.major, "Công nghệ thông tin");
    eq(d.joinedOn, "2022-09-01");
    const row = (await head.get("/api/v1/members")).json.find((m) => m.id === id);
    eq(row.enrollmentYear, 2022);
    eq(row.expectedGraduationYear, 2026);
  });

  await test("Năm ra trường trước năm nhập học → 400; năm vô lý → 400", async () => {
    eq((await head.patch(`/api/v1/members/${id}`, { enrollmentYear: 2026, expectedGraduationYear: 2022 })).status, 400);
    eq((await head.patch(`/api/v1/members/${id}`, { enrollmentYear: 1800 })).status, 400);
    eq((await head.patch(`/api/v1/members/${id}`, { expectedGraduationYear: 3000 })).status, 400);
    eq((await read()).enrollmentYear, 2022, "dữ liệu cũ không bị đổi khi gửi sai");
  });

  await test("Chỉ đổi một năm vẫn ràng buộc với năm còn lại; xóa trắng niên khóa (null) được", async () => {
    eq((await head.patch(`/api/v1/members/${id}`, { expectedGraduationYear: 2021 })).status, 400, "ra trường 2021 < nhập học 2022");
    eq((await head.patch(`/api/v1/members/${id}`, { expectedGraduationYear: 2027 })).status, 200);
    eq((await read()).expectedGraduationYear, 2027);
    eq((await head.patch(`/api/v1/members/${id}`, { enrollmentYear: null, expectedGraduationYear: null })).status, 200);
    const d = await read();
    ok(d.enrollmentYear === undefined || d.enrollmentYear === null, "đã xóa năm nhập học");
    ok(d.expectedGraduationYear === undefined || d.expectedGraduationYear === null, "đã xóa năm ra trường");
  });

  await test("Ngành tự nhập (ngoài danh sách) lưu được nguyên văn", async () => {
    eq((await head.patch(`/api/v1/members/${id}`, { major: "Kỹ thuật nuôi chim yến" })).status, 200);
    eq((await read()).major, "Kỹ thuật nuôi chim yến");
  });

  await test("Thành viên thường không sửa được ngày vào nhà của người khác (403) ", async () => {
    const other = (await head.get("/api/v1/members")).json.find((m) => m.id !== id);
    const r = await member.patch(`/api/v1/members/${other.id}`, { joinedOn: "2020-01-01" });
    eq(r.status, 403, JSON.stringify(r.json));
  });

  // khôi phục dữ liệu cũ
  await head.patch(`/api/v1/members/${id}`, {
    major: before.major ?? null,
    enrollmentYear: before.enrollmentYear ?? null,
    expectedGraduationYear: before.expectedGraduationYear ?? null,
    joinedOn: before.joinedOn,
  });
}
