// Seed phân hệ Lịch & Sự kiện: sự kiện (tháng này + tháng sau), ban tổ chức, RSVP, điểm danh của sự kiện đã diễn ra, biểu quyết + phiếu.
// Nguồn: INITIAL_EVENTS của giao diện cũ (ngày "hôm nay" của dữ liệu cũ là 04/10/2026) — mọi ngày được dời theo hôm nay (giờ VN).
// Chạy dưới superuser trong transaction của scripts/db/seed/index.mjs; người thao tác (audit, kiểm quyền trong trigger) = Trưởng nhà.
import { DEFAULT_DURATION_MIN, parseVnTime } from "../../../src/lib/events-format.ts";

const MOCK_TODAY = "2026-10-04";
const CAT_BY_LABEL = { "Phụng vụ": "EVT_MASS", "Họp nhà": "EVT_MEET", "Bổn mạng": "EVT_PATRON", "Dã ngoại": "EVT_TRIP", "Sinh hoạt": "EVT_SOCIAL" };
// Ban tổ chức có cấu trúc (người đầu tiên = chủ trì) cho các sự kiện của dữ liệu cũ
const ORGANIZERS = {
  "evt-1": ["Thanh Phong", "Văn Đức"],
  "evt-2": ["Văn Đức", "Hoàng Long"],
  "evt-3": ["Thanh Phong"],
  "evt-4": ["Văn Hiếu", "Đình Khôi"],
};

const pad = (n) => String(n).padStart(2, "0");
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const dmyToIso = (s) => s.split("/").reverse().join("-");
const vnTs = (dateIso, hm) => `${dateIso} ${hm}:00+07`;
const monthOf = (iso) => Number(iso.slice(5, 7));

