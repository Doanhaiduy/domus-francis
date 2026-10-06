// Kiểm thử NHẬN GIAO DỊCH NGÂN HÀNG TỰ ĐỘNG (webhook SePay/Casso → bank_statement_lines → gợi ý khớp → Thủ quỹ xác nhận ghi thu).
// Máy chủ thử đặt BANK_WEBHOOK_SECRET = "test-bank-webhook-secret-0001" (scripts/test-api.mjs). Dữ liệu thử: giao dịch mang hậu tố riêng;
// khoản phải thu thật có sẵn được dùng để ghi thu (khi chạy trên DB dùng chung, số tiền ghi thu rất nhỏ và được ghi nhật ký).

const SECRET = "test-bank-webhook-secret-0001";

export async function run({ as, test, eq, ok, section, BASE, Client }) {
  section("Giao dịch ngân hàng tự động (webhook SePay / Casso)");

  const anon = await new Client("anon").init();
  const treasurer = await as("bao.pham@luuxa.local"); // finance.reconcile + finance.contribution.record
  const member = await as("tuan.nguyen@luuxa.local");
  const suffix = Date.now().toString(36);
  const hook = (body, headers = {}) =>
    fetch(BASE + "/api/v1/public/bank-webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const sepay = (o) => ({ id: Math.floor(Math.random() * 1e9), gateway: "Techcombank", transactionDate: "2026-10-06 14:30:00", accountNumber: "19036996868", transferType: "in", transferAmount: 100000, accumulated: 5000000, content: "", referenceCode: `FT${suffix}`, ...o });
  const lines = async () => (await treasurer.get("/api/v1/finance/bank-lines")).json;
  const find = async (ref) => (await lines()).lines.find((l) => l.reference === ref);

  await test("Webhook: thiếu/sai khóa → 401; không có khóa → 401 (không lộ dữ liệu)", async () => {
    eq((await hook(sepay({}))).status, 401);
    eq((await hook(sepay({}), { authorization: "Apikey sai-khoa-xxxxxxxxxxxxxxxx" })).status, 401);
    eq((await hook(sepay({}), { "secure-token": "khong-dung" })).status, 401);
  });

  await test("Webhook: payload lạ → 400 (chỉ nhận định dạng SePay/Casso)", async () => {
    eq((await hook({ foo: "bar" }, { authorization: `Apikey ${SECRET}` })).status, 400);
    const res = await fetch(BASE + "/api/v1/public/bank-webhook", { method: "POST", headers: { authorization: `Apikey ${SECRET}`, "content-type": "application/json" }, body: "không-phải-json" });
    eq(res.status, 400);
  });

  const ref1 = `FT1${suffix}`;
  await test("SePay: giao dịch tiền vào được lưu (khóa Apikey), trả { success: true }", async () => {
    const res = await hook(sepay({ referenceCode: ref1, transferAmount: 123456, content: `MBVCB.99 CHUYEN TIEN KHONG RO NGUOI ${suffix}` }), { authorization: `Apikey ${SECRET}` });
    eq(res.status, 200);
    const j = await res.json();
    eq(j.success, true);
    eq(j.created, 1);
    const l = await find(ref1);
    ok(l, "không thấy dòng vừa gửi");
    eq(l.status, "unmatched");
    eq(l.direction, "in");
    eq(l.amountVnd, 123456);
    eq(l.txnDate, "2026-10-06");
    eq(l.source, "sepay");
    eq(l.balanceAfterVnd, 5000000);
  });

  await test("Idempotent: gửi lại cùng giao dịch (SePay thử lại) → không tạo dòng mới", async () => {
    const before = (await lines()).lines.filter((l) => l.reference === ref1).length;
    const j = await (await hook(sepay({ referenceCode: ref1, transferAmount: 123456, content: `MBVCB.99 CHUYEN TIEN KHONG RO NGUOI ${suffix}` }), { authorization: `Apikey ${SECRET}` })).json();
    eq(j.created, 0);
    eq((await lines()).lines.filter((l) => l.reference === ref1).length, before);
  });

  const ref2 = `CASSO${suffix}`;
  await test("Casso: nhiều giao dịch trong một lần gọi (khóa secure-token), tiền ra mang dấu âm → direction=out", async () => {
    const res = await hook(
      { error: 0, data: [{ id: 1, tid: ref2, description: `RUT TIEN ${suffix}`, amount: -50000, cusum_balance: 900000, when: "2026-10-05 09:00:00" }, { id: 2, tid: `${ref2}B`, description: `NHAN ${suffix}`, amount: 70000, cusum_balance: 970000, when: "2026-10-05 10:00:00" }] },
      { "secure-token": SECRET }
    );
    eq(res.status, 200);
    eq((await res.json()).created, 2);
    const out = await find(ref2);
    eq(out.direction, "out");
    eq(out.amountVnd, 50000);
    eq(out.source, "casso");
    eq((await find(`${ref2}B`)).direction, "in");
  });

  await test("Phân quyền xem: thành viên thường 403; chưa đăng nhập 401", async () => {
    eq((await member.get("/api/v1/finance/bank-lines")).status, 403);
    eq((await anon.get("/api/v1/finance/bank-lines")).status, 401);
    eq((await member.post(`/api/v1/finance/bank-lines/${(await find(ref1)).id}`, { action: "ignore", reason: "Không có quyền" })).status, 403);
    eq((await treasurer.get("/api/v1/finance/bank-lines")).json.webhookEnabled, true);
  });

  await test("Thủ quỹ nhận thông báo khi có tiền chuyển vào", async () => {
    const n = JSON.stringify((await treasurer.get("/api/v1/notifications")).json);
    ok(n.includes("chuyển vào tài khoản lưu xá"), "thiếu thông báo tiền vào");
  });

  // ---- gợi ý + ghi thu: dùng một khoản phải thu thật còn nợ
  let target;
  await test("Chuẩn bị: tìm một khoản phải thu còn nợ của một thành viên", async () => {
    const m = (await treasurer.get("/api/v1/finance/contributions?months=12")).json;
    for (const row of m.rows) {
      const cell = Object.values(row.cells).find((c) => (c.status === "unpaid" || c.status === "partial") && c.remainingVnd >= 10000);
      if (cell) {
        target = { row, cell };
        break;
      }
    }
    ok(target, "DB thử phải có ít nhất một khoản phải thu còn nợ");
  });

  const ref3 = `FT3${suffix}`;
  let line3;
  await test("Gợi ý khớp: nội dung có tên + mã kế hoạch + đúng số tiền → độ khớp CAO", async () => {
    const { row, cell } = target;
    const j = await (await hook(sepay({ referenceCode: ref3, transferAmount: cell.remainingVnd, content: `${cell.planCode} ${row.fullName}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toUpperCase() }), { authorization: `Apikey ${SECRET}` })).json();
    eq(j.created, 1);
    line3 = await find(ref3);
    const s = line3.suggestions.find((x) => x.contributionId === cell.contributionId);
    ok(s, "phải gợi ý đúng khoản phải thu: " + JSON.stringify(line3.suggestions));
    eq(s.confidence, "high");
    eq(s.memberId, row.memberId);
  });

  await test("Nội dung chỉ có tên (số tiền khác) → độ khớp trung bình; nội dung lạ → không gợi ý", async () => {
    const { row, cell } = target;
    const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toUpperCase();
    await hook(sepay({ referenceCode: `FT4${suffix}`, transferAmount: 10000, content: `${fold(row.fullName)} dong quy` }), { authorization: `Apikey ${SECRET}` });
    const l4 = await find(`FT4${suffix}`);
    const s = l4.suggestions.find((x) => x.contributionId === cell.contributionId);
    ok(s && s.confidence !== "high", "khớp tên, lệch tiền ⇒ không phải 'high'");
    await hook(sepay({ referenceCode: `FT5${suffix}`, transferAmount: 77777, content: "ABC XYZ ngau nhien" }), { authorization: `Apikey ${SECRET}` });
    eq((await find(`FT5${suffix}`)).suggestions.length, 0, "nội dung không liên quan không được gợi ý");
  });

  await test("Xác nhận ghi thu: tạo phiếu thu thật, dòng sao kê chuyển 'matched'; xác nhận lại → 409; khoản đã đóng đủ", async () => {
    const { cell } = target;
    const r = await treasurer.post(`/api/v1/finance/bank-lines/${line3.id}`, { action: "confirm", contributionId: cell.contributionId });
    eq(r.status, 200, JSON.stringify(r.json));
    ok(r.json.paymentId, "phải trả mã phiếu thu");
    eq((await find(ref3)).status, "matched");
    const again = await treasurer.post(`/api/v1/finance/bank-lines/${line3.id}`, { action: "confirm", contributionId: cell.contributionId });
    eq(again.status, 409);
    const m = (await treasurer.get("/api/v1/finance/contributions?months=12")).json;
    const updated = Object.values(m.rows.find((x) => x.memberId === target.row.memberId).cells).find((c) => c.contributionId === cell.contributionId);
    eq(updated.status, "paid", "khoản phải thu phải chuyển 'đã đóng'");
    // hoàn tác phiếu thu để trả lại trạng thái DB dùng chung
    const pay = await treasurer.post(`/api/v1/finance/payments/${r.json.paymentId}/void`, { reason: "Hoàn tác dữ liệu thử nghiệm" });
    eq(pay.status, 200, `hoàn tác phiếu thu thử: ${JSON.stringify(pay.json)}`);
  });

  await test("Giao dịch lớn hơn số còn phải đóng → 422; tiền ra không ghi thu được → 400", async () => {
    const { cell } = target;
    await hook(sepay({ referenceCode: `FT6${suffix}`, transferAmount: 999_000_000, content: "QUA LON" }), { authorization: `Apikey ${SECRET}` });
    const big = await find(`FT6${suffix}`);
    const r = await treasurer.post(`/api/v1/finance/bank-lines/${big.id}`, { action: "confirm", contributionId: cell.contributionId });
    ok(r.status === 422 || r.status === 409, `mong 422/409, nhận ${r.status}`);
    const out = await find(ref2);
    eq((await treasurer.post(`/api/v1/finance/bank-lines/${out.id}`, { action: "confirm", contributionId: cell.contributionId })).status, 400);
  });

  await test("Bỏ qua phải có lý do (≥ 5 ký tự); bỏ qua rồi khôi phục được", async () => {
    const l = await find(ref1);
    eq((await treasurer.post(`/api/v1/finance/bank-lines/${l.id}`, { action: "ignore", reason: "abc" })).status, 400);
    eq((await treasurer.post(`/api/v1/finance/bank-lines/${l.id}`, { action: "ignore", reason: "Tiền ủng hộ, không phải quỹ" })).status, 200);
    const ig = await find(ref1);
    eq(ig.status, "ignored");
    eq(ig.ignoreReason, "Tiền ủng hộ, không phải quỹ");
    eq((await treasurer.post(`/api/v1/finance/bank-lines/${l.id}`, { action: "restore" })).status, 200);
    eq((await find(ref1)).status, "unmatched");
    // dọn: bỏ qua các dòng thử để không làm rối bảng của Thủ quỹ
    for (const r of [ref1, ref2, `${ref2}B`, `FT4${suffix}`, `FT5${suffix}`, `FT6${suffix}`]) {
      const x = await find(r);
      if (x && x.status === "unmatched") await treasurer.post(`/api/v1/finance/bank-lines/${x.id}`, { action: "ignore", reason: "Dữ liệu thử nghiệm" });
    }
  });
}
