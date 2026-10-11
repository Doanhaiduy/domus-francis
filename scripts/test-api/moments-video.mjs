// Kiểm thử KHOẢNH KHẮC: VIDEO + ALBUM CHUNG "Khoảnh khắc thường ngày" (db/app/1038).
// Máy chủ thử dùng nơi lưu trữ local (STORAGE_DRIVER=local, không có khóa Cloudinary) nên đi đường: xin vé → PUT thân thô → ghi vào album → phát có Range.
//   • Album chung: ai cũng mở được (tạo một lần), thêm ảnh + video; chỉ người kiểm duyệt sửa thông tin; không ai xóa được.
//   • Video: vé gắn người + album, chặn sai loại / quá dung lượng / dùng vé của người khác / vào album của người khác (không chung).
//   • Phát: có Range (206), người không xem được album thì 404; xóa video xóa luôn tệp.
import sharp from "sharp";

export async function run({ as, test, eq, ok, section, BASE }) {
  section("Khoảnh khắc: album chung + video");

  const admin = await as("viet.vu@luuxa.local");
  const a = await as("tuan.nguyen@luuxa.local");
  const b = await as("hieu.bui@luuxa.local");
  const suffix = Date.now().toString(36);
  const detail = (r) => JSON.stringify(r.json);
  const jpg = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
  // "video" giả (nội dung tùy ý — máy chủ chỉ kiểm loại khai báo + dung lượng); đủ lớn để thử Range
  const fakeVideo = Buffer.alloc(300_000, 7);

  const upload = async (c, name = "x.jpg") => {
    const form = new FormData();
    form.append("bucket", "moments");
    form.append("file", new Blob([jpg], { type: "image/jpeg" }), name);
    const r = await c.req("POST", "/api/v1/files", undefined, { form });
    eq(r.status, 200, detail(r));
    return r.json.id;
  };

  let dailyId;
  await test("Album chung: thành viên nào mở cũng được cùng MỘT album (tạo một lần), có cờ isShared", async () => {
    const r1 = await a.post("/api/v1/moments/daily");
    eq(r1.status, 200, detail(r1));
    const r2 = await b.post("/api/v1/moments/daily");
    eq(r2.json.id, r1.json.id, "cùng một album");
    dailyId = r1.json.id;
    const list = (await b.get("/api/v1/moments")).json;
    eq(list.dailyAlbumId, dailyId);
    const album = (await b.get(`/api/v1/moments/${dailyId}`)).json;
    eq(album.isShared, true);
    eq(album.canAddPhotos, true, "mọi thành viên thêm được ảnh / video");
    eq(album.canEdit, false, "thành viên thường không sửa thông tin album chung");
    eq(album.canDelete, false);
    ok(list.videoLimits && list.videoLimits.maxBytes > 0 && Array.isArray(list.videoLimits.mimes), "có giới hạn video");
  });

  await test("Album chung: ai cũng thêm ảnh được; chỉ người kiểm duyệt sửa; không ai xóa được", async () => {
    const f1 = await upload(a, "a.jpg");
    const add = await a.post(`/api/v1/moments/${dailyId}/photos`, { photos: [{ fileId: f1, caption: `Bữa cơm chiều ${suffix}` }] });
    eq(add.status, 201, detail(add));
    const f2 = await upload(b, "b.jpg");
    eq((await b.post(`/api/v1/moments/${dailyId}/photos`, { photos: [{ fileId: f2 }] })).status, 201);
    eq((await b.get(`/api/v1/moments/${dailyId}`)).json.photos.length >= 2, true);
    eq((await a.patch(`/api/v1/moments/${dailyId}`, { title: "Tôi đổi tên album chung" })).status, 403);
    eq((await a.del(`/api/v1/moments/${dailyId}`)).status, 403);
    eq((await admin.del(`/api/v1/moments/${dailyId}`)).status, 403, "kể cả người kiểm duyệt cũng không xóa được album chung");
    eq((await admin.patch(`/api/v1/moments/${dailyId}`, { description: `Mô tả do người kiểm duyệt sửa ${suffix}` })).status, 200);
  });

  let videoId;
  let ticket;
  await test("Video — bước 1: loại tệp / dung lượng sai bị chặn; hợp lệ trả vé + địa chỉ tải (local)", async () => {
    eq((await a.post("/api/v1/moments/videos/init", { albumId: dailyId, mime: "application/pdf", sizeBytes: 1000 })).status, 415);
    eq((await a.post("/api/v1/moments/videos/init", { albumId: dailyId, mime: "video/mp4", sizeBytes: 900 * 1024 * 1024 })).status, 413);
    eq((await a.post("/api/v1/moments/videos/init", { albumId: dailyId, mime: "video/mp4", sizeBytes: 0 })).status, 400);
    eq((await a.post("/api/v1/moments/videos/init", { albumId: "00000000-0000-4000-8000-000000000000", mime: "video/mp4", sizeBytes: 1000 })).status, 404);
    const init = await a.post("/api/v1/moments/videos/init", { albumId: dailyId, mime: "video/mp4", sizeBytes: fakeVideo.length });
    eq(init.status, 200, detail(init));
    eq(init.json.provider, "local");
    ok(init.json.ticket.length > 50 && init.json.uploadUrl.startsWith("/api/v1/moments/videos/local-upload?ticket="), "vé + địa chỉ tải");
    eq(init.json.fileField, null);
    ticket = init.json;
  });

  await test("Video — tải lên, vé của người khác / album khác bị từ chối; hợp lệ ghi vào album", async () => {
    // chưa tải tệp mà đã ghi ⇒ 400
    const early = await a.post(`/api/v1/moments/${dailyId}/videos`, { ticket: ticket.ticket, upload: {} });
    eq(early.status, 400, detail(early));
    // người khác không dùng được vé / địa chỉ tải của mình
    eq((await b.req("PUT", ticket.uploadUrl, undefined, { form: fakeVideo })).status, 400, "vé của người khác");
    eq((await b.post(`/api/v1/moments/${dailyId}/videos`, { ticket: ticket.ticket, upload: {} })).status, 400);
    // tải thân thô
    const put = await a.req("PUT", ticket.uploadUrl, undefined, { form: fakeVideo });
    eq(put.status, 200, detail(put));
    eq(put.json.size, fakeVideo.length);
    // album khác với vé ⇒ 400
    const other = (await a.get("/api/v1/moments")).json.albums.find((x) => !x.isShared);
    if (other) eq((await a.post(`/api/v1/moments/${other.id}/videos`, { ticket: ticket.ticket, upload: {} })).status, 400, "vé dành cho album khác");
    const poster = await upload(a, "poster.jpg");
    const reg = await a.post(`/api/v1/moments/${dailyId}/videos`, { ticket: ticket.ticket, caption: `Tập bóng chuyền ${suffix}`, durationMs: 12000, width: 640, height: 360, posterFileId: poster, upload: {} });
    eq(reg.status, 201, detail(reg));
    const v = reg.json.videos.find((x) => (x.caption ?? "").includes(suffix));
    ok(v, "video có trong album");
    videoId = v.id;
    eq(v.provider, "local");
    eq(v.durationMs, 12000);
    eq(v.sizeBytes, fakeVideo.length);
    ok(v.posterUrl && v.posterUrl.includes("/api/v1/files/"), "có ảnh bìa");
    eq(v.mp4Url, `/api/v1/moments/videos/${videoId}/play`);
    eq(v.hlsUrl, null, "local không có HLS");
    eq(v.isMine, true);
    eq(reg.json.videosCount, 1);
    // ghi lại lần nữa cùng vé ⇒ trả lại đúng video đó, không nhân đôi
    const again = await a.post(`/api/v1/moments/${dailyId}/videos`, { ticket: ticket.ticket, upload: {} });
    eq(again.status, 201);
    eq(again.json.videos.filter((x) => (x.caption ?? "").includes(suffix)).length, 1, "không nhân đôi video");
  });

  await test("Video — phát có hỗ trợ Range (206), toàn bộ (200); người khác trong cộng đoàn xem được; chưa đăng nhập 401", async () => {
    const full = await b.req("GET", `/api/v1/moments/videos/${videoId}/play`, undefined, { raw: true });
    eq(full.status, 200);
    eq(full.headers.get("content-type"), "video/mp4");
    eq(full.headers.get("accept-ranges"), "bytes");
    eq((await full.arrayBuffer()).byteLength, fakeVideo.length);
    const res = await fetch(`${BASE}/api/v1/moments/videos/${videoId}/play`, { headers: { cookie: b.cookieHeader(), range: "bytes=1000-1999" } });
    eq(res.status, 206);
    eq(res.headers.get("content-range"), `bytes 1000-1999/${fakeVideo.length}`);
    eq((await res.arrayBuffer()).byteLength, 1000);
    const bad = await fetch(`${BASE}/api/v1/moments/videos/${videoId}/play`, { headers: { cookie: b.cookieHeader(), range: "bytes=999999999-" } });
    eq(bad.status, 416);
    const anon = await fetch(`${BASE}/api/v1/moments/videos/${videoId}/play`);
    eq(anon.status, 401);
  });

  await test("Video — sửa chú thích: chủ video / người kiểm duyệt; người khác 403; chỉ người kiểm duyệt ẩn / hiện (ẩn rồi người khác không thấy, không phát được)", async () => {
    eq((await b.patch(`/api/v1/moments/videos/${videoId}`, { caption: "Của người khác" })).status, 403);
    eq((await a.patch(`/api/v1/moments/videos/${videoId}`, { caption: `Tập bóng chuyền chiều thứ Bảy ${suffix}` })).status, 200);
    eq((await a.patch(`/api/v1/moments/videos/${videoId}`, { hidden: true })).status, 403, "chủ video không tự ẩn");
    eq((await admin.patch(`/api/v1/moments/videos/${videoId}`, { hidden: true })).status, 200);
    eq((await b.get(`/api/v1/moments/${dailyId}`)).json.videos.some((x) => x.id === videoId), false, "video ẩn không hiện với người khác");
    eq((await b.req("GET", `/api/v1/moments/videos/${videoId}/play`, undefined, { raw: true })).status, 404);
    eq((await admin.get(`/api/v1/moments/${dailyId}`)).json.videos.find((x) => x.id === videoId).status, "hidden");
    eq((await admin.patch(`/api/v1/moments/videos/${videoId}`, { hidden: false })).status, 200);
    eq((await b.get(`/api/v1/moments/${dailyId}`)).json.videos.some((x) => x.id === videoId), true);
  });

  await test("Video — album thường của người khác (không chung): không tải vào được; xóa video: người khác 403, chủ video OK và không phát được nữa", async () => {
    // album của thành viên b (không chung)
    const cats = (await b.get("/api/v1/moments")).json.categories;
    const cover = await upload(b, "cover.jpg");
    const own = await b.post("/api/v1/moments", { title: `Album riêng ${suffix}`, categoryId: cats[0].id, takenOn: new Date().toISOString().slice(0, 10), coverFileId: cover });
    eq(own.status, 201, detail(own));
    eq((await a.post("/api/v1/moments/videos/init", { albumId: own.json.id, mime: "video/mp4", sizeBytes: 1000 })).status, 403, "không phải album chung / của mình");
    eq((await b.post("/api/v1/moments/videos/init", { albumId: own.json.id, mime: "video/mp4", sizeBytes: 1000 })).status, 200, "tác giả thêm được");
    await b.del(`/api/v1/moments/${own.json.id}`);

    eq((await b.del(`/api/v1/moments/videos/${videoId}`)).status, 403);
    const del = await a.del(`/api/v1/moments/videos/${videoId}`);
    eq(del.status, 200, detail(del));
    eq(del.json.videos.some((x) => x.id === videoId), false);
    eq((await a.req("GET", `/api/v1/moments/videos/${videoId}/play`, undefined, { raw: true })).status, 404);
    eq((await a.del(`/api/v1/moments/videos/${videoId}`)).status, 404, "xóa lần hai");
  });
}
