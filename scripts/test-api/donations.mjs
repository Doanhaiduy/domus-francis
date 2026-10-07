// Kiểm thử ỦNG HỘ / QUYÊN GÓP VÀO QUỸ (db/app/1030): Thủ quỹ ghi nhận (đã nhận ⇒ vào sổ quỹ / ghi nhận trước, chờ nhận tiền), thành viên tự báo "đã ủng hộ",
// xác nhận / từ chối / hủy / rút lại, người ngoài ủng hộ, quyền riêng tư, thông báo, idempotent.

import { randomUUID } from "node:crypto";

export async function run({ as, test, eq, ok, section }) {
  section("Ủng hộ / quyên góp vào quỹ");

  const treasurer = await as("bao.pham@luuxa.local");
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const other = await as("hieu.bui@luuxa.local");
  const stamp = Date.now().toString(36);

  const options = (await treasurer.get("/api/v1/finance/options")).json;
  const fund = options.funds.find((f) => f.type === "cash") ?? options.funds[0];
  const today = options.today;
  const memberId = (await member.get("/api/v1/auth/me")).json.member.id;
  const money = (n) => 100000 + n;
  const list = async (c, q = "") => (await c.get(`/api/v1/donations${q}`)).json;
  const find = (l, id) => l.items.find((x) => x.id === id);

  let confirmedId;
  await test("Thủ quỹ ghi khoản ủng hộ ĐÃ NHẬN của thành viên ⇒ trạng thái confirmed, vào túi quỹ, thành viên nhận thông báo", async () => {
    const r = await treasurer.post("/api/v1/donations", { donorMemberId: memberId, amountVnd: money(1), donatedOn: today, method: "bank_transfer", fundId: fund.id, referenceCode: `FT${stamp}A`, note: `Ủng hộ thử ${stamp}`, received: true });
    eq(r.status, 201, JSON.stringify(r.json));
    confirmedId = r.json.id;
    const l = await list(treasurer, `?q=${stamp}`);
    const d = find(l, confirmedId);
    ok(d, "Thủ quỹ thấy khoản vừa ghi");
    eq(d.status, "confirmed");
    eq(d.fundId, fund.id);
    eq(d.isMember, true);
    eq(d.amountVnd, money(1));
    ok(d.decidedAt, "có thời điểm xác nhận");
    ok(JSON.stringify((await member.get("/api/v1/notifications")).json).includes("khoản ủng hộ"), "thành viên phải nhận thông báo");
  });

  await test("Người ngoài ủng hộ: ghi tên, đếm đúng số người ủng hộ; khoản ghi nhận trước (chờ nhận tiền) chưa vào quỹ", async () => {
    const out = await treasurer.post("/api/v1/donations", { donorName: `Ông Nguyễn Ân Nhân ${stamp}`, amountVnd: money(2), donatedOn: today, method: "cash", fundId: fund.id, received: true });
    eq(out.status, 201, JSON.stringify(out.json));
    const pledge = await treasurer.post("/api/v1/donations", { donorName: `Bà Lê Hứa Giúp ${stamp}`, amountVnd: money(3), donatedOn: today, method: "bank_transfer", received: false });
    eq(pledge.status, 201, JSON.stringify(pledge.json));
    const l = await list(treasurer, `?q=${stamp}`);
    eq(find(l, out.json.id).isMember, false);
    eq(find(l, pledge.json.id).status, "pledged");
    eq(find(l, pledge.json.id).fundId, null);
    eq(l.summary.confirmedCount, 2);
    eq(l.summary.confirmedVnd, money(1) + money(2));
    eq(l.summary.donorCount, 2);
    eq(l.summary.memberDonorCount, 1);
    eq(l.summary.pledgedCount, 1);
    // khoản ghi nhận trước, nhận tiền sau ⇒ xác nhận với túi quỹ
    eq((await treasurer.patch(`/api/v1/donations/${pledge.json.id}`, { action: "confirm" })).status, 400, "xác nhận thiếu túi quỹ");
    eq((await treasurer.patch(`/api/v1/donations/${pledge.json.id}`, { action: "confirm", fundId: fund.id })).status, 200);
    eq(find(await list(treasurer, `?q=${stamp}`), pledge.json.id).status, "confirmed");
    eq((await treasurer.patch(`/api/v1/donations/${pledge.json.id}`, { action: "cancel" })).status, 422, "đã xử lý không hủy được");
  });

  await test("Kiểm tra dữ liệu: thiếu người ủng hộ, thiếu túi quỹ, chuyển khoản đã nhận thiếu mã, số tiền sai, ngày tương lai", async () => {
    const base = { amountVnd: money(4), donatedOn: today, method: "cash", fundId: fund.id, received: true, donorName: "Người thử" };
    eq((await treasurer.post("/api/v1/donations", { ...base, donorName: null })).status, 400, "thiếu người ủng hộ");
    eq((await treasurer.post("/api/v1/donations", { ...base, fundId: null })).status, 400, "đã nhận mà thiếu túi quỹ");
    eq((await treasurer.post("/api/v1/donations", { ...base, method: "bank_transfer" })).status, 400, "chuyển khoản đã nhận thiếu mã giao dịch");
    eq((await treasurer.post("/api/v1/donations", { ...base, amountVnd: 0 })).status, 400, "số tiền 0");
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const fr = await treasurer.post("/api/v1/donations", { ...base, donatedOn: future });
    ok(fr.status === 422 || fr.status === 400, "ngày tương lai bị từ chối: " + fr.status);
  });

  await test("Quyền: thành viên thường không ghi nhận / xác nhận được (403); không thấy khoản của người khác", async () => {
    eq((await member.post("/api/v1/donations", { donorName: "Lén ghi", amountVnd: money(5), donatedOn: today, method: "cash", fundId: fund.id, received: true })).status, 403);
    eq((await member.patch(`/api/v1/donations/${confirmedId}`, { action: "cancel" })).status, 403);
    const mine = await list(member);
    eq(mine.canRecord, false);
    eq(mine.canViewAll, false);
    ok(mine.items.length >= 1 && mine.items.every((x) => x.donorMemberId === memberId), "thành viên chỉ thấy khoản của mình");
    ok(mine.items.some((x) => x.id === confirmedId));
    const stranger = await list(other, `?q=${stamp}`);
    eq(stranger.canViewAll, false);
    ok(!stranger.items.some((x) => x.donorMemberId === memberId), "người khác không thấy khoản của mình");
    eq((await list(head)).canRecord, true, "Trưởng nhà có quyền ghi nhận");
  });

  let pendingId;
  await test("Thành viên tự báo 'tôi đã ủng hộ' ⇒ pending, Thủ quỹ nhận thông báo, CHƯA vào sổ quỹ", async () => {
    eq((await member.post("/api/v1/donations/report", { amountVnd: 0, donatedOn: today, method: "cash" })).status, 400);
    const r = await member.post("/api/v1/donations/report", { amountVnd: money(6), donatedOn: today, method: "bank_transfer", referenceCode: `FT${stamp}B`, note: `Em chuyển khoản ${stamp}` });
    eq(r.status, 201, JSON.stringify(r.json));
    pendingId = r.json.id;
    const d = find(await list(member, "?mine=1"), pendingId);
    eq(d.status, "pending");
    eq(d.selfReported, true);
    eq(d.fundId, null);
    ok(JSON.stringify((await treasurer.get("/api/v1/notifications")).json).includes("báo đã ủng hộ quỹ"), "Thủ quỹ phải nhận thông báo");
    const all = await list(treasurer, `?status=open&q=${stamp}`);
    ok(all.items.some((x) => x.id === pendingId), "lọc status=open thấy khoản chờ");
    ok(all.summary.pendingCount >= 1);
  });

  await test("Từ chối cần lý do; rút lại chỉ chính chủ; xác nhận ghi sổ và báo kết quả cho thành viên", async () => {
    eq((await member.patch(`/api/v1/donations/${pendingId}`, { action: "confirm", fundId: fund.id })).status, 403, "thành viên không tự xác nhận");
    eq((await treasurer.patch(`/api/v1/donations/${pendingId}`, { action: "reject" })).status, 422, "từ chối thiếu lý do");
    eq((await treasurer.patch(`/api/v1/donations/${pendingId}`, { action: "reject", note: "Chưa thấy tiền về tài khoản" })).status, 200);
    const rej = find(await list(treasurer, `?q=${stamp}`), pendingId);
    eq(rej.status, "rejected");
    eq(rej.decisionNote, "Chưa thấy tiền về tài khoản");
    // báo lần hai rồi rút lại
    const again = (await member.post("/api/v1/donations/report", { amountVnd: money(7), donatedOn: today, method: "cash", note: `Lần hai ${stamp}` })).json.id;
    eq((await other.patch(`/api/v1/donations/${again}`, { action: "withdraw" })).status, 422, "người khác không rút được");
    eq((await member.patch(`/api/v1/donations/${again}`, { action: "withdraw" })).status, 200);
    eq(find(await list(member, "?mine=1"), again).status, "cancelled");
    // báo lần ba rồi Thủ quỹ xác nhận
    const third = (await member.post("/api/v1/donations/report", { amountVnd: money(8), donatedOn: today, method: "cash", note: `Lần ba ${stamp}` })).json.id;
    eq((await treasurer.patch(`/api/v1/donations/${third}`, { action: "confirm", fundId: fund.id, note: "Đã nhận tiền mặt" })).status, 200);
    const ok3 = find(await list(treasurer, `?q=${stamp}`), third);
    eq(ok3.status, "confirmed");
    eq(ok3.fundId, fund.id);
    eq((await treasurer.patch(`/api/v1/donations/${third}`, { action: "confirm", fundId: fund.id })).status, 422, "xác nhận lần hai bị chặn");
    ok(JSON.stringify((await member.get("/api/v1/notifications")).json).includes("Chưa ghi nhận khoản ủng hộ"), "thành viên nhận thông báo từ chối");
  });

  await test("Idempotent: cùng clientRequestId không ghi sổ hai lần", async () => {
    const clientRequestId = randomUUID();
    const body = { donorName: `Người ủng hộ idempotent ${stamp}`, amountVnd: money(9), donatedOn: today, method: "cash", fundId: fund.id, received: true, clientRequestId };
    const a = await treasurer.post("/api/v1/donations", body);
    const b = await treasurer.post("/api/v1/donations", body);
    eq(a.status, 201, JSON.stringify(a.json));
    eq(b.status, 201);
    eq(a.json.id, b.json.id);
    eq((await list(treasurer, `?q=idempotent ${stamp}`)).items.length, 1);
  });
}
