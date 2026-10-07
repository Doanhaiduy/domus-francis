// Kiểm thử ĐIỂM DANH SỰ KIỆN BẰNG ẢNH (db/app/1033) thay cho QR: thành viên chụp ảnh gửi lại là được điểm danh (giờ máy chủ, có mặt/đi muộn do DB tính),
// chỉ trong cửa sổ điểm danh, ảnh phải do chính mình tải lên, ảnh chỉ chính chủ + ban tổ chức/người điểm danh xem, gửi lại không đổi kết quả, QR cũ đã gỡ.
import sharp from "sharp";

async function upload(c) {
  const jpg = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 60, g: 120, b: 90 } } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("bucket", "attachments");
  form.append("file", new Blob([jpg], { type: "image/jpeg" }), "diem-danh.jpg");
  const r = await c.req("POST", "/api/v1/files", undefined, { form });
  if (r.status !== 200) throw new Error(`tải ảnh lỗi ${r.status}`);
  return r.json.id;
}

export async function run({ as, test, eq, ok, section }) {
  section("Điểm danh sự kiện bằng ảnh (thay QR)");
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: có quyền điểm danh hộ / xem điểm danh
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const suffix = Date.now().toString(36);
  const minute = 60_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const memberId = (await member.get("/api/v1/auth/me")).json.member.id;

  const mk = async (extra) => {
    const r = await head.post("/api/v1/events", { title: `Sinh hoạt thử ${suffix}`, startsAt: iso(20 * minute), endsAt: iso(80 * minute), categoryCode: "EVT_SOCIAL", hasCheckIn: true, ...extra });
    if (r.status !== 201) throw new Error(`tạo sự kiện lỗi ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.id;
  };
  const created = [];
  let evId;
  let fid;

  await test("Sự kiện không còn QR: DTO không có canQr/qrSession; các đường dẫn QR cũ không còn", async () => {
    evId = await mk();
    created.push(evId);
    const ev = (await head.get(`/api/v1/events/${evId}`)).json;
    ok(ev && ev.id === evId, "không đọc được sự kiện");
    ok(!("qrSession" in ev) && !("canQr" in ev), "DTO còn trường QR cũ");
    eq((await head.get(`/api/v1/events/${evId}/qr`)).status, 404, "GET /qr đã gỡ");
    eq((await head.post(`/api/v1/events/${evId}/qr`, {})).status, 404, "POST /qr đã gỡ");
  });

  await test("Gửi điểm danh thiếu ảnh / dùng ảnh của người khác → bị từ chối", async () => {
    eq((await member.post("/api/v1/events/checkin", { eventId: evId })).status, 400, "thiếu fileId");
    eq((await member.post("/api/v1/events/checkin", { fileId: "00000000-0000-4000-8000-000000000000" })).status, 400, "thiếu eventId");
    const foreign = await upload(other);
    const r = await member.post("/api/v1/events/checkin", { eventId: evId, fileId: foreign });
    ok([403, 409, 422].includes(r.status), `ảnh của người khác phải bị chặn: ${r.status} ${JSON.stringify(r.json)}`);
    const none = await member.post("/api/v1/events/checkin", { eventId: evId, fileId: "00000000-0000-4000-8000-000000000000" });
    ok([403, 404, 409, 422].includes(none.status), `ảnh không tồn tại: ${none.status}`);
  });

  await test("Chụp ảnh gửi lại → điểm danh có mặt; giờ là giờ máy chủ; trả kết quả cho thành viên", async () => {
    fid = await upload(member);
    const r = await member.post("/api/v1/events/checkin", { eventId: evId, fileId: fid });
    eq(r.status, 200, JSON.stringify(r.json));
    eq(r.json.eventId, evId);
    eq(r.json.status, "present", "sự kiện chưa bắt đầu ⇒ có mặt (đúng giờ)");
    ok(/^\d{2}:\d{2}$/.test(r.json.time ?? ""), "thiếu giờ ghi nhận: " + r.json.time);
    const ev = (await member.get(`/api/v1/events/${evId}`)).json;
    eq(ev.myAttendance?.status, "present");
    eq(ev.myAttendance?.method, "photo");
  });

  await test("Ảnh điểm danh: chính chủ + người điểm danh hộ xem được; thành viên khác 404", async () => {
    eq((await member.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 200, "chính chủ");
    eq((await head.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 200, "Trưởng nhà (người điểm danh hộ)");
    eq((await other.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 404, "thành viên khác không xem được");
  });

  await test("Danh sách điểm danh: có phương thức 'photo' + mã ảnh minh chứng; thành viên thường không xem được danh sách", async () => {
    const roster = await head.get(`/api/v1/events/${evId}/attendance`);
    eq(roster.status, 200);
    const row = roster.json.rows.find((x) => x.memberId === memberId);
    ok(row, "không thấy dòng của thành viên");
    eq(row.status, "present");
    eq(row.method, "photo");
    eq(row.evidenceFileId, fid);
    eq((await other.get(`/api/v1/events/${evId}/attendance`)).status, 403);
  });

  await test("Gửi lại lần hai: giữ nguyên kết quả đã ghi (idempotent), không đổi giờ", async () => {
    const before = (await head.get(`/api/v1/events/${evId}/attendance`)).json.rows.find((x) => x.memberId === memberId);
    const fid2 = await upload(member);
    const r = await member.post("/api/v1/events/checkin", { eventId: evId, fileId: fid2 });
    eq(r.status, 200, JSON.stringify(r.json));
    const after = (await head.get(`/api/v1/events/${evId}/attendance`)).json.rows.find((x) => x.memberId === memberId);
    eq(after.status, before.status);
    eq(after.checkedInAt, before.checkedInAt, "giờ ghi nhận không đổi");
    eq(after.evidenceFileId, before.evidenceFileId, "ảnh đầu tiên được giữ");
  });

  await test("Người điểm danh hộ vẫn đổi được trạng thái (ví dụ ảnh không hợp lệ ⇒ chuyển vắng)", async () => {
    const r = await head.post(`/api/v1/events/${evId}/attendance`, { memberId, status: "absent", note: "Ảnh không phải tại sự kiện" });
    eq(r.status, 200, JSON.stringify(r.json));
    const row = (await head.get(`/api/v1/events/${evId}/attendance`)).json.rows.find((x) => x.memberId === memberId);
    eq(row.status, "absent");
    eq(row.method, "manual");
  });

  await test("Ngoài cửa sổ điểm danh (sự kiện còn rất xa) → từ chối", async () => {
    const far = await mk({ startsAt: iso(30 * 60 * minute), endsAt: iso(31 * 60 * minute) });
    created.push(far);
    const f = await upload(other);
    const r = await other.post("/api/v1/events/checkin", { eventId: far, fileId: f });
    ok([400, 403, 409, 422].includes(r.status), `phải bị từ chối: ${r.status}`);
    ok(/ngoài thời gian mở điểm danh|BR-EVT-03/i.test(JSON.stringify(r.json)), "thiếu thông báo ngoài giờ: " + JSON.stringify(r.json));
  });

  await test("Sự kiện không bật điểm danh → 422", async () => {
    const off = await mk({ hasCheckIn: false });
    created.push(off);
    const f = await upload(other);
    const r = await other.post("/api/v1/events/checkin", { eventId: off, fileId: f });
    eq(r.status, 422, JSON.stringify(r.json));
  });

  for (const id of created) await head.del(`/api/v1/events/${id}`);
}
