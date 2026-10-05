// Kiểm thử Lịch phụng vụ trên trang Lịch sự kiện (/api/v1/liturgy/calendar…, ngày đặc biệt, ý lễ, check-in đi lễ, nạp Lời Chúa).
// KHÔNG gọi GitHub thật: máy chủ thử (test-api.mjs) trỏ LITURGY_DATA_BASE_URL tới một máy chủ GIẢ chạy trong tiến trình này ở
// 127.0.0.1:3197, trả các tệp Reading/*.js cùng định dạng nguồn (window.X = {...}) — đủ để kiểm phân tích an toàn (không eval),
// ghép toàn văn theo trích dẫn, ghi vào CSDL, và lỗi nguồn ⇒ 502 tiếng Việt, giữ nguyên dữ liệu cũ.
import http from "node:http";
import sharp from "sharp";

const MOCK_PORT = 3197;

/** Bộ dữ liệu nguồn giả: ~200 dòng trích dẫn ngày thường Mùa Thường Niên + vài lễ, kèm toàn văn cho một ngày. */
function fixtures() {
  const rows = [];
  for (let w = 1; w <= 34; w++)
    for (let d = 1; d <= 6; d++)
      for (const y of ["1", "2"]) rows.push({ code: Number(`5${String(w).padStart(2, "0")}${d}`), year: y, reading1: `Gc ${w},${d}-5`, psalm: `Tv ${w + 10},1-2`, gospel: `Mc ${(w % 16) + 1},${d}-9` });
  // Thứ Hai tuần XXVII năm chẵn: trích dẫn thật để ghép toàn văn
  const i = rows.findIndex((r) => r.code === 5271 && r.year === "2");
  rows[i] = { code: 5271, year: "2", reading1: "Gl 1,6-12", psalm: "Tv 111,1-2.7-8.9.10", gospel: "Lc 10,25-37" };
  rows.push({ code: 72411, year: "0", reading1: "2 Mcb 7,1.20-23.27b-29", psalm: "Tv 125,1-2ab.2cd-3.4-5.6", reading2: "1 Cr 1,17-25", gospel: "Lc 9,23-26" });
  const text = {
    5271: {
      firstReading: { excerpt: "Gl 1, 6-12", info: "“Tin Mừng tôi rao giảng không phải theo loài người”.", title: "Trích thư Thánh Phaolô gửi tín hữu Galata.", content: "Anh em thân mến, tôi lấy làm lạ…", end: "Ðó là lời Chúa" },
      psalms: { excerpt: "Tv 110, 1-2. 7-8", response: "Đáp: Chúa nhớ mãi muôn đời giao ước của Người.", verses: ["Xướng: Tôi sẽ ca tụng Chúa hết lòng…"] },
      gospel: { excerpt: "Lc 10, 25-37", info: "“Ai là anh em của tôi?”", title: "Tin Mừng Chúa Giêsu Kitô theo Thánh Luca.", content: "Khi ấy, có người thông luật đứng lên…", end: "Ðó là lời Chúa" },
    },
  };
  // Tệp lỗi cú pháp như nguồn thật: thiếu dấu đóng ngoặc cuối, có dấu ; lạc
  const saints = `window.SaintsBibleReading = {\n  "72411": ${JSON.stringify({ gospel: { excerpt: "Lc 9,23-26", info: "“Ai muốn theo tôi…”", content: "Khi ấy, Đức Giêsu nói…" } })},\n  };\n`;
  return {
    "Reading/readingdata.js": `﻿window.readings = ${JSON.stringify(rows)};`,
    "Reading/Sunday.js": "window.bibleReadings = [ {} ];",
    "Reading/DailySeason.js": "window.bibledailySeasonReadings = {};",
    "Reading/DailyOrdinary1.js": "window.bibledailyOrdinary1Readings = {};",
    "Reading/DailyOrdinary2.js": `window.bibledailyOrdinary2Readings = ${JSON.stringify(text)};`,
    "Reading/SaintsBible.js": saints,
    "Reading/Optionsaint.js": "window.OptionsaintReadings = {};",
  };
}

function startMock() {
  const state = { mode: "up", calls: [] };
  const files = fixtures();
  const server = http.createServer((req, res) => {
    state.calls.push(req.url);
    if (state.mode === "down") {
      res.writeHead(503);
      return res.end("down");
    }
    const f = files[req.url.replace(/^\/+/, "")];
    res.writeHead(f ? 200 : 404, { "content-type": "application/javascript; charset=utf-8" });
    res.end(f ?? "not found");
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve({ state, server })));
}

