// Kiểm thử danh mục tỉnh/thành, xã/phường (/api/v1/geo) — KHÔNG gọi provinces.open-api.vn thật. Máy chủ thử (test-api.mjs) được trỏ
// PROVINCES_API_BASE_URL tới một máy chủ GIẢ chạy ngay trong tiến trình này ở 127.0.0.1:3198, trả dữ liệu đúng hình dạng API v1/v2,
// nhờ vậy kiểm được chuẩn hóa tên, lọc dữ liệu bẩn, đệm 24 giờ, lỗi nguồn ⇒ 503 tiếng Việt, và chặn mã tỉnh lạ (không thành proxy mở).
import http from "node:http";

const MOCK_PORT = 3198;

const V2_PROVINCES = [
  { name: "Thành phố Hà Nội", code: 1, division_type: "thành phố trung ương", codename: "ha_noi", phone_code: 24, wards: [] },
  { name: "Tỉnh Ninh Bình", code: 37, division_type: "tỉnh", codename: "ninh_binh", phone_code: 229, wards: [] },
  { name: "Thành phố Hồ Chí Minh", code: 79, division_type: "thành phố trung ương", codename: "ho_chi_minh", phone_code: 28, wards: [] },
  { name: "", code: 999 }, // bản ghi hỏng ⇒ phải bị bỏ
];
const V1_PROVINCES = [
  { name: "Thành phố Hà Nội", code: 1, division_type: "thành phố trung ương", codename: "thanh_pho_ha_noi", phone_code: 24, districts: [] },
  { name: "Tỉnh Nam Định", code: 36, division_type: "tỉnh", codename: "tinh_nam_dinh", phone_code: 228, districts: [] },
];
const HN_WARDS = [
  { name: "Phường Hoàn Kiếm", code: 70, division_type: "phường", codename: "phuong_hoan_kiem", province_code: 1 },
  { name: "Phường Ba Đình", code: 4, division_type: "phường", codename: "phuong_ba_dinh", province_code: 1 },
  { name: "Xã Lạ", code: 5, division_type: "xã", codename: "xa_la", province_code: 79 }, // sai tỉnh ⇒ phải bị bỏ
];

function startMock() {
  const state = { mode: "up", calls: [] };
  const server = http.createServer((req, res) => {
    state.calls.push(req.url);
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (state.mode === "down") return send(503, { detail: "down" });
    if (state.mode === "junk") return send(200, "<html>bảo trì</html>", "text/html");
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/api/v2/p/") return send(200, V2_PROVINCES);
    if (u.pathname === "/api/v1/p/") return send(200, V1_PROVINCES);
    if (u.pathname === "/api/v2/w/" && u.searchParams.get("province") === "1") return send(200, HN_WARDS);
    return send(404, { detail: "Not Found" });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve({ state, server })));
}

export async function run({ as, test, eq, ok, section, Client }) {
  const { state: mock, server } = await startMock();
  try {
    section("Danh mục tỉnh/thành, xã/phường (máy chủ giả, không ra ngoài)");
    const member = await as("tuan.nguyen@luuxa.local");
    const code = (r) => r.json?.code ?? "";

    await test("Chưa đăng nhập: /geo/provinces → 401, không gọi nguồn", async () => {
      const anon = new Client("anon");
      await anon.init();
      eq((await anon.get("/api/v1/geo/provinces")).status, 401);
      eq(mock.calls.length, 0, "không được gọi nguồn khi chưa đăng nhập");
    });

    const first = await member.get("/api/v1/geo/provinces");
    if (!mock.calls.length) {
      // Chạy bằng --no-server trên máy chủ không trỏ PROVINCES_API_BASE_URL tới máy giả ⇒ không kiểm phần nguồn (tránh gọi API thật)
      console.log("    (bỏ qua: máy chủ đang chạy không dùng nguồn giả PROVINCES_API_BASE_URL=http://127.0.0.1:3198)");
      return;
    }

    await test("34 tỉnh/thành hiện hành: chuẩn hóa tên gọn, bỏ bản ghi hỏng, cho trình duyệt đệm", async () => {
      eq(first.status, 200);
      eq(first.json.edition, "2025");
      eq(first.json.stale, false);
      eq(first.json.items.map((p) => p.shortName).join("|"), "Hà Nội|Ninh Bình|TP. Hồ Chí Minh");
      eq(first.json.items[0].name, "Thành phố Hà Nội");
      ok(/private/.test(first.headers.get("cache-control") ?? ""), "thiếu cache-control private");
    });

    await test("Đệm trên máy chủ: gọi lại không hỏi nguồn; nguồn sập vẫn trả bản đã đệm", async () => {
      const n = mock.calls.length;
      eq((await member.get("/api/v1/geo/provinces")).status, 200);
      mock.mode = "down";
      const r = await member.get("/api/v1/geo/provinces");
      mock.mode = "up";
      eq(r.status, 200);
      eq(mock.calls.length, n, "không được gọi lại nguồn trong thời hạn đệm");
    });

    await test("Nguồn lỗi và chưa có bản đệm ⇒ 503 GEO_UNAVAILABLE, lời nhắn tiếng Việt", async () => {
      mock.mode = "down";
      const r = await member.get("/api/v1/geo/provinces?edition=legacy");
      mock.mode = "up";
      eq(r.status, 503);
      eq(code(r), "GEO_UNAVAILABLE");
      ok(/tỉnh\/thành/.test(r.json?.detail ?? ""), "lời nhắn phải tiếng Việt");
    });

    await test("Danh mục cũ 63 tỉnh (quê quán theo tên cũ): ?edition=legacy", async () => {
      const r = await member.get("/api/v1/geo/provinces?edition=legacy");
      eq(r.status, 200);
      eq(r.json.edition, "legacy");
      ok(r.json.items.some((p) => p.shortName === "Nam Định"), "thiếu Nam Định");
      ok(mock.calls.includes("/api/v1/p/"), "phải hỏi đúng API v1");
    });

    await test("Xã/phường: lọc đúng tỉnh, sắp theo tên", async () => {
      const r = await member.get("/api/v1/geo/provinces/1/wards");
      eq(r.status, 200);
      eq(r.json.items.map((w) => w.name).join("|"), "Phường Ba Đình|Phường Hoàn Kiếm");
      eq(r.json.items[0].provinceCode, 1);
    });

    await test("Mã tỉnh lạ/không hợp lệ ⇒ 404, không chuyển tiếp ra nguồn", async () => {
      mock.calls.length = 0;
      eq((await member.get("/api/v1/geo/provinces/2/wards")).status, 404);
      eq((await member.get("/api/v1/geo/provinces/abc/wards")).status, 404);
      eq((await member.get("/api/v1/geo/provinces/1%2F..%2F..%2Fp/wards")).status, 404);
      ok(!mock.calls.some((u) => u.startsWith("/api/v2/w/")), "không được hỏi xã/phường của mã lạ");
    });

    await test("Nguồn trả dữ liệu rác (HTML) ⇒ 503, không đệm", async () => {
      mock.mode = "junk";
      const r = await member.get("/api/v1/geo/provinces/37/wards");
      mock.mode = "up";
      eq(r.status, 503);
      eq(code(r), "GEO_UNAVAILABLE");
    });
  } finally {
    server.close();
  }
}
