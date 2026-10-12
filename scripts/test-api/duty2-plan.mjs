// Kiểm thử gói C — TRỰC VỆ SINH THEO TUẦN:
//   • Xếp lịch tự động nhiều tuần (GET /api/v1/duty/weeks/plan): đúng THỨ TỰ CÔNG BẰNG của bảng trực (ít lượt gần đây → lâu nhất chưa trực →
//     số thứ tự), mô phỏng lại từng tuần; tuần đã có người được giữ trừ khi ghi đè; tuần đã đánh giá bị khóa; chỉ người có duty.manage.
//   • Lưu nhiều tuần một lần (POST /api/v1/duty/weeks/bulk): bỏ qua tuần đã có người (trừ khi overwrite), tuần đã đánh giá; dữ liệu sai ⇒ 400.
//   • Lịch sử xuất Excel (GET /api/v1/duty/weeks/history).
//   • Bước cron "duty-monday": app.fn_duty_week_start_notify báo đúng người trực (kèm tên bạn cùng trực, link /hau-can?tab=truc-nhat), chống trùng;
//     chạy cron thật (GET /api/cron/daily?slot=morning): Thứ Hai ⇒ người trực tuần này nhận thông báo; ngày khác ⇒ bước chạy nhưng không gửi.
// Dùng các tuần ở xa trong tương lai (đánh dấu ghi chú "duty2-test") và tự dọn sau khi chạy.
import pg from "pg";

const DAY = 86_400_000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const mondayOf = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
};
const MARK = "duty2-test";