export async function seed(ctx) {
  const { q, mock, ids } = ctx;
  const head = ids.userByRole.house_head;
  const liturgy = ids.userByRole.liturgy_lead ?? head;
  const exists = await q("SELECT 1 FROM events WHERE title = $1 LIMIT 1", [mock.INITIAL_EVENTS[0].title]);
  if (exists.length) {
    console.log("    (events: đã có sự kiện mẫu — bỏ qua)");
    return;
  }
  await ctx.as(head);

  const cats = Object.fromEntries((await q("SELECT code, id FROM categories WHERE kind = 'event'")).map((r) => [r.code, r.id]));
  const today = (await q("SELECT app.local_today()::text AS d"))[0].d;
  const shift = daysBetween(MOCK_TODAY, today);
  const memberId = (name) => ids.memberByName[name] ?? ids.memberByFullName[name] ?? null;
  const allMembers = Object.values(ids.member);
  const nowMs = Date.now();

  const created = []; // { id, key, startsMs, endsMs, hasCheckIn }

  async function addEvent(e) {
    const t = parseVnTime(e.time);
    if (!t) throw new Error(`Giờ không hợp lệ: ${e.time}`);
    const startHm = `${pad(t.h)}:${pad(t.m)}`;
    const startsAt = vnTs(e.date, startHm);
    const dur = e.durationMin ?? DEFAULT_DURATION_MIN[e.cat] ?? 90;
    const [row] = await q(
      `INSERT INTO events (title, category_id, starts_at, ends_at, location_text, organizer_text, description, requires_attendance, created_by)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz + make_interval(mins => $4), $5, $6, $7, $8, $9)
       RETURNING id, extract(epoch FROM starts_at) * 1000 AS s, extract(epoch FROM ends_at) * 1000 AS e`,
      [e.title, cats[e.cat], startsAt, dur, e.location, e.organizer, e.description ?? null, !!e.hasCheckIn, e.createdBy ?? head]
    );
    for (const [idx, name] of (e.organizers ?? []).entries()) {
      const mid = memberId(name);
      if (mid) await q("INSERT INTO event_organizers (event_id, member_id, role_label) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [row.id, mid, idx === 0 ? "lead" : "member"]);
    }
    const ev = { id: row.id, key: e.key, date: e.date, startsMs: Number(row.s), endsMs: Number(row.e), hasCheckIn: !!e.hasCheckIn };
    created.push(ev);
    return ev;
  }

  // 1) Sự kiện của giao diện cũ (dời ngày theo hôm nay)
  const mockEvents = {};
  for (const m of mock.INITIAL_EVENTS) {
    const date = addDays(dmyToIso(m.date), shift);
    const title = m.title.replace(/Tháng \d{1,2}\b/, `Tháng ${monthOf(date)}`);
    mockEvents[m.id] = await addEvent({
      key: m.id,
      title,
      date,
      time: m.time,
      cat: CAT_BY_LABEL[m.category] ?? "EVT_SOCIAL",
      location: m.location,
      organizer: m.organizer,
      description: m.description,
      hasCheckIn: !!m.hasCheckIn,
      organizers: ORGANIZERS[m.id] ?? [],
      createdBy: CAT_BY_LABEL[m.category] === "EVT_MASS" || CAT_BY_LABEL[m.category] === "EVT_PATRON" ? liturgy : head,
      durationMin: m.category === "Dã ngoại" ? 660 : undefined,
    });
  }

  // 2) Lịch sinh hoạt bổ sung cho phần còn lại của tháng này và tháng sau
  const d = (n) => addDays(today, n);
  const extra = [
    { key: "clean", title: "Tổng vệ sinh định kỳ khuôn viên Lưu xá", date: d(6), time: "07:00 sáng", cat: "EVT_CLEAN",
      location: "Toàn bộ khuôn viên & sân thượng", organizer: "Ban Hậu cần", hasCheckIn: true, organizers: ["Văn Hiếu", "Hữu Phước"],
      description: "Dọn dẹp phòng sinh hoạt chung, phát quang sân thượng, lau kính cầu thang. Anh em mang theo găng tay." },
    { key: "football", title: "Sinh hoạt chung: Giao lưu bóng đá với Lưu xá Đaminh", date: d(11), time: "17:30 chiều", cat: "EVT_SOCIAL",
      location: "Sân bóng Đại học Bách Khoa", organizer: "Ban Sinh hoạt", hasCheckIn: false, organizers: ["Anh Khoa"],
      description: "Giao hữu thể thao, sau đó ăn tối chung tại Lưu xá." },
    { key: "retreat", title: "Tĩnh tâm tháng & Bí tích Hòa giải", date: d(20), time: "19:30 tối", cat: "EVT_MASS",
      location: "Nhà nguyện Lưu xá", organizer: "Ban Phụng vụ", hasCheckIn: true, organizers: ["Thanh Phong"], createdBy: liturgy,
      description: "Linh mục đồng hành giảng tĩnh tâm, sau đó có giờ giải tội cho anh em." },
    { key: "meet-next", title: `Họp nhà định kỳ Tháng ${monthOf(d(28))}`, date: d(28), time: "19:30 tối", cat: "EVT_MEET",
      location: "Phòng sinh hoạt chung T2", organizer: "Trần Văn Đức (Trưởng nhà)", hasCheckIn: true, organizers: ["Văn Đức", "Gia Bảo"],
      description: "Tổng kết tháng, báo cáo quỹ chung, phân công trực nhật tháng mới." },
    { key: "souls", title: "Thánh lễ cầu cho các Đẳng linh hồn", date: d(29), time: "05:30 sáng", cat: "EVT_MASS",
      location: "Nhà thờ Giáo xứ", organizer: "Ban Phụng vụ", hasCheckIn: false, organizers: ["Thanh Phong"], createdBy: liturgy,
      description: "Hiệp thông cầu nguyện cho ông bà, cha mẹ và ân nhân đã qua đời." },
    { key: "adoration-next", title: "Giờ Kinh Tối & Chầu Thánh Thể đầu tháng", date: d(33), time: "20:30 tối", cat: "EVT_MASS",
      location: "Sảnh nguyện T2", organizer: "Ban Phụng vụ", hasCheckIn: true, organizers: ["Thanh Phong"], createdBy: liturgy,
      description: "Hiệp thông cầu nguyện cho quý ân nhân và gia đình các thành viên." },
    { key: "birthday", title: `Sinh hoạt chung: Mừng sinh nhật anh em Tháng ${monthOf(d(41))}`, date: d(41), time: "19:00 tối", cat: "EVT_SOCIAL",
      location: "Phòng sinh hoạt chung T2", organizer: "Ban Sinh hoạt", hasCheckIn: false, organizers: ["Anh Khoa", "Đình Khôi"],
      description: "Bánh kem, văn nghệ và trò chơi tập thể." },
    { key: "pilgrimage", title: "Hành hương Đền thánh Đức Mẹ Sở Kiện", date: d(48), time: "06:00 sáng", cat: "EVT_TRIP", durationMin: 600,
      location: "Đền thánh Sở Kiện, Hà Nam", organizer: "Ban Sinh hoạt & Hậu cần", hasCheckIn: true, organizers: ["Văn Hiếu", "Văn Đức"],
      description: "Thuê xe 29 chỗ, xuất phát từ cổng Lưu xá lúc 06:00." },
  ];
  for (const e of extra) await addEvent(e);

  // 3) RSVP: phản hồi mẫu (xác định, không ngẫu nhiên) — bỏ trống một số người để còn "chưa phản hồi"
  for (const [k, ev] of created.entries()) {
    for (const [j, mid] of allMembers.entries()) {
      if ((j + k) % 5 === 0) continue;
      const v = (j * 7 + k * 3) % 10;
      const rsvp = v <= 6 ? "going" : v <= 8 ? "maybe" : "not_going";
      await q(
        `INSERT INTO event_participants (event_id, member_id, is_invited, rsvp, rsvp_at)
         VALUES ($1, $2, true, $3, LEAST(now(), to_timestamp($4 / 1000.0)) - interval '1 day')`,
        [ev.id, mid, rsvp, ev.startsMs]
      );
    }
  }

  // 4) Điểm danh của sự kiện đã diễn ra (bắt đầu trước thời điểm seed): ghi hộ (manual) theo dữ liệu cũ
  for (const m of mock.INITIAL_EVENTS) {
    const ev = mockEvents[m.id];
    if (!ev.hasCheckIn || ev.startsMs > nowMs) continue;
    for (const c of m.checkIns ?? []) {
      const mid = memberId(c.memberName);
      if (!mid) continue;
      await q(
        `INSERT INTO attendance_records (event_id, member_id, status, method, checked_in_at, recorded_by, note)
         VALUES ($1, $2, $3::attendance_status_t, 'manual', $4::timestamptz, $5, $6)
         ON CONFLICT (event_id, member_id) DO NOTHING`,
        [ev.id, mid, c.status, vnTs(ev.date, c.checkedInAt), head, c.note ?? null]
      );
    }
    if (m.id === "evt-3") {
      const mid = memberId("Tuấn Kiệt");
      if (mid) {
        await q(
          `INSERT INTO attendance_records (event_id, member_id, status, method, recorded_by, note)
           VALUES ($1, $2, 'absent', 'manual', $3, 'Vắng không báo trước') ON CONFLICT (event_id, member_id) DO NOTHING`,
          [ev.id, mid, head]
        );
      }
    }
  }

  // 5) Biểu quyết + phiếu
  async function addPoll({ eventId, question, options, multi = false, maxChoices = 1, anonymous = false, closesAt = null, opensDaysAgo = 2, createdBy = head }) {
    const [p] = await q(
      `INSERT INTO polls (event_id, question, is_multi_select, max_choices, is_anonymous, status, opens_at, closes_at, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', now() - make_interval(days => $6), $7::timestamptz, $8, now() - make_interval(days => $6))
       RETURNING id`,
      [eventId, question, multi, maxChoices, anonymous, opensDaysAgo, closesAt, createdBy]
    );
    const optIds = [];
    for (const [idx, o] of options.entries()) {
      const [r] = await q("INSERT INTO poll_options (poll_id, label, sort_order) VALUES ($1, $2, $3) RETURNING id", [p.id, o.text, idx + 1]);
      optIds.push(r.id);
      for (const name of o.votes ?? []) {
        const mid = memberId(name);
        if (mid) await q("INSERT INTO poll_votes (poll_id, option_id, member_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [p.id, r.id, mid]);
      }
    }
    return p.id;
  }

  for (const m of mock.INITIAL_EVENTS) {
    if (!m.poll) continue;
    const ev = mockEvents[m.id];
    const closesAt = m.id === "evt-4" ? new Date(ev.startsMs - 3 * 86_400_000).toISOString() : null;
    await addPoll({
      eventId: ev.id,
      question: m.poll.question,
      options: m.poll.options,
      closesAt: closesAt && Date.parse(closesAt) > nowMs ? closesAt : null,
      opensDaysAgo: Math.max(0, daysBetween(dmyToIso(m.poll.createdAt), MOCK_TODAY)),
    });
  }

  const bday = created.find((e) => e.key === "birthday");
  await addPoll({
    eventId: bday.id,
    question: "Chọn hoạt động cho buổi sinh hoạt mừng sinh nhật (tối đa 2 lựa chọn)",
    multi: true,
    maxChoices: 2,
    opensDaysAgo: 1,
    closesAt: new Date(bday.startsMs - 7 * 86_400_000).toISOString(),
    options: [
      { text: "Văn nghệ & hát karaoke", votes: ["Anh Khoa", "Đình Khôi", "Bảo Nam"] },
      { text: "Nấu lẩu chung", votes: ["Anh Khoa", "Văn Đức", "Gia Bảo", "Hữu Phước"] },
      { text: "Trò chơi tập thể ngoài sân", votes: ["Đình Khôi", "Tuấn Kiệt"] },
      { text: "Chiếu phim & trà bánh", votes: ["Hữu Phước"] },
    ],
  });

  // Biểu quyết ẩn danh đã đóng (kết quả chỉ công bố tổng hợp)
  const anon = await addPoll({
    eventId: null,
    question: "Đánh giá ẩn danh: Buổi họp nhà tháng trước có hữu ích không?",
    anonymous: true,
    opensDaysAgo: 9,
    options: [
      { text: "Rất hữu ích, nội dung rõ ràng", votes: ["Văn Hiếu", "Gia Bảo", "Thanh Phong", "Bảo Nam", "Hữu Phước"] },
      { text: "Bình thường", votes: ["Đình Khôi", "Anh Khoa", "Tuấn Kiệt"] },
      { text: "Cần rút ngắn thời gian họp", votes: ["Quốc Việt", "Minh Tuấn"] },
    ],
  });
  await q("UPDATE polls SET status = 'closed' WHERE id = $1", [anon]);

  console.log(`    events: ${created.length} sự kiện, dời ngày ${shift >= 0 ? "+" : ""}${shift} so với dữ liệu cũ`);
}
