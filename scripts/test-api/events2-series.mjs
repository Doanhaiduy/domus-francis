// Kiểm thử SỰ KIỆN ĐỊNH KỲ (gói D — db/app/1049 + hàm thiết kế app.fn_generate_recurring_events):
//   • tạo chuỗi lặp hằng tuần ⇒ sinh ngay các buổi trong 14 ngày tới, đúng thứ, đúng giờ VN; DTO sự kiện có thông tin chuỗi
//   • bỏ một ngày = ngoại lệ ⇒ buổi bị gỡ, cron không sinh lại; khôi phục ⇒ buổi trở lại
//   • cron sáng (bước "recurring-events") sinh tiếp đúng ngày, chạy lại KHÔNG tạo trùng
//   • sửa "các buổi từ ngày X": buổi trước X giữ nguyên, buổi từ X đổi giờ/địa điểm; buổi đã sửa riêng giữ phần đã sửa
//   • đổi thứ trong tuần ⇒ buổi không còn khớp bị gỡ, buổi mới được tạo; dừng chuỗi ⇒ gỡ buổi chưa diễn ra, cron không sinh thêm; tiếp tục lại được
//   • xóa riêng một buổi ⇒ thành ngày nghỉ của chuỗi; quyền: thành viên thường chỉ xem
// Gọi cron thật như Vercel (GET /api/cron/daily?slot=morning + Bearer CRON_SECRET của máy chủ thử).
import pg from "pg";

const pad = (n) => String(n).padStart(2, "0");
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const isoDow = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
};
const datesBetween = (from, to, weekdays) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekdays.includes(isoDow(d))) out.push(d);
  return out;
};

