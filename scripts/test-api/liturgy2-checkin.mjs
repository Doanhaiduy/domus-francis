// Kiểm thử gói C — CHECK-IN ĐI LỄ BỚT VIỆC TAY (db/app/1048 + liturgy-calendar.ts):
//   • cấu hình liturgy.auto_approve_no_photo (mặc định bật, Ban Phụng vụ sửa được, thành viên thì không);
//   • ngày KHÔNG cần ảnh ⇒ check-in được tự xác nhận ngay; tắt cấu hình ⇒ chờ duyệt; ảnh kèm theo giống ảnh người khác (pHash) hoặc chụp sai
//     ngày (EXIF) ⇒ vẫn chờ duyệt; gửi lại sau khi bị từ chối ⇒ duyệt tay; ngày CẦN ảnh ⇒ luôn chờ duyệt;
//   • chính chủ hủy được bản tự xác nhận (không hủy được bản người duyệt đã xác nhận);
//   • hàng đợi chờ duyệt nhiều ngày (cờ cảnh báo, của chính mình) + duyệt hàng loạt ("Duyệt tất cả" một ngày bỏ qua bản có cảnh báo,
//     theo danh sách, từ chối cần lý do) — chỉ người có liturgy.calendar.manage; thông báo kết quả có payload.link mở đúng ngày;
//   • báo cáo đi lễ (dữ liệu xuất Excel): thành viên × ngày; Tổng kết thành viên có mục Đi lễ theo quyền.
// Dùng ngày đặc biệt của nhà (tạo trong ca, tên bắt đầu "AAA") cho hôm nay / hôm qua để không phụ thuộc thứ trong tuần; tự dọn khi xong.
import pg from "pg";
import sharp from "sharp";

const DAY = 86_400_000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isSunday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
const TITLE = "AAA kiểm thử liturgy2";

/** Ảnh khối 9×8 ngẫu nhiên theo hạt giống (dHash ổn định khi nén lại); cùng hạt giống + chất lượng khác ⇒ khác byte nhưng pHash giống nhau. */
async function blockImage(seed, quality = 90) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const px = Buffer.alloc(9 * 8 * 3);
  for (let y = 0; y < 8; y++) {
    let prev = -999;
    for (let x = 0; x < 9; x++) {
      let v;
      do v = 18 + Math.floor(rnd() * 220);
      while (Math.abs(v - prev) < 45);
      prev = v;
      px.fill(v, (y * 9 + x) * 3, (y * 9 + x) * 3 + 3);
    }
  }
  return sharp(px, { raw: { width: 9, height: 8, channels: 3 } }).resize(360, 320, { kernel: "nearest" }).jpeg({ quality }).toBuffer();
}

