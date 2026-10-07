// Kiểm thử ADMIN DỌN DỮ LIỆU RÁC (db/app/1028): quyền data.purge chỉ của Admin; xóa vĩnh viễn đơn xin phép, báo hỏng, ý cầu nguyện,
// đăng ký tìm hiểu, đơn vào nhà đã xử lý. Người khác (Trưởng nhà, thành viên) bị chặn 403; xóa lần hai trả 404.

export async function run({ as, test, eq, ok, section, BASE, Client }) {
  section("Admin dọn dữ liệu rác");

  const admin = await as("viet.vu@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const stamp = Date.now();
  const hour = 3600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();

  await test("Chỉ Admin có quyền data.purge", async () => {
    ok((await admin.get("/api/v1/auth/me")).json.permissions.includes("data.purge"), "Admin phải có data.purge");
    ok(!(await head.get("/api/v1/auth/me")).json.permissions.includes("data.purge"), "Trưởng nhà không được có data.purge");
    ok(!(await member.get("/api/v1/auth/me")).json.permissions.includes("data.purge"), "Thành viên không được có data.purge");
  });

  // ---------------------------------------------------------------- đơn xin phép
  await test("Đơn xin phép: Admin xóa được (mọi trạng thái); Trưởng nhà/thành viên 403; xóa lại 404", async () => {
    const r = await member.post("/api/v1/leave", { kind: "late_return", startsAt: iso(2 * hour), endsAt: iso(5 * hour), reason: `Dữ liệu rác ${stamp}` });
    eq(r.status, 201, JSON.stringify(r.json));
    const id = r.json.id;
    eq((await member.del(`/api/v1/leave/${id}`)).status, 403);
    eq((await head.del(`/api/v1/leave/${id}`)).status, 403);
    ok((await admin.get("/api/v1/leave")).json.review.some((x) => x.id === id), "Admin thấy đơn trước khi xóa");
    eq((await admin.del(`/api/v1/leave/${id}`)).status, 200);
    ok(!(await admin.get("/api/v1/leave")).json.review.some((x) => x.id === id), "đơn đã biến mất");
    ok(!(await member.get("/api/v1/leave")).json.mine.some((x) => x.id === id), "người xin cũng không còn thấy");
    eq((await admin.del(`/api/v1/leave/${id}`)).status, 404);
  });
  await test("Đơn xin phép đã được duyệt cũng xóa được", async () => {
    const r = await member.post("/api/v1/leave", { kind: "late_return", startsAt: iso(2 * hour), endsAt: iso(5 * hour), reason: `Rác đã duyệt ${stamp}` });
    eq(r.status, 201);
    eq((await head.patch(`/api/v1/leave/${r.json.id}`, { action: "approve" })).status, 200);
    eq((await admin.del(`/api/v1/leave/${r.json.id}`)).status, 200);
  });

  // ---------------------------------------------------------------- báo hỏng / sự cố (có nhật ký trạng thái bất biến)
  await test("Báo hỏng: Admin xóa được kể cả khi đã có nhật ký trạng thái; người khác 403", async () => {
    const r = await member.post("/api/v1/issues", { title: `Bóng đèn rác ${stamp}`, locationText: "Hành lang tầng 2", urgency: "low" });
    eq(r.status, 201, JSON.stringify(r.json));
    const id = r.json.id;
    eq((await head.patch(`/api/v1/issues/${id}`, { status: "in_progress", reason: "Đã tiếp nhận" })).status, 200);
    eq((await member.del(`/api/v1/issues/${id}`)).status, 403);
    eq((await head.del(`/api/v1/issues/${id}`)).status, 403);
    eq((await admin.del(`/api/v1/issues/${id}`)).status, 200, "xóa sự cố có lịch sử");
    eq((await admin.get(`/api/v1/issues/${id}`)).status, 404);
    eq((await admin.del(`/api/v1/issues/${id}`)).status, 404);
  });

  // ---------------------------------------------------------------- ý cầu nguyện
  await test("Ý cầu nguyện: Admin xóa được; người khác 403", async () => {
    const r = await member.post("/api/v1/prayers", { content: `Xin cầu nguyện cho dữ liệu rác ${stamp}`, anonymous: false });
    eq(r.status, 201, JSON.stringify(r.json));
    const id = r.json.id;
    eq((await member.del(`/api/v1/prayers/${id}`)).status, 403);
    eq((await admin.del(`/api/v1/prayers/${id}`)).status, 200);
    ok(!(await admin.get("/api/v1/prayers")).json.items.some((x) => x.id === id), "ý cầu nguyện đã biến mất");
    eq((await admin.del(`/api/v1/prayers/${id}`)).status, 404);
  });

  // ---------------------------------------------------------------- đăng ký tìm hiểu
  await test("Đăng ký tìm hiểu: Admin xóa được; người khác 403", async () => {
    const phone = `09${String(stamp).slice(-8)}`;
    const res = await fetch(BASE + "/api/v1/public/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.77.66.55" },
      body: JSON.stringify({ startedAt: Date.now() - 10_000, fullName: `Người Thử Rác ${stamp}`, phone, message: "Dữ liệu thử." }),
    });
    eq(res.status, 200);
    const it = (await head.get("/api/v1/inquiries")).json.inquiries.find((x) => x.phone === phone);
    ok(it, "Trưởng nhà thấy đăng ký");
    eq((await head.del(`/api/v1/inquiries/${it.id}`)).status, 403);
    eq((await admin.del(`/api/v1/inquiries/${it.id}`)).status, 200);
    ok(!(await head.get("/api/v1/inquiries")).json.inquiries.some((x) => x.id === it.id), "đăng ký đã biến mất");
  });

  // ---------------------------------------------------------------- đơn xin vào nhà
  await test("Đơn vào nhà: đang chờ duyệt thì KHÔNG xóa được (422); đã từ chối thì Admin xóa được", async () => {
    const email = `rac.${stamp}@luuxa.local`;
    const applicant = await new Client("rac").init();
    eq((await applicant.post("/api/v1/auth/register", { fullName: "Người Đăng Ký Rác", email, password: "MatKhau2026", universityName: "ĐH Thử" })).status, 201);
    const appId = (await head.get("/api/v1/applications")).json.find((a) => a.email === email)?.id;
    ok(appId, "thấy đơn mới");
    eq((await head.del(`/api/v1/applications/${appId}`)).status, 403);
    const pending = await admin.del(`/api/v1/applications/${appId}`);
    ok(pending.status === 422 || pending.status === 400, "đơn chờ duyệt phải bị từ chối xóa: " + pending.status + " " + JSON.stringify(pending.json));
    eq((await head.post(`/api/v1/applications/${appId}/reject`, { note: "Dữ liệu thử nghiệm, từ chối." })).status, 200);
    eq((await admin.del(`/api/v1/applications/${appId}`)).status, 200);
    ok(!(await admin.get("/api/v1/applications?all=1")).json.some((a) => a.id === appId), "đơn đã biến mất");
  });
}