/** Mô phỏng thứ tự công bằng: (số lượt tăng dần, lần gần nhất cũ nhất — chưa từng trực trước, thứ tự ban đầu) — mỗi tuần lấy 2 người đầu. */
function simulate(candidates, weeks, per = 2) {
  const st = candidates.map((c, i) => ({ id: c.id, count: c.recentCount, last: c.lastWeek, i }));
  const out = [];
  for (const ws of weeks) {
    st.sort((a, b) => a.count - b.count || (a.last === b.last ? 0 : a.last === null ? -1 : b.last === null ? 1 : a.last < b.last ? -1 : 1) || a.i - b.i);
    const picked = st.slice(0, per);
    for (const p of picked) {
      p.count++;
      if (!p.last || ws > p.last) p.last = ws;
    }
    out.push(picked.map((p) => p.id));
  }
  return out;
}

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Gói C — Trực tuần: xếp lịch tự động nhiều tuần, xuất Excel, nhắc người trực sáng Thứ Hai (cron duty-monday)");
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
  const member = await as("tuan.nguyen@luuxa.local");
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const thisWeek = mondayOf(today);
  // Tuần thử ở xa (≈ 3 năm sau, lệch ngẫu nhiên) để không đụng lịch thật
  const F = addDays(thisWeek, 7 * (156 + Math.floor(Math.random() * 200)));
  const W = (i) => addDays(F, 7 * i);
  const board = async (week) => (await head.get(`/api/v1/duty/weeks${week ? `?week=${week}` : ""}`)).json;
  const plan = (c, from, weeks, overwrite = false) => c.get(`/api/v1/duty/weeks/plan?from=${from}&weeks=${weeks}&overwrite=${overwrite ? 1 : 0}`);
  const ids = (list) => list.map((m) => m.id);
  const cleanup = async () => {
    await sql("DELETE FROM duty_weeks WHERE note LIKE $1 OR (week_start >= $2::date AND week_start <= $3::date)", [`${MARK}%`, F, W(20)]);
    await sql("DELETE FROM system_post_log WHERE key LIKE 'duty-monday:%' AND split_part(key, ':', 2)::date >= $1::date", [F]);
  };
  await cleanup();

  try {
    let first;
    await test("Xem trước 6 tuần trống: mỗi tuần 2 người, đúng thứ tự công bằng của bảng trực (mô phỏng từng tuần); không ghi gì", async () => {
      const r = await plan(head, F, 6);
      eq(r.status, 200, JSON.stringify(r.json));
      first = r.json;
      eq(first.weeks.length, 6);
      eq(first.from, F);
      ok(first.weeks.every((w) => w.action === "fill" && w.proposed.length === 2), JSON.stringify(first.weeks.map((w) => [w.action, w.proposed.length])));
      const b = await board();
      eq(JSON.stringify(ids(first.candidates)), JSON.stringify(ids(b.candidates)), "danh sách sửa tay phải cùng thứ tự công bằng với bảng trực");
      eq(JSON.stringify(ids(first.weeks[0].proposed)), JSON.stringify(b.candidates.slice(0, 2).map((c) => c.id)), "tuần đầu = 2 người đứng đầu thứ tự công bằng");
      const expected = simulate(b.candidates, first.weeks.map((w) => w.weekStart));
      eq(JSON.stringify(first.weeks.map((w) => ids(w.proposed))), JSON.stringify(expected), "mỗi tuần sau xếp lại theo số lượt mới");
      if (b.candidates.length >= 12) eq(new Set(first.weeks.flatMap((w) => ids(w.proposed))).size, 12, "đủ người thì không ai trực hai lần trong 6 tuần");
      eq((await sql("SELECT count(*)::int AS n FROM duty_weeks WHERE week_start BETWEEN $1::date AND $2::date", [F, W(5)])).rows[0].n, 0, "xem trước không được ghi");
    });

    await test("Quyền: thành viên thường xem trước / lưu hàng loạt ⇒ 403; tham số sai ⇒ 400", async () => {
      eq((await plan(member, F, 4)).status, 403);
      eq((await member.post("/api/v1/duty/weeks/bulk", { weeks: [{ weekStart: F, memberIds: ids(first.weeks[0].proposed) }] })).status, 403);
      eq((await plan(head, F, 30)).status, 400, "quá số tuần");
      eq((await plan(head, addDays(thisWeek, -7), 4)).status, 400, "tuần đã qua");
    });

    await test("Lưu 4 tuần trong MỘT thao tác: lưu đủ, người được xếp nhận thông báo, bảng trực hiện đúng người", async () => {
      const weeks = first.weeks.slice(0, 4).map((w) => ({ weekStart: w.weekStart, memberIds: ids(w.proposed), note: `${MARK} ${w.weekStart}` }));
      const r = await head.post("/api/v1/duty/weeks/bulk", { weeks, overwrite: false });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(JSON.stringify(r.json.saved), JSON.stringify(weeks.map((w) => w.weekStart)));
      eq(r.json.skipped.length, 0);
      const b = await board(W(1));
      eq(JSON.stringify(ids(b.week.members).sort()), JSON.stringify([...weeks[1].memberIds].sort()));
      const n = await sql(
        "SELECT count(*)::int AS n FROM notifications WHERE type_code = 'duty.week_assigned' AND entity_table = 'duty_weeks' AND entity_id IN (SELECT id FROM duty_weeks WHERE week_start BETWEEN $1::date AND $2::date)",
        [F, W(3)]
      );
      eq(n.rows[0].n, 8, "8 người được xếp nhận thông báo duty.week_assigned");
    });

    await test("Xem trước lại (không ghi đè): 4 tuần đã có người được GIỮ, 2 tuần còn lại xếp theo số lượt mới", async () => {
      const r = (await plan(head, F, 6)).json;
      eq(JSON.stringify(r.weeks.map((w) => w.action)), JSON.stringify(["keep", "keep", "keep", "keep", "fill", "fill"]));
      eq(JSON.stringify(ids(r.weeks[0].existing).sort()), JSON.stringify(ids(first.weeks[0].proposed).sort()), "tuần giữ nguyên hiện người đang xếp");
      const b = await board();
      const expected = simulate(b.candidates, [W(4), W(5)]);
      eq(JSON.stringify([ids(r.weeks[4].proposed), ids(r.weeks[5].proposed)]), JSON.stringify(expected));
      if (b.candidates.length >= 12) {
        const kept = new Set(first.weeks.slice(0, 4).flatMap((w) => ids(w.proposed)));
        ok(r.weeks.slice(4).every((w) => w.proposed.every((m) => !kept.has(m.id))), "người vừa xếp 4 tuần trước không bị xếp tiếp khi còn người chưa trực");
      }
    });

    await test("Lưu 6 tuần không ghi đè ⇒ chỉ lưu 2 tuần trống, bỏ qua 4 tuần đã có người", async () => {
      const r = (await plan(head, F, 6)).json;
      const weeks = r.weeks.map((w) => ({ weekStart: w.weekStart, memberIds: ids(w.action === "fill" ? w.proposed : w.existing), note: `${MARK} ${w.weekStart}` }));
      const s = await head.post("/api/v1/duty/weeks/bulk", { weeks, overwrite: false });
      eq(s.status, 200, JSON.stringify(s.json));
      eq(JSON.stringify(s.json.saved), JSON.stringify([W(4), W(5)]));
      eq(s.json.skipped.length, 4);
      ok(s.json.skipped.every((x) => /đã có người/.test(x.reason)), JSON.stringify(s.json.skipped));
    });

    await test("Ghi đè + sửa tay: tuần đầu đổi thành 1 người tự chọn; tuần đã đánh giá luôn bị khóa và bỏ qua", async () => {
      // Một tuần đã được đánh giá (chèn thẳng — đánh giá thật chỉ làm được với tuần đã bắt đầu)
      const someone = first.candidates[first.candidates.length - 1].id;
      const rw = (
        await sql("INSERT INTO duty_weeks (week_start, note, score, review_comment, reviewed_at) VALUES ($1::date, $2, 8, 'Tốt', now()) RETURNING id", [W(6), `${MARK} reviewed`])
      ).rows[0].id;
      await sql("INSERT INTO duty_week_members (week_id, member_id) VALUES ($1, $2)", [rw, someone]);
      const r = (await plan(head, F, 7, true)).json;
      eq(r.weeks[6].action, "locked");
      eq(r.weeks[6].proposed.length, 0);
      ok(r.weeks.slice(0, 6).every((w) => w.action === "overwrite"), JSON.stringify(r.weeks.map((w) => w.action)));
      // Ghi đè: người đang xếp ở các tuần bị thay không bị tính lượt ⇒ tuần đầu lại là 2 người đầu thứ tự công bằng như lúc chưa xếp gì
      eq(JSON.stringify(ids(r.weeks[0].proposed)), JSON.stringify(ids(first.weeks[0].proposed)));
      const pick = first.candidates.find((c) => !ids(first.weeks[0].proposed).includes(c.id)).id;
      const s = await head.post("/api/v1/duty/weeks/bulk", {
        weeks: [
          { weekStart: W(0), memberIds: [pick] },
          { weekStart: W(6), memberIds: ids(r.weeks[0].proposed) },
        ],
        overwrite: true,
      });
      eq(s.status, 200, JSON.stringify(s.json));
      eq(JSON.stringify(s.json.saved), JSON.stringify([W(0)]));
      ok(s.json.skipped.length === 1 && /đánh giá/.test(s.json.skipped[0].reason), JSON.stringify(s.json.skipped));
      const b = await board(W(0));
      eq(JSON.stringify(ids(b.week.members)), JSON.stringify([pick]));
      eq(b.week.note, `${MARK} ${W(0)}`, "không gửi ghi chú ⇒ giữ ghi chú cũ của tuần");
      const kept = await board(W(6));
      eq(JSON.stringify(ids(kept.week.members)), JSON.stringify([someone]), "tuần đã đánh giá không đổi");
    });

    await test("Dữ liệu sai ⇒ 400, không lưu tuần nào (một giao dịch)", async () => {
      const two = ids(first.weeks[1].proposed);
      eq((await head.post("/api/v1/duty/weeks/bulk", { weeks: [{ weekStart: addDays(thisWeek, -7), memberIds: two }] })).status, 400, "tuần đã qua");
      eq((await head.post("/api/v1/duty/weeks/bulk", { weeks: [{ weekStart: addDays(W(10), 2), memberIds: two }] })).status, 400, "không phải Thứ Hai");
      eq((await head.post("/api/v1/duty/weeks/bulk", { weeks: [{ weekStart: W(10), memberIds: two }, { weekStart: W(10), memberIds: two }] })).status, 400, "tuần lặp");
      eq((await head.post("/api/v1/duty/weeks/bulk", { weeks: [{ weekStart: W(10), memberIds: [...two, first.candidates[5].id] }] })).status, 400, "quá 2 người");
      // Tuần 11 hợp lệ + tuần 12 có người không tồn tại ⇒ cả lượt lỗi, tuần 11 cũng không được lưu
      const bad = await head.post("/api/v1/duty/weeks/bulk", {
        weeks: [
          { weekStart: W(11), memberIds: two, note: MARK },
          { weekStart: W(12), memberIds: ["01890000-0000-7000-8000-000000000000"], note: MARK },
        ],
      });
      ok(bad.status >= 400 && bad.status < 500, `phải lỗi 4xx: ${bad.status}`);
      eq((await sql("SELECT count(*)::int AS n FROM duty_weeks WHERE week_start = $1::date", [W(11)])).rows[0].n, 0, "không lưu dở dang");
    });

    await test("Lịch sử xuất Excel: mọi thành viên đọc được, có người trực + kết quả đánh giá; khoảng quá 2 năm ⇒ 400", async () => {
      const h = await member.get(`/api/v1/duty/weeks/history?from=${F}&to=${W(8)}`);
      eq(h.status, 200, JSON.stringify(h.json));
      const by = Object.fromEntries(h.json.weeks.map((w) => [w.weekStart, w]));
      ok(by[W(1)] && by[W(1)].members.length === 2, "tuần 2 có 2 người");
      eq(by[W(6)].review.score, 8);
      eq(by[W(6)].review.comment, "Tốt");
      eq((await member.get(`/api/v1/duty/weeks/history?from=${F}&to=${addDays(F, 800)}`)).status, 400);
    });

    await test("Nhắc đầu tuần (app.fn_duty_week_start_notify): báo đúng 2 người trực, kèm bạn cùng trực + link; gọi lại không gửi trùng", async () => {
      const wk = await board(W(1));
      const [a, b] = wk.week.members;
      const before = (await sql("SELECT now() AS t")).rows[0].t;
      eq((await sql("SELECT app.fn_duty_week_start_notify($1::date) AS n", [W(1)])).rows[0].n, 2);
      const rows = (
        await sql("SELECT member_id, title, body, payload->>'link' AS link FROM notifications WHERE type_code = 'duty.week_reminder' AND created_at >= $1 ORDER BY created_at", [before])
      ).rows.filter((r) => r.member_id === a.id || r.member_id === b.id);
      eq(rows.length, 2, JSON.stringify(rows));
      const ra = rows.find((r) => r.member_id === a.id);
      ok(/Tuần này bạn trực vệ sinh/.test(ra.title), ra.title);
      ok(ra.body.includes(`Bạn trực cùng ${b.name}`), ra.body);
      eq(ra.link, "/hau-can?tab=truc-nhat");
      eq((await sql("SELECT app.fn_duty_week_start_notify($1::date) AS n", [W(1)])).rows[0].n, 0, "lần hai không gửi trùng");
      eq((await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key LIKE $1", [`duty-monday:${W(1)}:%`])).rows[0].n, 2);
      eq((await sql("SELECT app.fn_duty_week_start_notify($1::date) AS n", [W(30)])).rows[0].n, 0, "tuần chưa xếp ⇒ 0");
      let threw = false;
      try {
        await sql("SELECT app.fn_duty_week_start_notify($1::date)", [addDays(W(1), 1)]);
      } catch {
        threw = true;
      }
      ok(threw, "ngày không phải Thứ Hai ⇒ lỗi");
    });

    await test("Cron thật (sáng): bước duty-monday chạy được; Thứ Hai ⇒ người trực tuần này nhận thông báo (một lần), ngày khác ⇒ không gửi", async () => {
      const dow = (await sql("SELECT extract(isodow FROM app.local_today())::int AS d")).rows[0].d;
      let createdWeek = null;
      let expected = [];
      if (dow === 1) {
        const cur = await board(thisWeek);
        if (!cur.week.members.length && !cur.week.review) {
          const two = cur.candidates.slice(0, 2).map((c) => c.id);
          const s = await head.post("/api/v1/duty/weeks", { weekStart: thisWeek, memberIds: two, notifyZalo: false });
          eq(s.status, 200, JSON.stringify(s.json));
          createdWeek = s.json.entry.id;
          expected = two;
        } else expected = ids(cur.week.members);
        await sql("DELETE FROM system_post_log WHERE key LIKE $1", [`duty-monday:${thisWeek}:%`]);
      }
      const keysBefore = (await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key LIKE $1", [`duty-monday:${thisWeek}:%`])).rows[0].n;
      const started = (await sql("SELECT now() AS t")).rows[0].t;
      try {
        const run = async () => {
          const r = await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: "Bearer test-cron-secret-0001" } });
          const j = await r.json();
          ok([200, 500].includes(r.status), `HTTP ${r.status}`);
          const step = (j.steps ?? []).find((s) => s.name === "duty-monday");
          ok(step, `thiếu bước duty-monday: ${JSON.stringify(j.steps?.map((s) => s.name))}`);
          eq(step.ok, true, `bước duty-monday lỗi: ${step.error}`);
          return step;
        };
        await run();
        const got = (
          await sql("SELECT member_id FROM notifications WHERE type_code = 'duty.week_reminder' AND created_at >= $1 AND title LIKE 'Tuần này bạn trực%'", [started])
        ).rows.map((r) => r.member_id);
        if (dow === 1) {
          eq(JSON.stringify([...new Set(got)].sort()), JSON.stringify([...expected].sort()), "đúng người trực tuần này");
          await run();
          const again = (await sql("SELECT count(*)::int AS n FROM notifications WHERE type_code = 'duty.week_reminder' AND created_at >= $1 AND title LIKE 'Tuần này bạn trực%'", [started])).rows[0].n;
          eq(again, expected.length, "chạy lại cùng ngày không gửi trùng");
        } else {
          eq(got.length, 0, "không phải Thứ Hai ⇒ không nhắc");
          eq((await sql("SELECT count(*)::int AS n FROM system_post_log WHERE key LIKE $1", [`duty-monday:${thisWeek}:%`])).rows[0].n, keysBefore);
        }
      } finally {
        if (createdWeek) await sql("DELETE FROM duty_weeks WHERE id = $1", [createdWeek]);
      }
    });
  } finally {
    await cleanup();
  }
}