async function upload(c, buf, exifDate) {
  const form = new FormData();
  form.append("bucket", "attachments");
  form.append("file", new Blob([buf], { type: "image/jpeg" }), "le.jpg");
  if (exifDate) form.append("exifDate", exifDate);
  const r = await c.req("POST", "/api/v1/files", undefined, { form });
  if (r.status !== 200) throw new Error(`tải ảnh lỗi ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.id;
}

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Gói C — Check-in đi lễ: tự xác nhận, hàng đợi chờ duyệt, duyệt hàng loạt, báo cáo & tổng kết");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const A = await as("nam.phan@luuxa.local"); // thành viên
  const B = await as("kiet.do@luuxa.local"); // thành viên
  const C = await as("hieu.bui@luuxa.local"); // thành viên
  const H = await as("duc.tran@luuxa.local"); // Trưởng nhà (duyệt check-in + xem tổng kết cả nhà)
  const R = await as("phong.dang@luuxa.local"); // Trưởng ban Phụng vụ (duyệt check-in, không có report.read)
  const T = await as("bao.pham@luuxa.local"); // Thủ quỹ (xem tổng kết cả nhà nhưng không duyệt check-in)
  const me = async (c) => (await c.get("/api/v1/auth/me")).json.member;
  const [mA, mB, mC, mH, mR, mT] = await Promise.all([A, B, C, H, R, T].map(me));
  const today = (await A.get(`/api/v1/liturgy/calendar?from=2026-01-01&to=2026-01-02`)).json.today;
  const X = today; // ngày đặc biệt KHÔNG cần ảnh
  const Y = isSunday(addDays(today, -1)) ? addDays(today, -2) : addDays(today, -1); // ngày đặc biệt CẦN ảnh (không phải Chúa Nhật)
  const people = [mA, mB, mC, mH, mR, mT].map((m) => m.id);
  const code = (r) => r.json?.code ?? "";
  const checkin = (c, date, extra = {}) => c.post("/api/v1/liturgy/checkins", { date, church: "Nhà thờ Chánh Tòa Kitô Vua", ...extra });
  const dbRow = async (id) => (await sql("SELECT status, auto_approved, reviewed_by, review_note FROM mass_checkins WHERE id = $1", [id])).rows[0];
  const setting = async (c, value) => c.patch("/api/v1/settings", { changes: [{ key: "liturgy.auto_approve_no_photo", value }] });

  const cleanup = async () => {
    await sql("DELETE FROM mass_checkins WHERE member_id = ANY($1::uuid[]) AND day_date = ANY($2::date[])", [people, [X, Y]]);
    await sql("DELETE FROM liturgy_special_days WHERE title LIKE $1", [`${TITLE}%`]);
  };
  await cleanup();
  const original = (await sql("SELECT value FROM settings WHERE key = 'liturgy.auto_approve_no_photo'")).rows[0]?.value;
  if (original !== true) await sql("UPDATE settings SET value = 'true'::jsonb WHERE key = 'liturgy.auto_approve_no_photo'");

  const ids = {};
  try {
    await test("Cấu hình liturgy.auto_approve_no_photo: mặc định bật; Ban Phụng vụ sửa được, thành viên thường không", async () => {
      const s = (await R.get("/api/v1/settings")).json.items.find((x) => x.key === "liturgy.auto_approve_no_photo");
      ok(s, "thiếu khóa cấu hình (chưa áp db/app/1048?)");
      eq(s.value, true);
      eq(s.canWrite, true, "Trưởng ban Phụng vụ sửa được");
      eq(s.defaultValue, true);
      const mine = (await A.get("/api/v1/settings")).json.items.find((x) => x.key === "liturgy.auto_approve_no_photo");
      eq(mine?.canWrite ?? false, false);
      eq((await setting(A, false)).status, 403);
    });

    await test("Chuẩn bị: hai ngày đặc biệt bắt check-in (hôm nay không cần ảnh, hôm trước cần ảnh)", async () => {
      const mk = (date, evidenceRequired, suffix) =>
        R.post("/api/v1/liturgy/special-days", { title: `${TITLE} ${suffix}`, month: +date.slice(5, 7), day: +date.slice(8, 10), year: +date.slice(0, 4), color: "blue", requiresCheckin: true, evidenceRequired, notify: false });
      const x = await mk(X, false, "không ảnh");
      eq(x.status, 201, JSON.stringify(x.json));
      const y = await mk(Y, true, "cần ảnh");
      eq(y.status, 201, JSON.stringify(y.json));
      ids.specialX = x.json.id;
      ids.specialY = y.json.id;
      const dx = (await A.get(`/api/v1/liturgy/calendar/${X}`)).json;
      eq(dx.requirement.occasion, `special:${ids.specialX}`);
      eq(dx.requirement.evidenceRequired, false);
      eq(dx.autoApprove, true, "ngày không cần ảnh + cấu hình bật ⇒ tự xác nhận");
      const dy = (await A.get(`/api/v1/liturgy/calendar/${Y}`)).json;
      eq(dy.requirement.evidenceRequired, true);
      eq(dy.autoApprove, false);
    });

    // Tổng kết tháng TRƯỚC khi check-in (để so phần tăng — các bộ kiểm thử khác có thể đã có dữ liệu trong tháng)
    const [yy, mm] = today.split("-").map(Number);
    const monthQs = (scope) => `kind=month&year=${yy}&month=${mm}&scope=${scope}`;
    const rowOf = (r, id) => r.json.members.find((x) => x.memberId === id);
    const baseAll = await H.get(`/api/v1/reports/members?${monthQs("all")}`);
    const baseMe = await A.get(`/api/v1/reports/members?${monthQs("me")}`);

    await test("Ngày không cần ảnh: check-in được TỰ XÁC NHẬN ngay (không người duyệt); chính chủ hủy được rồi check-in lại", async () => {
      const r = await checkin(A, X);
      eq(r.status, 201, JSON.stringify(r.json));
      eq(r.json.status, "approved");
      eq(r.json.autoApproved, true);
      ids.aX = r.json.id;
      const row = await dbRow(ids.aX);
      eq(row.auto_approved, true);
      eq(row.reviewed_by, null);
      const d = (await A.get(`/api/v1/liturgy/calendar/${X}`)).json;
      eq(d.myCheckin.status, "approved");
      eq(d.myCheckin.autoApproved, true);
      eq(d.canCheckin, false, "đã xác nhận thì không gửi lại");
      eq(d.canCancelCheckin, true, "bản tự xác nhận còn hạn ⇒ hủy được");
      const m = (await A.get(`/api/v1/liturgy/calendar?from=${X}&to=${X}`)).json.days[0];
      eq(m.myCheckin.autoApproved, true);
      eq((await A.del(`/api/v1/liturgy/checkins/${ids.aX}`)).status, 200);
      const again = await checkin(A, X);
      eq(again.json.status, "approved");
      ids.aX = again.json.id;
    });

    await test("Tắt cấu hình ⇒ check-in ngày không cần ảnh vẫn CHỜ DUYỆT; bật lại ⇒ tự xác nhận như cũ", async () => {
      eq((await setting(R, false)).status, 200);
      eq((await A.get(`/api/v1/liturgy/calendar/${X}`)).json.autoApprove, false);
      const r = await checkin(B, X);
      eq(r.status, 201, JSON.stringify(r.json));
      eq(r.json.status, "submitted");
      eq(r.json.autoApproved, false);
      ids.bX = r.json.id;
      eq((await setting(R, true)).status, 200);
    });

    await test("Kèm ảnh: ảnh bình thường ⇒ tự xác nhận; ảnh GIỐNG ảnh người khác cùng ngày hoặc chụp SAI NGÀY ⇒ chờ duyệt", async () => {
      const f1 = await upload(C, await blockImage(1101, 92));
      const c1 = await checkin(C, X, { evidenceFileId: f1 });
      eq(c1.status, 201, JSON.stringify(c1.json));
      eq(c1.json.status, "approved", "ảnh không bị cảnh báo ⇒ tự xác nhận");
      ids.cX = c1.json.id;
      const dup = await upload(H, await blockImage(1101, 70)); // cùng ảnh, nén khác ⇒ khác SHA-256 nhưng pHash giống
      const h1 = await checkin(H, X, { evidenceFileId: dup });
      eq(h1.status, 201, JSON.stringify(h1.json));
      eq(h1.json.status, "submitted", "ảnh giống ảnh của người khác ⇒ duyệt tay");
      ids.hX = h1.json.id;
      const old = await upload(T, await blockImage(2202, 90), "2020:01:05 08:30:00");
      const t1 = await checkin(T, X, { evidenceFileId: old });
      eq(t1.json.status, "submitted", "ảnh chụp năm 2020 ⇒ duyệt tay");
      ids.tX = t1.json.id;
    });

    await test("Ngày CẦN ảnh: luôn chờ duyệt (kể cả cấu hình bật); thiếu ảnh ⇒ 422", async () => {
      eq(code(await checkin(C, Y)), "EVIDENCE_REQUIRED");
      const c2 = await checkin(C, Y, { evidenceFileId: await upload(C, await blockImage(3303)) });
      eq(c2.json.status, "submitted");
      ids.cY = c2.json.id;
      const b2 = await checkin(B, Y, { evidenceFileId: await upload(B, await blockImage(4404), "2019:06:01 10:00:00") });
      eq(b2.json.status, "submitted");
      ids.bY = b2.json.id;
      const r2 = await checkin(R, Y, { evidenceFileId: await upload(R, await blockImage(5505)) });
      eq(r2.json.status, "submitted");
      ids.rY = r2.json.id;
    });

    await test("Hàng đợi chờ duyệt nhiều ngày: chỉ người duyệt; có cờ ảnh trùng / sai ngày, đánh dấu bản của chính mình", async () => {
      eq((await A.get("/api/v1/liturgy/checkins/pending")).status, 403);
      eq((await T.get("/api/v1/liturgy/checkins/pending")).status, 403, "Thủ quỹ không duyệt check-in");
      const q = await R.get("/api/v1/liturgy/checkins/pending");
      eq(q.status, 200, JSON.stringify(q.json));
      const by = Object.fromEntries(q.json.items.map((i) => [i.checkin.id, i]));
      for (const k of ["bX", "hX", "tX", "cY", "bY", "rY"]) ok(by[ids[k]], `thiếu ${k} trong hàng đợi`);
      ok(!by[ids.aX] && !by[ids.cX], "bản đã tự xác nhận không nằm trong hàng đợi");
      eq(by[ids.bX].flagged, false);
      eq(by[ids.hX].flagged, true);
      ok(by[ids.hX].duplicateOf, "ảnh của Trưởng nhà giống ảnh của C ⇒ phải có tên người có ảnh giống");
      ok(/Ảnh chụp ngày 5\/1\/2020/.test(by[ids.tX].warning ?? ""), by[ids.tX].warning);
      eq(by[ids.rY].isMe, true);
      eq(by[ids.cY].evidenceRequired, true);
      eq(by[ids.cY].label, `${TITLE} cần ảnh`);
      eq(q.json.approvable, q.json.items.filter((i) => !i.flagged && !i.isMe).length);
      ok(q.json.total >= 6);
      eq(q.json.autoApproveNoPhoto, true);
      // Danh sách cả nhà của ngày (khung ngày trên Lịch): cùng cờ
      const day = (await R.get(`/api/v1/liturgy/calendar/${X}`)).json.attendance;
      const rowH = day.rows.find((r) => r.memberId === mH.id);
      eq(rowH.flagged, true);
      ok(day.pending >= 3, `pending ${day.pending}`);
      eq(day.rows.find((r) => r.memberId === mA.id).checkin.autoApproved, true);
    });

    await test("Duyệt hàng loạt: thành viên / Thủ quỹ ⇒ 403; lý do từ chối bắt buộc; tham số thiếu ⇒ 400", async () => {
      eq((await A.post("/api/v1/liturgy/checkins/review-bulk", { date: X, status: "approved" })).status, 403);
      eq((await T.post("/api/v1/liturgy/checkins/review-bulk", { ids: [ids.bX], status: "approved" })).status, 403);
      eq((await R.post("/api/v1/liturgy/checkins/review-bulk", { ids: [ids.hX], status: "rejected" })).status, 400, "thiếu lý do");
      eq((await R.post("/api/v1/liturgy/checkins/review-bulk", { status: "approved" })).status, 400, "thiếu ids/date");
      eq((await R.post("/api/v1/liturgy/checkins/review-bulk", { date: X, status: "rejected", note: "abc" })).status, 400, "duyệt theo ngày chỉ để xác nhận hợp lệ");
    });

    await test("“Duyệt tất cả” một ngày: xác nhận bản sạch, BỎ QUA bản có cảnh báo; người check-in nhận thông báo có link mở đúng ngày", async () => {
      const started = (await sql("SELECT now() AS t")).rows[0].t;
      const r = await R.post("/api/v1/liturgy/checkins/review-bulk", { date: X, status: "approved" });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.reviewed >= 1, JSON.stringify(r.json));
      const skipped = Object.fromEntries(r.json.skipped.map((s) => [s.id, s.reason]));
      ok(/Ảnh giống/.test(skipped[ids.hX] ?? ""), JSON.stringify(r.json.skipped));
      ok(/Ảnh chụp ngày/.test(skipped[ids.tX] ?? ""), JSON.stringify(r.json.skipped));
      const b = await dbRow(ids.bX);
      eq(b.status, "approved");
      eq(b.auto_approved, false, "người duyệt xác nhận ⇒ không phải tự động");
      ok(b.reviewed_by, "ghi người duyệt");
      eq((await dbRow(ids.hX)).status, "submitted");
      eq((await dbRow(ids.tX)).status, "submitted");
      const n = (
        await sql("SELECT title, payload FROM notifications WHERE member_id = $1 AND type_code = 'liturgy.checkin_reviewed' AND created_at >= $2", [mB.id, started])
      ).rows;
      eq(n.length, 1, JSON.stringify(n));
      eq(n[0].payload.link, `/lich-su-kien?date=${X}`);
      ok(!("href" in n[0].payload), "payload dùng khóa link (không còn href)");
      // Bản người duyệt đã xác nhận thì chính chủ không tự hủy được
      eq((await B.del(`/api/v1/liturgy/checkins/${ids.bX}`)).status, 409);
    });

    await test("“Duyệt tất cả” ngày cần ảnh: bỏ qua bản sai ngày và bản CỦA CHÍNH người duyệt; duyệt theo danh sách thì xác nhận cả bản có cảnh báo", async () => {
      const r = await R.post("/api/v1/liturgy/checkins/review-bulk", { date: Y, status: "approved" });
      eq(r.status, 200, JSON.stringify(r.json));
      const skipped = Object.fromEntries(r.json.skipped.map((s) => [s.id, s.reason]));
      ok(/chính bạn/.test(skipped[ids.rY] ?? ""), JSON.stringify(r.json.skipped));
      ok(/Ảnh chụp ngày/.test(skipped[ids.bY] ?? ""), JSON.stringify(r.json.skipped));
      eq((await dbRow(ids.cY)).status, "approved");
      const l = await R.post("/api/v1/liturgy/checkins/review-bulk", { ids: [ids.bY, ids.rY, ids.cY], status: "approved" });
      eq(l.status, 200, JSON.stringify(l.json));
      eq(l.json.reviewed, 1);
      const why = Object.fromEntries(l.json.skipped.map((s) => [s.id, s.reason]));
      ok(/chính bạn/.test(why[ids.rY] ?? "") && /xử lý/.test(why[ids.cY] ?? ""), JSON.stringify(l.json.skipped));
      eq((await dbRow(ids.bY)).status, "approved");
      eq((await dbRow(ids.rY)).status, "submitted");
      // Trưởng nhà duyệt bản của Trưởng ban Phụng vụ
      eq((await H.post("/api/v1/liturgy/checkins/review-bulk", { ids: [ids.rY], status: "approved" })).json.reviewed, 1);
    });

    await test("Từ chối hàng loạt kèm lý do; gửi lại sau khi bị từ chối ⇒ duyệt tay dù ngày không cần ảnh", async () => {
      const r = await R.post("/api/v1/liturgy/checkins/review-bulk", { ids: [ids.hX, ids.tX], status: "rejected", note: "Ảnh không phải Thánh lễ hôm nay" });
      eq(r.json.reviewed, 2, JSON.stringify(r.json));
      const h = await dbRow(ids.hX);
      eq(h.status, "rejected");
      eq(h.review_note, "Ảnh không phải Thánh lễ hôm nay");
      const again = await checkin(H, X, { evidenceFileId: await upload(H, await blockImage(6606)) });
      eq(again.status, 201, JSON.stringify(again.json));
      eq(again.json.status, "submitted", "đã bị từ chối ⇒ không tự xác nhận lại");
      // Người duyệt "đặt lại chờ duyệt" một bản tự xác nhận ⇒ chờ duyệt thật, không bị tự xác nhận lại
      eq((await R.post(`/api/v1/liturgy/checkins/${ids.aX}/review`, { status: "submitted" })).status, 200);
      const a = await dbRow(ids.aX);
      eq(a.status, "submitted");
      eq(a.auto_approved, false);
      eq((await R.post(`/api/v1/liturgy/checkins/${ids.aX}/review`, { status: "approved" })).status, 200);
    });

    await test("Báo cáo đi lễ (dữ liệu xuất Excel): thành viên × ngày, ô đúng trạng thái; ≤ 366 ngày; chỉ người duyệt", async () => {
      const from = Y < X ? Y : X;
      eq((await A.get(`/api/v1/liturgy/report?from=${from}&to=${X}`)).status, 403);
      eq((await R.get(`/api/v1/liturgy/report?from=${addDays(X, -400)}&to=${X}`)).status, 400);
      const r = await R.get(`/api/v1/liturgy/report?from=${from}&to=${X}`);
      eq(r.status, 200, JSON.stringify(r.json).slice(0, 300));
      const di = (d) => r.json.days.findIndex((x) => x.date === d);
      ok(di(X) >= 0 && di(Y) >= 0, JSON.stringify(r.json.days.map((d) => d.date)));
      eq(r.json.days[di(Y)].evidenceRequired, true);
      ok(r.json.members.every((m) => m.cells.length === r.json.days.length), "mỗi dòng đủ ô theo ngày");
      const cell = (m, d) => r.json.members.find((x) => x.memberId === m.id)?.cells[di(d)];
      eq(cell(mA, X), "approved");
      eq(cell(mH, X), "submitted");
      eq(cell(mT, X), "rejected");
      eq(cell(mC, Y), "approved");
      eq(cell(mA, Y), "open", "chưa check-in nhưng còn hạn ⇒ chưa tính vắng");
      const rowT = r.json.members.find((x) => x.memberId === mT.id);
      ok(rowT.missing.includes(X) && rowT.missed >= 1, "check-in chưa hợp lệ tính là vắng");
      const dx = r.json.days[di(X)];
      ok(dx.pending >= 1 && dx.checkedIn >= 3, JSON.stringify(dx));
    });

    await test("Tổng kết thành viên có mục Đi lễ: Trưởng nhà thấy (phần tăng khớp), Thủ quỹ không thấy, thành viên thấy của mình", async () => {
      const r = await H.get(`/api/v1/reports/members?${monthQs("all")}`);
      eq(r.status, 200, JSON.stringify(r.json).slice(0, 300));
      eq(r.json.sections.mass, true);
      const a0 = rowOf(baseAll, mA.id).mass;
      const a1 = rowOf(r, mA.id).mass;
      eq(a1.approved - a0.approved, 1, "A: +1 lễ được xác nhận (hôm nay)");
      eq(a1.required - a0.required, 1);
      eq(a1.missed - a0.missed, 0);
      const h0 = rowOf(baseAll, mH.id).mass;
      const h1 = rowOf(r, mH.id).mass;
      eq(h1.pending - h0.pending, 1, "Trưởng nhà: bản gửi lại đang chờ duyệt");
      const t = r.json.house_totals.mass;
      eq(t.required, r.json.members.reduce((s, m) => s + (m.mass?.required ?? 0), 0), "tổng cả nhà = cộng từng người");
      eq(t.approved, r.json.members.reduce((s, m) => s + (m.mass?.approved ?? 0), 0));
      ok(t.days >= 1);
      ok(a1.ratePct === null || (a1.ratePct >= 0 && a1.ratePct <= 100));
      const tr = await T.get(`/api/v1/reports/members?${monthQs("all")}`);
      eq(tr.status, 200);
      eq(tr.json.sections.mass, false, "Thủ quỹ không duyệt check-in ⇒ không xem đi lễ cả nhà");
      ok(tr.json.members.every((m) => m.mass === null));
      eq(tr.json.house_totals.mass, null);
      const mine = await A.get(`/api/v1/reports/members?${monthQs("me")}`);
      eq(mine.json.sections.mass, true);
      eq(mine.json.members[0].mass.approved - baseMe.json.members[0].mass.approved, 1);
    });
  } finally {
    await cleanup();
    if (original !== undefined && original !== true) await sql("UPDATE settings SET value = $1::jsonb WHERE key = 'liturgy.auto_approve_no_photo'", [JSON.stringify(original)]);
  }
}
