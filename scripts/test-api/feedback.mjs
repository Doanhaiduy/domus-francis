// Kiểm thử GÓP Ý VỀ ỨNG DỤNG (db/app/1035): mọi thành viên gửi được; người gửi chỉ thấy của mình; người quản lý (feedback.manage) thấy tất cả,
// đổi trạng thái, trả lời, xóa; "ẩn tên" che tên với người quản lý; ảnh chụp màn hình chỉ người gửi + người quản lý xem; rút lại khi còn "mới".
import sharp from "sharp";

async function upload(c) {
  const jpg = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 90, g: 60, b: 140 } } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("bucket", "attachments");
  form.append("file", new Blob([jpg], { type: "image/jpeg" }), "man-hinh.jpg");
  const r = await c.req("POST", "/api/v1/files", undefined, { form });
  if (r.status !== 200) throw new Error(`tải ảnh lỗi ${r.status}`);
  return r.json.id;
}

export async function run({ as, test, eq, ok, section }) {
  section("Góp ý về ứng dụng");
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà: feedback.manage
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const anon = await as("bao.pham@luuxa.local");
  const suffix = Date.now().toString(36);
  const body = (extra = {}) => ({ category: "idea", content: `Mong ứng dụng có thêm chế độ xem lịch dạng tuần ${suffix}`, ...extra });
  const created = [];

  await test("Quyền: Trưởng nhà & Admin có feedback.manage; thành viên thì không", async () => {
    for (const c of [head, admin]) ok((await c.get("/api/v1/auth/me")).json.permissions.includes("feedback.manage"), "thiếu quyền quản lý góp ý");
    ok(!(await member.get("/api/v1/auth/me")).json.permissions.includes("feedback.manage"), "thành viên không được có feedback.manage");
  });

  await test("Gửi góp ý: dữ liệu sai → 400; hợp lệ → 201 và hiện ở 'của tôi' (trạng thái Mới gửi)", async () => {
    eq((await member.post("/api/v1/feedback", body({ content: "ngắn" }))).status, 400, "quá ngắn");
    eq((await member.post("/api/v1/feedback", body({ category: "khong-co" }))).status, 400, "loại lạ");
    const r = await member.post("/api/v1/feedback", body({ pagePath: "/thu-chi" }));
    eq(r.status, 201, JSON.stringify(r.json));
    created.push(r.json.id);
    const list = (await member.get("/api/v1/feedback")).json;
    eq(list.canManage, false);
    eq(list.all, null, "thành viên không thấy danh sách tất cả");
    const mine = list.mine.find((x) => x.id === r.json.id);
    ok(mine, "góp ý không hiện");
    eq(mine.status, "new");
    eq(mine.pagePath, "/thu-chi");
    eq(mine.isMine, true);
  });

  await test("Riêng tư: người khác không thấy góp ý của mình; người quản lý thấy tên", async () => {
    eq((await other.get("/api/v1/feedback")).json.mine.some((x) => x.id === created[0]), false);
    const all = (await head.get("/api/v1/feedback")).json;
    eq(all.canManage, true);
    const it = all.all.find((x) => x.id === created[0]);
    ok(it, "người quản lý phải thấy");
    ok(it.authorName && it.authorName.length > 0, "người quản lý thấy tên người gửi");
    ok(all.newCount >= 1, "đếm góp ý mới");
  });

  let anonId;
  await test("Ẩn tên: người quản lý KHÔNG thấy tên; chính chủ vẫn thấy góp ý của mình", async () => {
    const r = await anon.post("/api/v1/feedback", body({ isAnonymous: true, content: `Góp ý ẩn tên về màn hình đăng nhập ${suffix}` }));
    eq(r.status, 201, JSON.stringify(r.json));
    anonId = r.json.id;
    created.push(anonId);
    const it = (await head.get("/api/v1/feedback")).json.all.find((x) => x.id === anonId);
    eq(it.isAnonymous, true);
    eq(it.authorName, null, "tên phải bị che");
    eq(it.isMine, false);
    const own = (await anon.get("/api/v1/feedback")).json.mine.find((x) => x.id === anonId);
    ok(own && own.authorName, "chính chủ vẫn thấy tên mình");
  });

  await test("Ảnh chụp màn hình: người gửi + người quản lý xem được; người khác 404", async () => {
    const fid = await upload(member);
    const r = await member.post("/api/v1/feedback", body({ category: "bug", evidenceFileId: fid, content: `Nút lưu bị đơ trên điện thoại ${suffix}` }));
    eq(r.status, 201, JSON.stringify(r.json));
    created.push(r.json.id);
    eq((await member.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 200, "chính chủ");
    eq((await head.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 200, "người quản lý");
    eq((await other.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 404, "người khác");
    const foreign = await upload(other);
    const bad = await member.post("/api/v1/feedback", body({ evidenceFileId: foreign }));
    ok([403, 422].includes(bad.status), `không được đính ảnh của người khác: ${bad.status}`);
  });

  await test("Trả lời / đổi trạng thái: thành viên → 403; người quản lý được; người gửi thấy câu trả lời và được báo", async () => {
    const id = created[0];
    eq((await member.patch(`/api/v1/feedback/${id}`, { status: "done" })).status, 403, "tự đổi trạng thái");
    ok([403, 404].includes((await other.patch(`/api/v1/feedback/${id}`, { response: "Xen vào" })).status), "người khác không được trả lời");
    eq((await head.patch(`/api/v1/feedback/${id}`, {})).status, 400, "không có gì để cập nhật");
    eq((await head.patch(`/api/v1/feedback/${id}`, { status: "reviewing", response: `Cảm ơn bạn, mình đã ghi nhận ${suffix}` })).status, 200);
    const mine = (await member.get("/api/v1/feedback")).json.mine.find((x) => x.id === id);
    eq(mine.status, "reviewing");
    ok(mine.response?.includes(suffix), "người gửi phải thấy câu trả lời");
    ok(mine.respondedByName && mine.respondedAt, "ghi người/giờ trả lời");
    const noti = (await member.get("/api/v1/notifications")).json;
    const list = Array.isArray(noti) ? noti : (noti.items ?? noti.notifications ?? []);
    ok(list.some((n) => /góp ý của bạn đã được trả lời/i.test(n.title ?? "")), "người gửi phải nhận thông báo có câu trả lời");
  });

  await test("Rút lại: người gửi xóa được khi còn 'Mới gửi'; đã được xử lý thì 403; người quản lý xóa được", async () => {
    eq((await member.del(`/api/v1/feedback/${created[0]}`)).status, 403, "đã đổi trạng thái sang đang xem xét");
    ok([403, 404].includes((await other.del(`/api/v1/feedback/${anonId}`)).status), "người khác không được xóa (RLS ẩn bản ghi ⇒ 404)");
    eq((await other.get("/api/v1/feedback")).json.mine.some((x) => x.id === anonId), false);
    eq((await anon.del(`/api/v1/feedback/${anonId}`)).status, 200, "chính chủ rút lại khi còn mới");
    eq((await anon.del(`/api/v1/feedback/${anonId}`)).status, 404);
    eq((await head.del(`/api/v1/feedback/${created[0]}`)).status, 200, "người quản lý xóa");
  });

  for (const id of created) await head.del(`/api/v1/feedback/${id}`);
}
