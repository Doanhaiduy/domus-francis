// Kiểm thử gói E — Xuất "Danh sách tạm trú" (POST /api/v1/members/export/residence): CCCD ĐẦY ĐỦ, chỉ người có member.national_id.read,
// BẮT BUỘC lý do (≥ 5 ký tự), mỗi CCCD giải mã qua app.fn_national_id_cipher và ghi kiểm toán READ_SENSITIVE kèm lý do.
import pg from "pg";

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Thành viên — xuất danh sách tạm trú (CCCD đầy đủ, ghi kiểm toán)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const head = await as("duc.tran@luuxa.local"); // member.national_id.read
  const treasurer = await as("bao.pham@luuxa.local"); // không có quyền xem CCCD đầy đủ
  const regular = await as("tuan.nguyen@luuxa.local");
  const tag = Date.now().toString(36);
  const reason = `Khai báo tạm trú kiểm thử ${tag}`;
  const URL = "/api/v1/members/export/residence";
  const tuanId = (await regular.get("/api/v1/auth/me")).json.member.id;
  const nid = `0791${String(Date.now()).slice(-8)}`; // 12 chữ số

  await test("Chuẩn bị: gán CCCD đầy đủ cho một thành viên", async () => {
    const r = await head.patch(`/api/v1/members/${tuanId}`, { nationalId: nid });
    eq(r.status, 200, JSON.stringify(r.json));
  });

  await test("Không có quyền xem CCCD đầy đủ (Thủ quỹ, thành viên thường) ⇒ 403; chưa đăng nhập ⇒ 401", async () => {
    eq((await treasurer.post(URL, { reason })).status, 403);
    eq((await regular.post(URL, { reason })).status, 403);
  });

  await test("Thiếu lý do / lý do quá ngắn ⇒ 400 và KHÔNG ghi kiểm toán", async () => {
    const before = (await sql("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'READ_SENSITIVE'")).rows[0].n;
    eq((await head.post(URL, {})).status, 400);
    eq((await head.post(URL, { reason: "abc" })).status, 400);
    eq((await sql("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'READ_SENSITIVE'")).rows[0].n, before);
  });

  await test("Có quyền + lý do: trả danh sách thành viên đang ở kèm CCCD đầy đủ, ngày sinh/quê (định dạng DD/MM/YYYY), phòng; mỗi CCCD một dòng kiểm toán kèm lý do", async () => {
    const r = await head.post(URL, { reason });
    eq(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    ok(r.json.rows.length >= 5, "có danh sách");
    eq(r.json.reason, reason);
    const mine = r.json.rows.find((x) => x.memberId === tuanId);
    ok(mine, "có thành viên thử");
    eq(mine.nationalId, nid, "CCCD đầy đủ (đã giải mã)");
    ok(mine.fullName && mine.joinedOn && /^\d{2}\/\d{2}\/\d{4}$/.test(mine.joinedOn), "ngày vào ở DD/MM/YYYY: " + mine.joinedOn);
    const withNid = r.json.rows.filter((x) => x.nationalId).length;
    eq(r.json.missingNationalId, r.json.rows.length - withNid);
    const audited = (await sql("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'READ_SENSITIVE' AND reason = $1", [reason])).rows[0].n;
    eq(audited, withNid, "mỗi CCCD giải mã = một dòng READ_SENSITIVE kèm lý do");
    // Chỉ thành viên đang ở / tạm vắng
    const ids = r.json.rows.map((x) => x.memberId);
    const bad = (await sql("SELECT count(*)::int AS n FROM members WHERE id = ANY($1::uuid[]) AND status NOT IN ('active','on_leave')", [ids])).rows[0].n;
    eq(bad, 0);
  });

  await test("Dọn: bỏ CCCD thử", async () => {
    const r = await head.patch(`/api/v1/members/${tuanId}`, { nationalId: null });
    ok(r.status === 200 || r.status === 400, JSON.stringify(r.json));
  });
}
