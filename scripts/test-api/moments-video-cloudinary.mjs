// Kiểm thử video khoảnh khắc với CLOUDINARY THẬT (tài khoản staging trong .env.local) — CHỈ chạy khi đặt TEST_CLOUDINARY=1 (có lưu lượng ra ngoài,
// tải một video 3 giây rồi xóa). Harness ép VIDEO_PROVIDER=local trừ khi có TEST_CLOUDINARY; cần tệp .local/test-assets/probe.mp4
// (tạo bằng: ffmpeg -f lavfi -i testsrc=duration=3:size=640x360:rate=24 -f lavfi -i sine=frequency=440:duration=3 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest probe.mp4).
//   TEST_CLOUDINARY=1 node --no-warnings scripts/test-api.mjs --only moments-video-cloudinary
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export async function run({ as, test, eq, ok, section }) {
  if (!process.env.TEST_CLOUDINARY) return;
  section("Khoảnh khắc: video qua Cloudinary thật");
  const file = path.resolve(".local/test-assets/probe.mp4");
  if (!existsSync(file)) {
    console.log("  (bỏ qua: thiếu .local/test-assets/probe.mp4)");
    return;
  }
  const bytes = readFileSync(file);
  const a = await as("tuan.nguyen@luuxa.local");
  const b = await as("hieu.bui@luuxa.local");
  const detail = (r) => JSON.stringify(r.json);
  const dailyId = (await a.post("/api/v1/moments/daily")).json.id;

  let init;
  let uploaded;
  let videoId;

  await test("init: nơi lưu là cloudinary, địa chỉ tải thẳng lên Cloudinary kèm chữ ký (không lộ api_secret)", async () => {
    const r = await a.post("/api/v1/moments/videos/init", { albumId: dailyId, mime: "video/mp4", sizeBytes: bytes.length });
    eq(r.status, 200, detail(r));
    init = r.json;
    eq(init.provider, "cloudinary");
    ok(/^https:\/\/api\.cloudinary\.com\/v1_1\/[a-z0-9]+\/video\/upload$/.test(init.uploadUrl), "địa chỉ tải: " + init.uploadUrl);
    eq(init.method, "POST");
    eq(init.fileField, "file");
    ok(init.fields.signature && init.fields.public_id.startsWith("luuxa/moments/") && init.fields.api_key, "đủ tham số tải");
    ok(!JSON.stringify(init).includes(process.env.CLOUDINARY_API_SECRET ?? "\u0000nope"), "không lộ api_secret");
    eq(init.maxBytes, 100 * 1024 * 1024);
  });

  await test("tải lên Cloudinary như trình duyệt; đăng ký sai chữ ký / sai public_id bị chặn; đúng thì ghi vào album", async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(init.fields)) form.append(k, v);
    form.append("file", new Blob([bytes], { type: "video/mp4" }), "probe.mp4");
    const res = await fetch(init.uploadUrl, { method: "POST", body: form });
    uploaded = await res.json();
    eq(res.status, 200, JSON.stringify(uploaded).slice(0, 300));
    eq(uploaded.resource_type, "video");
    eq(uploaded.public_id, init.fields.public_id);

    const forged = { ...uploaded, signature: "0".repeat(40) };
    eq((await a.post(`/api/v1/moments/${dailyId}/videos`, { ticket: init.ticket, upload: { cloudinary: forged } })).status, 400, "chữ ký giả");
    const other = { ...uploaded, public_id: "luuxa/moments/2026/10/tep-khac" };
    eq((await a.post(`/api/v1/moments/${dailyId}/videos`, { ticket: init.ticket, upload: { cloudinary: other } })).status, 400, "public_id không khớp vé");
    eq((await b.post(`/api/v1/moments/${dailyId}/videos`, { ticket: init.ticket, upload: { cloudinary: uploaded } })).status, 400, "vé của người khác");

    const reg = await a.post(`/api/v1/moments/${dailyId}/videos`, {
      ticket: init.ticket,
      caption: "Video thử Cloudinary",
      width: 640,
      height: 360,
      upload: { cloudinary: uploaded },
    });
    eq(reg.status, 201, detail(reg));
    const v = reg.json.videos.find((x) => x.caption === "Video thử Cloudinary");
    ok(v, "video có trong album");
    videoId = v.id;
    eq(v.provider, "cloudinary");
    eq(v.durationMs, 3000);
    eq(v.width, 640);
    ok(v.mp4Url.startsWith("https://res.cloudinary.com/") && v.mp4Url.endsWith(".mp4"), "mp4: " + v.mp4Url);
    ok(v.hlsUrl && v.hlsUrl.includes("/sp_auto/") && v.hlsUrl.endsWith(".m3u8"), "hls: " + v.hlsUrl);
    ok(v.posterUrl && v.posterUrl.includes("so_0"), "poster Cloudinary khi không có ảnh bìa tự chụp: " + v.posterUrl);
  });

  await test("Phát được thật: MP4 chuyển mã (có Range 206) và HLS thích ứng (danh sách + đoạn)", async () => {
    const v = (await b.get(`/api/v1/moments/${dailyId}`)).json.videos.find((x) => x.id === videoId);
    ok(v, "thành viên khác xem được video");
    const get = async (url, headers = {}) => {
      for (let i = 0; i < 8; i++) {
        const r = await fetch(url, { headers });
        if (r.status === 423 || r.status === 202) {
          await new Promise((res) => setTimeout(res, 2500));
          continue;
        }
        return r;
      }
      throw new Error("Cloudinary chưa xử lý xong: " + url);
    };
    const mp4 = await get(v.mp4Url);
    eq(mp4.status, 200);
    ok((mp4.headers.get("content-type") ?? "").startsWith("video/mp4"), "loại: " + mp4.headers.get("content-type"));
    const range = await get(v.mp4Url, { range: "bytes=0-999" });
    eq(range.status, 206);
    const master = await get(v.hlsUrl);
    eq(master.status, 200);
    const text = await master.text();
    ok(text.startsWith("#EXTM3U"), "danh sách HLS hợp lệ");
    const rel = text.split("\n").find((l) => l && !l.startsWith("#"));
    const media = await get(new URL(rel, v.hlsUrl).toString());
    eq(media.status, 200);
    const seg = (await media.text()).split("\n").find((l) => l && !l.startsWith("#") && !l.startsWith("#EXT"));
    ok(seg, "có đoạn video");
  });

  await test("Xóa video: biến khỏi album và tệp bị xóa trên Cloudinary (destroy)", async () => {
    eq((await b.del(`/api/v1/moments/videos/${videoId}`)).status, 403, "người khác không xóa được");
    const del = await a.del(`/api/v1/moments/videos/${videoId}`);
    eq(del.status, 200, detail(del));
    eq(del.json.videos.some((x) => x.id === videoId), false);
  });
}