export async function run({ as, test, eq, ok, section, BASE, pgConfig }) {
  section("Sự kiện định kỳ (lặp hằng tuần) — tạo, bỏ ngày, cron sinh tiếp, sửa các buổi sau, dừng");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const CRON = "test-cron-secret-0001";
  const head = await as("duc.tran@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const tag = Date.now().toString(36);
  const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
  const horizonEnd = addDays(today, 14);
  // Hai thứ trong tuần chắc chắn có buổi trong 14 ngày tới: thứ của ngày mai và của ngày kia + 2
  const weekdays = [...new Set([isoDow(addDays(today, 1)), isoDow(addDays(today, 4))])].sort((a, b) => a - b);
  const occ = async (ruleId) =>
    (
      await sql(
        `SELECT id, occurrence_date::text AS d, deleted_at IS NOT NULL AS del, status::text AS status, title, location_text AS loc,
                to_char(starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS hm, to_char(ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS ehm,
                starts_at > now() AS future
           FROM events WHERE recurrence_rule_id = $1 ORDER BY occurrence_date`,
        [ruleId]
      )
    ).rows;
  const active = async (ruleId) => (await occ(ruleId)).filter((x) => !x.del);
  const runCron = async () => {
    const r = await fetch(`${BASE}/api/cron/daily?slot=morning`, { headers: { authorization: `Bearer ${CRON}` } });
    const j = await r.json();
    ok([200, 500].includes(r.status), `HTTP ${r.status}`);
    const step = (j.steps ?? []).find((s) => s.name === "recurring-events");
    ok(step, `thiếu bước recurring-events: ${JSON.stringify(j.steps?.map((s) => s.name))}`);
    eq(step.ok, true, `bước recurring-events lỗi: ${step.error}`);
    return step;
  };

  let sid = null;
  let skipDate = null;
  try {
    await test("Thành viên thường: xem được danh sách sự kiện định kỳ nhưng không tạo được (403)", async () => {
      const l = await member.get("/api/v1/events/series");
      eq(l.status, 200, JSON.stringify(l.json));
      eq(l.json.canManage, false);
      eq(l.json.horizonDays, 14);
      const r = await member.post("/api/v1/events/series", { title: `Không được tạo ${tag}`, time: "21:00", weekdays: [1], startsOn: today });
      eq(r.status, 403, JSON.stringify(r.json));
    });

    await test("Dữ liệu sai bị từ chối: không chọn thứ / bắt đầu trong quá khứ / kết thúc trước khi bắt đầu", async () => {
      eq((await head.post("/api/v1/events/series", { title: `Sai ${tag}`, time: "21:00", weekdays: [], startsOn: today })).status, 400, "thiếu thứ");
      eq((await head.post("/api/v1/events/series", { title: `Sai ${tag}`, time: "21:00", weekdays: [1], startsOn: addDays(today, -3) })).status, 400, "quá khứ");
      eq(
        (await head.post("/api/v1/events/series", { title: `Sai ${tag}`, time: "21:00", weekdays: [1], startsOn: addDays(today, 5), untilDate: addDays(today, 1) })).status,
        400,
        "kết thúc trước bắt đầu"
      );
      eq((await head.post("/api/v1/events/series", { title: `Sai ${tag}`, time: "lúc nào đó", weekdays: [1], startsOn: today })).status, 400, "giờ không hiểu");
    });

    await test("Tạo chuỗi → sinh ngay đúng các ngày trong 14 ngày tới, đúng giờ VN, có ban tổ chức; lịch tháng có thông tin chuỗi", async () => {
      const headMember = (await head.get("/api/v1/auth/me")).json.member.id;
      const r = await head.post("/api/v1/events/series", {
        title: `Giờ kinh tối thử ${tag}`,
        time: "21:00",
        endTime: "21:30",
        categoryCode: "EVT_ROSARY",
        weekdays,
        startsOn: today,
        location: "Nguyện đường",
        organizerIds: [headMember],
        hasCheckIn: false,
      });
      eq(r.status, 201, JSON.stringify(r.json));
      sid = r.json.series.id;
      const expected = datesBetween(today, horizonEnd, weekdays);
      const got = await active(sid);
      eq(JSON.stringify(got.map((x) => x.d)), JSON.stringify(expected), "ngày sinh ra");
      eq(r.json.generated, expected.length, "số buổi báo về");
      ok(got.every((x) => x.hm === "21:00" && x.ehm === "21:30"), `giờ sai: ${JSON.stringify(got.map((x) => x.hm))}`);
      eq(r.json.series.weekdays.join(","), weekdays.join(","));
      eq(r.json.series.startHm, "21:00");
      eq(r.json.series.endHm, "21:30");
      ok(r.json.series.nextDates.length > 0, "thiếu ngày sắp tới");
      // Ban tổ chức được chép sang từng buổi
      const orgs = (await sql("SELECT count(*)::int AS n FROM event_organizers o JOIN events e ON e.id = o.event_id WHERE e.recurrence_rule_id = $1 AND o.role_label = 'lead'", [sid])).rows[0].n;
      eq(orgs, expected.length, "mỗi buổi có người chủ trì");
      const month = await member.get(`/api/v1/events?from=${today}&to=${horizonEnd}`);
      eq(month.status, 200);
      const ev = month.json.events.find((e) => e.series && e.series.id === sid);
      ok(ev, "lịch tháng không có buổi của chuỗi");
      eq(ev.series.occurrenceDate, ev.dateIso);
      ok(ev.series.label.length > 3, "thiếu nhãn chuỗi");
    });

    await test("Bỏ một ngày: buổi bị gỡ + ghi ngoại lệ; ngày không thuộc chuỗi → 422; thành viên thường → 403", async () => {
      const list = await active(sid);
      skipDate = list.find((x) => x.d > addDays(today, 3))?.d ?? list[list.length - 1].d;
      eq((await member.post(`/api/v1/events/series/${sid}/skip`, { date: skipDate })).status, 403, "thành viên");
      const wrong = datesBetween(addDays(today, 1), horizonEnd, [1, 2, 3, 4, 5, 6, 7].filter((d) => !weekdays.includes(d)))[0];
      eq((await head.post(`/api/v1/events/series/${sid}/skip`, { date: wrong })).status, 422, "ngày không thuộc chuỗi");
      const r = await head.post(`/api/v1/events/series/${sid}/skip`, { date: skipDate, reason: "Nghỉ lễ thử" });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.skips.some((k) => k.date === skipDate && k.reason === "Nghỉ lễ thử"), "danh sách ngày nghỉ");
      ok(!r.json.nextDates.includes(skipDate), "ngày đã bỏ vẫn nằm trong ngày sắp tới");
      const row = (await occ(sid)).find((x) => x.d === skipDate);
      eq(row?.del, true, "buổi của ngày bỏ phải bị gỡ");
    });

    await test("Cron sáng sinh tiếp đúng ngày, ngày bỏ qua không bị sinh lại, chạy lại không tạo trùng", async () => {
      // Giả lập hệ thống mới sinh tới hôm nay + 2: xóa hẳn các buổi sau đó (trừ buổi đã bỏ) và lùi mốc đã sinh
      await sql("DELETE FROM events WHERE recurrence_rule_id = $1 AND occurrence_date > $2::date + 2 AND occurrence_date <> $3::date", [sid, today, skipDate]);
      await sql("UPDATE event_recurrence_rules SET last_generated_through = $2::date + 2 WHERE id = $1", [sid, today]);
      const before = (await active(sid)).length;
      const step = await runCron();
      ok((step.info ?? []).some((m) => /Đã tạo \d+ buổi sự kiện định kỳ/.test(m)), `ghi chú bước: ${JSON.stringify(step.info)}`);
      const expected = datesBetween(today, horizonEnd, weekdays).filter((d) => d !== skipDate);
      const got = (await active(sid)).map((x) => x.d);
      eq(JSON.stringify(got), JSON.stringify(expected), "ngày sau khi cron sinh");
      ok(got.length > before, "cron phải sinh thêm buổi");
      const dup = (await sql("SELECT occurrence_date, count(*)::int AS n FROM events WHERE recurrence_rule_id = $1 GROUP BY 1 HAVING count(*) > 1", [sid])).rows;
      eq(dup.length, 0, "không được trùng ngày");
      const rowsBefore = (await occ(sid)).length;
      await runCron();
      eq((await occ(sid)).length, rowsBefore, "chạy lại cron không thêm dòng nào");
      eq(JSON.stringify((await active(sid)).map((x) => x.d)), JSON.stringify(expected), "chạy lại cron không đổi");
    });

    await test("Khôi phục ngày đã bỏ → buổi trở lại lịch; khôi phục ngày không bỏ → 404", async () => {
      const r = await head.post(`/api/v1/events/series/${sid}/restore`, { date: skipDate });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(!r.json.skips.some((k) => k.date === skipDate), "vẫn còn trong ngày nghỉ");
      eq((await occ(sid)).find((x) => x.d === skipDate)?.del, false, "buổi phải trở lại");
      eq((await head.post(`/api/v1/events/series/${sid}/restore`, { date: skipDate })).status, 404);
    });

    await test("Sửa các buổi TỪ một ngày: giờ + địa điểm mới từ ngày đó, buổi trước giữ nguyên, buổi đã sửa riêng giữ phần đã sửa", async () => {
      const list = (await active(sid)).filter((x) => x.future);
      ok(list.length >= 3, `cần ≥ 3 buổi sắp tới, có ${list.length}`);
      const from = list[1].d;
      const custom = list[2];
      // Sửa riêng địa điểm của một buổi sau ngày áp dụng
      const pr = await head.patch(`/api/v1/events/${custom.id}`, { location: "Phòng khách riêng" });
      eq(pr.status, 200, JSON.stringify(pr.json));
      const r = await head.patch(`/api/v1/events/series/${sid}`, { time: "20:30", endTime: "21:15", location: "Hội trường", fromDate: from });
      eq(r.status, 200, JSON.stringify(r.json));
      ok(r.json.updated >= 2, `số buổi được sửa: ${r.json.updated}`);
      eq(r.json.series.startHm, "20:30");
      eq(r.json.series.location, "Hội trường");
      for (const x of await active(sid)) {
        if (!x.future) continue;
        if (x.d < from) {
          eq(x.hm, "21:00", `buổi ${x.d} trước ngày áp dụng giữ giờ cũ`);
          eq(x.loc, "Nguyện đường", `buổi ${x.d} giữ địa điểm cũ`);
        } else {
          eq(x.hm, "20:30", `buổi ${x.d} đổi giờ`);
          eq(x.ehm, "21:15", `buổi ${x.d} đổi giờ kết thúc`);
          eq(x.loc, x.d === custom.d ? "Phòng khách riêng" : "Hội trường", `địa điểm buổi ${x.d}`);
        }
      }
      eq((await member.patch(`/api/v1/events/series/${sid}`, { title: "Đổi tên" })).status, 403, "thành viên không sửa được");
    });

    await test("Đổi thứ trong tuần: buổi không còn khớp bị gỡ, buổi khớp mới được tạo, không trùng", async () => {
      const newDays = [isoDow(addDays(today, 2))];
      const r = await head.patch(`/api/v1/events/series/${sid}`, { weekdays: newDays });
      eq(r.status, 200, JSON.stringify(r.json));
      const tomorrow = addDays(today, 1);
      const got = (await active(sid)).filter((x) => x.d >= tomorrow).map((x) => x.d);
      eq(JSON.stringify(got), JSON.stringify(datesBetween(tomorrow, horizonEnd, newDays)), "ngày theo thứ mới");
      ok(r.json.removed >= 1, "phải gỡ buổi cũ");
      const dup = (await sql("SELECT occurrence_date FROM events WHERE recurrence_rule_id = $1 GROUP BY 1 HAVING count(*) > 1", [sid])).rows;
      eq(dup.length, 0);
    });

    await test("Xóa riêng một buổi → thành ngày nghỉ của chuỗi (cron/đồng bộ không khôi phục)", async () => {
      const x = (await active(sid)).find((e) => e.future);
      ok(x, "cần một buổi sắp tới");
      eq((await head.del(`/api/v1/events/${x.id}`)).status, 200);
      const exc = (await sql("SELECT reason FROM event_recurrence_exceptions WHERE rule_id = $1 AND occurrence_date = $2::date", [sid, x.d])).rows[0];
      ok(exc && /xóa/i.test(exc.reason), "phải ghi ngày nghỉ khi xóa buổi");
      // Đồng bộ lại (sửa nhẹ chuỗi) không khôi phục buổi đã xóa
      eq((await head.patch(`/api/v1/events/series/${sid}`, { description: `Mô tả mới ${tag}` })).status, 200);
      eq((await occ(sid)).find((e) => e.d === x.d)?.del, true, "buổi đã xóa không được khôi phục");
    });

    await test("Dừng chuỗi → gỡ các buổi chưa diễn ra, cron không sinh thêm; tiếp tục chuỗi → lên lịch lại", async () => {
      const r = await head.post(`/api/v1/events/series/${sid}/stop`, {});
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.isActive, false);
      eq((await active(sid)).filter((x) => x.future).length, 0, "còn buổi tương lai sau khi dừng");
      eq((await head.post(`/api/v1/events/series/${sid}/stop`, {})).status, 422, "dừng lần hai");
      await runCron();
      eq((await active(sid)).filter((x) => x.future).length, 0, "cron không được sinh buổi cho chuỗi đã dừng");
      const re = await head.patch(`/api/v1/events/series/${sid}`, { isActive: true, noEnd: true });
      eq(re.status, 200, JSON.stringify(re.json));
      eq(re.json.series.isActive, true);
      ok((await active(sid)).filter((x) => x.future).length > 0, "tiếp tục phải lên lịch lại");
    });
  } finally {
    if (sid) await head.post(`/api/v1/events/series/${sid}/stop`, {}).catch(() => {});
  }
}
