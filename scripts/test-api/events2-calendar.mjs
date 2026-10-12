// Kiểm thử LỊCH (gói D):
//   • panel ngày đọc TUẦN TRỰC vệ sinh sân nhà (duty_weeks) chứa ngày đó: người trực, "bạn" (isMe), ghi chú, giai đoạn tuần
//   • tải .ics một sự kiện: chuẩn RFC 5545 (VCALENDAR/VEVENT, UID ổn định, DTSTART có TZID, thoát ký tự, gập dòng ≤ 75 octet, CRLF)
//   • đường dẫn lịch cá nhân theo mã bí mật: tạo / liệt kê (không lộ mã) / tối đa 5 / thu hồi; mã sai hoặc đã thu hồi ⇒ 404;
//     lịch chỉ chứa dữ liệu người đó được xem (không có sự kiện nháp, đã hủy, tuần trực của người khác); ghi lượt dùng gần nhất
import pg from "pg";

const pad = (n) => String(n).padStart(2, "0");
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const mondayOf = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
};
/** Bỏ gập dòng RFC 5545 */
const unfold = (s) => s.replace(/\r\n[ \t]/g, "");
const utf8 = (s) => Buffer.byteLength(s, "utf8");

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Lịch: tuần trực trên panel ngày, tải .ics, đường dẫn lịch cá nhân (đồng bộ lịch)");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const head = await as("duc.tran@luuxa.local");
  const member = await as("hieu.bui@luuxa.local");
  const other = await as("nam.phan@luuxa.local");
  const memberId = (await member.get("/api/v1/auth/me")).json.member.id;
  const otherId = (await other.get("/api/v1/auth/me")).json.member.id;
  const headUser = (await head.get("/api/v1/auth/me")).json.user.id;
  const tag = Date.now().toString(36);
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const H = 3_600_000;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const createdEvents = [];
  const createdWeeks = [];
  const createdTokens = [];

  // Tuần trống (chưa ai xếp) trong tương lai xa — tránh đụng dữ liệu của bộ kiểm thử khác
  const freeMonday = async (startOffset) => {
    for (let i = 0; i < 80; i++) {
      const w = mondayOf(addDays(today, startOffset + i * 7));
      if (!(await sql("SELECT 1 FROM duty_weeks WHERE week_start = $1::date", [w])).rowCount) return w;
    }
    throw new Error("không tìm được tuần trống");
  };
  const addWeek = async (weekStart, memberIds, note) => {
    const id = (await sql("INSERT INTO duty_weeks (week_start, note, created_by) VALUES ($1::date, $2, $3) RETURNING id", [weekStart, note, headUser])).rows[0].id;
    for (const m of memberIds) await sql("INSERT INTO duty_week_members (week_id, member_id) VALUES ($1, $2)", [id, m]);
    createdWeeks.push(id);
    return id;
  };

  try {
    let myWeek, otherWeek;
    await test("Panel ngày: trả tuần trực chứa ngày đó (người trực, 'bạn', ghi chú, giai đoạn); tuần chưa xếp ⇒ danh sách rỗng", async () => {
      myWeek = await freeMonday(14);
      await addWeek(myWeek, [memberId, otherId], `Ghi chú tuần trực ${tag}`);
      const d = addDays(myWeek, 3);
      const r = await member.get(`/api/v1/events/duties?date=${d}`);
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.date, d);
      eq(r.json.weekStart, myWeek);
      eq(r.json.weekEnd, addDays(myWeek, 6));
      ok(r.json.weekId, "thiếu weekId");
      eq(r.json.members.length, 2);
      ok(r.json.members.some((m) => m.id === memberId && m.isMe), "người xem phải được đánh dấu là 'bạn'");
      eq(r.json.isMine, true);
      eq(r.json.note, `Ghi chú tuần trực ${tag}`);
      eq(r.json.phase, "upcoming");
      eq(r.json.review, null);
      const seen = (await head.get(`/api/v1/events/duties?date=${d}`)).json;
      eq(seen.isMine, false, "Trưởng nhà không trực tuần này");
      ok(seen.members.every((m) => !m.isMe));
      const empty = await freeMonday(14);
      const e = (await member.get(`/api/v1/events/duties?date=${addDays(empty, 1)}`)).json;
      eq(e.weekId, null);
      eq(e.members.length, 0);
      eq((await member.get("/api/v1/events/duties?date=12-10-2026")).status, 400);
    });

    let evId;
    const title = `Tĩnh tâm, cầu nguyện; "đặc biệt" \\ ${tag}`;
    const longDesc = `Chương trình: ${"Chầu Thánh Thể và suy niệm Lời Chúa cùng anh em lưu xá — ".repeat(5)}kết thúc.`;
    await test("Tải .ics một sự kiện: VCALENDAR/VEVENT, UID ổn định, DTSTART TZID, thoát ký tự, gập dòng ≤ 75 octet, CRLF", async () => {
      const c = await head.post("/api/v1/events", {
        title,
        startsAt: iso(30 * H),
        endsAt: iso(32 * H),
        categoryCode: "EVT_MASS",
        location: "Nguyện đường, tầng 3",
        description: longDesc,
      });
      eq(c.status, 201, JSON.stringify(c.json));
      evId = c.json.id;
      createdEvents.push(evId);
      const r = await member.get(`/api/v1/events/${evId}/ics`, { raw: true });
      eq(r.status, 200);
      ok((r.headers.get("content-type") ?? "").startsWith("text/calendar"), r.headers.get("content-type"));
      ok(/attachment; filename="[a-z0-9-]+\.ics"/.test(r.headers.get("content-disposition") ?? ""), r.headers.get("content-disposition"));
      const body = await r.text();
      ok(body.startsWith("BEGIN:VCALENDAR\r\n"), "phải bắt đầu bằng BEGIN:VCALENDAR + CRLF");
      ok(body.endsWith("END:VCALENDAR\r\n"), "phải kết thúc bằng END:VCALENDAR");
      ok(!/[^\r]\n/.test(body), "mọi dòng phải kết thúc bằng CRLF");
      for (const line of body.split("\r\n")) ok(utf8(line) <= 75, `dòng dài ${utf8(line)} octet: ${line}`);
      ok(body.includes("\r\n "), "mô tả dài phải được gập dòng");
      const u = unfold(body);
      ok(u.includes("VERSION:2.0") && u.includes("BEGIN:VEVENT") && u.includes("END:VEVENT"), "thiếu thành phần bắt buộc");
      ok(u.includes(`UID:event-${evId}@luuxa-phanxico`), "UID phải ổn định theo mã sự kiện");
      ok(u.includes("BEGIN:VTIMEZONE") && u.includes("TZID:Asia/Ho_Chi_Minh"), "thiếu VTIMEZONE");
      ok(/DTSTART;TZID=Asia\/Ho_Chi_Minh:\d{8}T\d{6}\r\n/.test(u), "DTSTART phải có TZID");
      ok(/DTSTAMP:\d{8}T\d{6}Z/.test(u), "thiếu DTSTAMP UTC");
      ok(u.includes(`SUMMARY:Tĩnh tâm\\, cầu nguyện\\; "đặc biệt" \\\\ ${tag}`), `SUMMARY chưa thoát ký tự: ${u.match(/SUMMARY:.*/)?.[0]}`);
      ok(u.includes("LOCATION:Nguyện đường\\, tầng 3"), "LOCATION");
      ok(u.includes(longDesc.replace(/,/g, "\\,")), "DESCRIPTION sau khi bỏ gập dòng phải nguyên vẹn");
      // Tải lại: UID không đổi
      const again = unfold(await (await member.get(`/api/v1/events/${evId}/ics`, { raw: true })).text());
      ok(again.includes(`UID:event-${evId}@luuxa-phanxico`));
      eq((await member.get("/api/v1/events/00000000-0000-4000-8000-000000000000/ics")).status, 404);
    });

    let feedUrl, feedId;
    await test("Tạo đường dẫn lịch: 201 + URL một lần; danh sách không lộ mã; tối đa 5 đường dẫn đang dùng", async () => {
      const r = await member.post("/api/v1/me/calendar-feed", { label: `Điện thoại thử ${tag}` });
      eq(r.status, 201, JSON.stringify(r.json));
      feedUrl = r.json.url;
      feedId = r.json.item.id;
      createdTokens.push([member, feedId]);
      ok(/\/api\/v1\/public\/calendar\/[A-Za-z0-9_-]{43}\.ics$/.test(feedUrl), feedUrl);
      ok(r.json.webcalUrl.startsWith("webcal://"), r.json.webcalUrl);
      const list = (await member.get("/api/v1/me/calendar-feed")).json;
      const it = list.items.find((x) => x.id === feedId);
      ok(it, "đường dẫn mới không có trong danh sách");
      eq(it.label, `Điện thoại thử ${tag}`);
      ok(!JSON.stringify(list).includes(feedUrl.split("/").pop().replace(".ics", "")), "danh sách không được chứa mã");
      ok(!("token" in it) && !("tokenHash" in it) && !("token_hash" in it), "không được lộ mã/mã băm");
      // Người khác không thấy đường dẫn của mình
      ok(!(await other.get("/api/v1/me/calendar-feed")).json.items.some((x) => x.id === feedId), "người khác thấy đường dẫn của mình");
      // Tối đa 5
      const n = list.items.length;
      for (let i = n; i < 5; i++) {
        const x = await member.post("/api/v1/me/calendar-feed", { label: `Thêm ${i}` });
        eq(x.status, 201, JSON.stringify(x.json));
        createdTokens.push([member, x.json.item.id]);
      }
      const over = await member.post("/api/v1/me/calendar-feed", {});
      eq(over.status, 422, JSON.stringify(over.json));
    });

    await test("Lịch theo đường dẫn: không cần đăng nhập, chỉ dữ liệu được phép (không nháp/đã hủy/tuần trực người khác); ghi lượt dùng", async () => {
      // Sự kiện NHÁP (chỉ người tạo/quản lý thấy trong ứng dụng) + sự kiện ĐÃ HỦY
      const draft = (
        await sql(
          `INSERT INTO events (title, category_id, status, starts_at, ends_at, created_by)
           SELECT $1, c.id, 'draft', now() + interval '2 days', now() + interval '2 days 1 hour', $2 FROM categories c WHERE c.kind = 'event' AND c.code = 'EVT_MEET'
           RETURNING id`,
          [`Nháp bí mật ${tag}`, headUser]
        )
      ).rows[0].id;
      createdEvents.push(draft);
      const cancelled = await head.post("/api/v1/events", { title: `Sẽ hủy ${tag}`, startsAt: iso(50 * H), endsAt: iso(51 * H), categoryCode: "EVT_SOCIAL" });
      eq(cancelled.status, 201);
      createdEvents.push(cancelled.json.id);
      eq((await head.post(`/api/v1/events/${cancelled.json.id}/cancel`, { reason: "Kiểm thử hủy" })).status, 200);
      // Tuần trực CHỈ của người khác
      otherWeek = await freeMonday(28);
      await addWeek(otherWeek, [otherId], `Tuần của người khác ${tag}`);

      const anon = await fetch(feedUrl);
      eq(anon.status, 200);
      ok((anon.headers.get("content-type") ?? "").startsWith("text/calendar"), anon.headers.get("content-type"));
      const body = unfold(await anon.text());
      ok(body.startsWith("BEGIN:VCALENDAR") && body.includes("X-WR-CALNAME:"), "thiếu đầu lịch");
      ok(body.includes(`UID:event-${evId}@luuxa-phanxico`), "thiếu sự kiện người này được xem");
      ok(!body.includes(`Nháp bí mật ${tag}`), "lộ sự kiện nháp");
      ok(!body.includes(`Sẽ hủy ${tag}`), "sự kiện đã hủy không được có trong lịch");
      ok(body.includes(`UID:duty-`) && body.includes(`DTSTART;VALUE=DATE:${myWeek.replace(/-/g, "")}`), "thiếu tuần trực của chính mình");
      ok(body.includes(`DTEND;VALUE=DATE:${addDays(myWeek, 7).replace(/-/g, "")}`), "tuần trực phải kéo dài 7 ngày (DTEND độc quyền)");
      ok(!body.includes(`DTSTART;VALUE=DATE:${otherWeek.replace(/-/g, "")}`), "lộ tuần trực của người khác");
      ok(!body.includes(`Tuần của người khác ${tag}`), "lộ ghi chú tuần trực của người khác");
      for (const line of (await (await fetch(feedUrl)).text()).split("\r\n")) ok(utf8(line) <= 75, `dòng dài ${utf8(line)} octet`);
      const it = (await member.get("/api/v1/me/calendar-feed")).json.items.find((x) => x.id === feedId);
      ok(it.lastUsedAt, "phải ghi lượt dùng gần nhất");
    });

    await test("Mã sai / sai định dạng ⇒ 404; người khác không thu hồi được; thu hồi ⇒ đường dẫn hết hiệu lực (404)", async () => {
      const fake = feedUrl.replace(/[A-Za-z0-9_-]{43}\.ics$/, `${"A".repeat(43)}.ics`);
      eq((await fetch(fake)).status, 404, "mã sai");
      eq((await fetch(`${BASE}/api/v1/public/calendar/abc.ics`)).status, 404, "sai định dạng");
      eq((await other.del(`/api/v1/me/calendar-feed/${feedId}`)).status, 404, "người khác thu hồi");
      eq((await fetch(feedUrl)).status, 200, "vẫn dùng được");
      const r = await member.del(`/api/v1/me/calendar-feed/${feedId}`);
      eq(r.status, 200, JSON.stringify(r.json));
      ok(!r.json.items.some((x) => x.id === feedId), "đã thu hồi vẫn trong danh sách");
      eq((await fetch(feedUrl)).status, 404, "đã thu hồi phải 404");
      eq((await member.del(`/api/v1/me/calendar-feed/${feedId}`)).status, 404, "thu hồi lần hai");
    });
  } finally {
    for (const [c, id] of createdTokens) await c.del(`/api/v1/me/calendar-feed/${id}`).catch(() => {});
    for (const id of createdEvents) await head.del(`/api/v1/events/${id}`).catch(() => {});
    if (createdWeeks.length) await sql("DELETE FROM duty_weeks WHERE id = ANY ($1::uuid[])", [createdWeeks]).catch(() => {});
  }
}