async function upload(c) {
  const jpg = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 140, g: 90, b: 40 } } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("bucket", "attachments");
  form.append("file", new Blob([jpg], { type: "image/jpeg" }), "le.jpg");
  const r = await c.req("POST", "/api/v1/files", undefined, { form });
  if (r.status !== 200) throw new Error(`tải ảnh lỗi ${r.status}`);
  return r.json.id;
}

export async function run({ as, test, eq, ok, section }) {
  const { state: mock, server } = await startMock();
  try {
    section("Lịch phụng vụ — tính lịch, Lời Chúa, ý lễ, ngày đặc biệt, check-in đi lễ");
    const member = await as("tuan.nguyen@luuxa.local");
    const other = await as("hieu.bui@luuxa.local");
    const lead = await as("phong.dang@luuxa.local");
    const code = (r) => r.json?.code ?? "";

    await test("Lịch tháng 11/2026: lễ trọng, màu áo lễ, âm lịch, ngày bắt buộc check-in", async () => {
      const r = await member.get("/api/v1/liturgy/calendar?from=2026-11-01&to=2026-11-30");
      eq(r.status, 200);
      const by = Object.fromEntries(r.json.days.map((d) => [d.date, d]));
      eq(by["2026-11-01"].title, "Các Thánh Nam Nữ");
      ok(by["2026-11-01"].isSolemnity && by["2026-11-01"].isObligation, "Các Thánh: lễ trọng + lễ buộc");
      eq(by["2026-11-01"].requirement.evidenceRequired, false, "lễ trọng rơi vào Chúa Nhật không cần ảnh");
      eq(by["2026-11-24"].title, "Các Thánh Tử Đạo Việt Nam");
      eq(by["2026-11-24"].color, "red");
      eq(by["2026-11-24"].requirement.occasion, "solemnity");
      eq(by["2026-11-24"].requirement.evidenceRequired, true, "lễ trọng ngày thường cần ảnh");
      eq(by["2026-11-22"].title, "Đức Giêsu Kitô, Vua Vũ Trụ");
      eq(by["2026-11-29"].title, "Chúa Nhật I Mùa Vọng");
      eq(by["2026-11-29"].requirement.occasion, "sunday");
      eq(by["2026-11-24"].lunarLabel, "16/10 Bính Ngọ");
      eq(by["2026-11-25"].requirement, null);
    });

    await test("Mốc năm phụng vụ: Tết 2026 + Lễ Tro dời sang mồng 4 Tết; Bổn mạng 04/10", async () => {
      const r = await member.get("/api/v1/liturgy/calendar?from=2026-02-16&to=2026-02-21");
      const by = Object.fromEntries(r.json.days.map((d) => [d.date, d]));
      eq(by["2026-02-17"].tet, 1);
      ok(/Mồng Hai Tết/.test(by["2026-02-18"].title), "18/2/2026 là Mồng Hai Tết");
      eq(by["2026-02-20"].fasting, "fast_abstinence");
      const oct = await member.get("/api/v1/liturgy/calendar?from=2026-10-01&to=2026-10-31");
      eq(oct.json.patron.mmdd, "10-04");
      ok(oct.json.days.find((d) => d.date === "2026-10-04").isPatron, "04/10 là ngày Bổn mạng");
    });

    await test("Khoảng ngày quá dài / sai định dạng → 400", async () => {
      eq((await member.get("/api/v1/liturgy/calendar?from=2026-01-01&to=2026-12-31")).status, 400);
      eq((await member.get("/api/v1/liturgy/calendar?from=2026-1-1&to=2026-01-31")).status, 400);
    });

    await test("Nạp Lời Chúa: thành viên → 403; Ban Phụng vụ → nạp từ nguồn (giả), ghép toàn văn theo trích dẫn", async () => {
      eq((await member.post("/api/v1/liturgy/lectionary")).status, 403);
      const r = await lead.post("/api/v1/liturgy/lectionary");
      if (r.status === 502 && !mock.calls.length) throw new Error("máy chủ không dùng nguồn giả LITURGY_DATA_BASE_URL=http://127.0.0.1:3197");
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.entries >= 400, `quá ít bộ bài đọc: ${r.json.entries}`);
      ok(mock.calls.every((u) => u.startsWith("/Reading/")), "chỉ tải các tệp Reading/*");
      const d = await member.get("/api/v1/liturgy/calendar/2026-10-05");
      eq(d.status, 200);
      const g = d.json.readings[0].slots.find((s) => s.kind === "gospel");
      eq(g.ref, "Lc 10,25-37");
      ok(g.text && g.text.includes("thông luật"), "thiếu toàn văn Tin Mừng");
      ok(!/Ð/.test(JSON.stringify(d.json.readings)), "ký tự Ð phải được chuẩn hóa thành Đ");
      const vn = await member.get("/api/v1/liturgy/calendar/2026-11-24");
      eq(vn.json.readings[0].slots.find((s) => s.kind === "gospel").ref, "Lc 9,23-26");
      eq(vn.json.officialReadingsUrl, "https://kpv.vn/liturgy/mass-readings?date=2026-11-24");
    });

    await test("Nguồn Lời Chúa lỗi → 502 tiếng Việt, ghi nhật ký, dữ liệu cũ giữ nguyên", async () => {
      mock.mode = "down";
      const r = await lead.post("/api/v1/liturgy/lectionary");
      mock.mode = "up";
      eq(r.status, 502);
      ok(/Nạp Lời Chúa thất bại/.test(r.json?.detail ?? ""), r.json?.detail);
      const s = await lead.get("/api/v1/liturgy/lectionary");
      eq(s.json.lastImport.status, "failed");
      ok(s.json.entries >= 400, "dữ liệu cũ bị mất");
    });

    await test("Ý lễ theo ngày: thành viên → 403; Ban Phụng vụ lưu/xóa; lịch tháng đánh dấu ngày có ý lễ", async () => {
      eq((await member.req("PUT", "/api/v1/liturgy/calendar/2026-11-24/note", { intention: "Cầu cho Giáo Hội Việt Nam" })).status, 403);
      eq((await lead.req("PUT", "/api/v1/liturgy/calendar/2026-11-24/note", { intention: "Cầu cho Giáo Hội Việt Nam", note: "Lễ 17h30 tại nhà thờ giáo xứ" })).status, 200);
      const d = await member.get("/api/v1/liturgy/calendar/2026-11-24");
      eq(d.json.houseIntention, "Cầu cho Giáo Hội Việt Nam");
      eq(d.json.houseNote, "Lễ 17h30 tại nhà thờ giáo xứ");
      const m = await member.get("/api/v1/liturgy/calendar?from=2026-11-20&to=2026-11-30");
      ok(m.json.days.find((x) => x.date === "2026-11-24").hasIntention, "chưa đánh dấu hasIntention");
      eq((await lead.req("PUT", "/api/v1/liturgy/calendar/2026-11-24/note", { intention: null, note: null })).status, 200);
      eq((await member.get("/api/v1/liturgy/calendar/2026-11-24")).json.houseIntention, null);
    });

    // Ngày đặc biệt có check-in đi lễ hôm nay (theo giờ VN của máy chủ)
    const today = (await member.get("/api/v1/liturgy/calendar?from=2026-01-01&to=2026-01-02")).json.today;
    const [ty, tm, td] = today.split("-").map(Number);
    let specialId = null;
    let checkinId = null;

    await test("Ngày đặc biệt: thành viên → 403; ngày không tồn tại → 400; Ban Phụng vụ tạo được", async () => {
      eq((await member.post("/api/v1/liturgy/special-days", { title: "Kỷ niệm thành lập", month: 9, day: 1 })).status, 403);
      eq((await lead.post("/api/v1/liturgy/special-days", { title: "Ngày sai", month: 2, day: 30 })).status, 400);
      const r = await lead.post("/api/v1/liturgy/special-days", {
        title: "Ngày tĩnh tâm của nhà (kiểm thử)",
        month: tm,
        day: td,
        year: ty,
        color: "blue",
        requiresCheckin: true,
        evidenceRequired: true,
      });
      eq(r.status, 201, JSON.stringify(r.json));
      specialId = r.json.id;
      const day = await member.get(`/api/v1/liturgy/calendar/${today}`);
      eq(day.json.special[0]?.title, "Ngày tĩnh tâm của nhà (kiểm thử)");
      eq(day.json.requirement.occasion, `special:${specialId}`);
      eq(day.json.requirement.evidenceRequired, new Date(`${today}T00:00:00Z`).getUTCDay() !== 0);
    });

    const needsEvidence = new Date(`${today}T00:00:00Z`).getUTCDay() !== 0;
    await test("Check-in đi lễ: thiếu ảnh → 422; có ảnh → 201 chờ duyệt; ảnh chỉ chủ + người duyệt xem", async () => {
      if (needsEvidence) eq(code(await member.post("/api/v1/liturgy/checkins", { date: today, church: "Nhà thờ Thái Hà" })), "EVIDENCE_REQUIRED");
      const fid = await upload(member);
      const r = await member.post("/api/v1/liturgy/checkins", { date: today, church: "Nhà thờ Thái Hà", evidenceFileId: fid });
      eq(r.status, 201, JSON.stringify(r.json));
      eq(r.json.status, "submitted");
      checkinId = r.json.id;
      eq((await other.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 404, "thành viên khác không xem được ảnh");
      eq((await lead.get(`/api/v1/files/${fid}?v=thumb`, { raw: true })).status, 200, "người duyệt xem được ảnh");
      const otherFid = await upload(other);
      const foreign = await member.post("/api/v1/liturgy/checkins", { date: today, evidenceFileId: otherFid });
      ok([403, 422].includes(foreign.status) && /không phải ảnh của bạn|chính mình/.test(foreign.json?.detail ?? ""), `không được dùng ảnh của người khác: ${foreign.status} ${foreign.json?.detail}`);
    });

    await test("Check-in ngày không bắt buộc / quá xa → 422", async () => {
      const far = `${ty + 1}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
      eq((await member.post("/api/v1/liturgy/checkins", { date: far })).status, 422);
      eq(code(await member.post("/api/v1/liturgy/checkins", { date: "2026-11-25" })), "CHECKIN_NOT_ALLOWED");
    });

    await test("Duyệt: tự duyệt → 403; không hợp lệ cần lý do; gửi lại y nguyên → 422; báo kết quả cho người check-in", async () => {
      eq((await member.post(`/api/v1/liturgy/checkins/${checkinId}/review`, { status: "approved" })).status, 403);
      eq((await lead.post(`/api/v1/liturgy/checkins/${checkinId}/review`, { status: "rejected" })).status, 400);
      eq((await lead.post(`/api/v1/liturgy/checkins/${checkinId}/review`, { status: "rejected", note: "Ảnh không phải trong nhà thờ" })).status, 200);
      const day = await member.get(`/api/v1/liturgy/calendar/${today}`);
      eq(day.json.myCheckin.status, "rejected");
      eq(day.json.myCheckin.reviewNote, "Ảnh không phải trong nhà thờ");
      eq(code(await member.post("/api/v1/liturgy/checkins", { date: today, church: "Nhà thờ Thái Hà" })), "NOTHING_CHANGED");
      const fid = await upload(member);
      const again = await member.post("/api/v1/liturgy/checkins", { date: today, church: "Nhà thờ Thái Hà", evidenceFileId: fid });
      eq(again.json.status, "submitted");
      eq((await lead.post(`/api/v1/liturgy/checkins/${checkinId}/review`, { status: "approved" })).status, 200);
      const n = await member.get("/api/v1/notifications");
      const titles = (n.json.items ?? n.json).map((x) => x.title);
      ok(titles.some((t) => /chưa hợp lệ/.test(t)) && titles.some((t) => /đã được xác nhận/.test(t)), `thiếu thông báo kết quả duyệt: ${titles.slice(0, 5).join(" | ")}`);
      eq(code(await member.post("/api/v1/liturgy/checkins", { date: today, church: "Khác" })), "CONFLICT");
    });

    await test("Danh sách check-in + báo cáo đi lễ: chỉ người quản lý", async () => {
      const d = await lead.get(`/api/v1/liturgy/calendar/${today}`);
      ok(d.json.attendance && d.json.attendance.checkedIn >= 1, "thiếu thống kê check-in");
      eq((await member.get(`/api/v1/liturgy/calendar/${today}`)).json.attendance, null);
      const from = `${ty}-${String(tm).padStart(2, "0")}-01`;
      eq((await member.get(`/api/v1/liturgy/report?from=${from}&to=${today}`)).status, 403);
      const rep = await lead.get(`/api/v1/liturgy/report?from=${from}&to=${today}`);
      eq(rep.status, 200);
      ok(rep.json.days.some((x) => x.date === today), "báo cáo thiếu ngày hôm nay");
    });

    await test("Sắp tới + xóa ngày đặc biệt", async () => {
      const up = await member.get("/api/v1/liturgy/upcoming?days=60");
      eq(up.status, 200);
      ok(up.json.some((u) => u.kind === "special" && u.specialId === specialId), "thiếu ngày đặc biệt trong danh sách sắp tới");
      eq((await lead.del(`/api/v1/liturgy/special-days/${specialId}`)).status, 200);
      eq((await member.get(`/api/v1/liturgy/calendar/${today}`)).json.special.length, 0);
    });
  } finally {
    server.close();
  }
}
