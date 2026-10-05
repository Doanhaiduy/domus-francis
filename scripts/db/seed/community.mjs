// Seed phân hệ CỘNG ĐOÀN: thông báo (+ đối tượng nhận, lượt đọc/xác nhận, tệp đính kèm, RSVP), diễn đàn (bài, bình luận, tim),
// ý cầu nguyện (có ẩn danh thật qua app.fn_post_prayer), lịch phụng vụ (liturgical_days, buổi phụng vụ = events EVT_MASS/EVT_PATRON,
// phân công), suy niệm Lời Chúa, hộp thư trong ứng dụng (qua các hàm app.fn_notify_* của 95_community.sql).
// Mọi mốc thời gian bám "hôm nay" theo giờ Việt Nam lúc chạy. Chạy lại an toàn: phần nào đã có dữ liệu thì bỏ qua.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal, ROOT } from "../env.mjs";

const TZ_OFFSET = "+07:00";

// ---------------------------------------------------------------------
// Tiện ích thời gian (giờ VN)
// ---------------------------------------------------------------------
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Chúa Nhật
};
const at = (date, hm) => new Date(`${date}T${hm}:00${TZ_OFFSET}`);
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);
const minDate = (...ds) => new Date(Math.min(...ds.map((d) => d.getTime())));

// ---------------------------------------------------------------------
// PDF tối giản hợp lệ (tệp đính kèm mẫu — không cần thư viện, không gọi mạng)
// ---------------------------------------------------------------------
function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (m) => "\\" + m);
  const content = ["BT", "/F1 13 Tf", "56 780 Td", "20 TL", ...lines.map((l, i) => `(${esc(l)}) ${i ? "'" : "Tj"}`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function storePdf(ctx, uploadedBy, originalName, lines) {
  const { q } = ctx;
  const body = makePdf(lines);
  const id = (await q("SELECT app.uuid_v7() AS id"))[0].id;
  const now = new Date(Date.now() + 7 * 3600e3);
  const key = `attachments/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.pdf`;
  const root = path.resolve(ROOT, process.env.STORAGE_DIR || loadEnvLocal().STORAGE_DIR || ".local/storage");
  const abs = path.resolve(root, key);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  await q(
    `INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, detected_mime, size_bytes, sha256,
                                exif_stripped, status, scan_status, variants, uploaded_by)
     VALUES ($1, 'attachments', $2, $3, 'application/pdf', 'application/pdf', $4, $5, false, 'ready', 'skipped', '{}'::jsonb, $6)`,
    [id, key, originalName, body.length, createHash("sha256").update(body).digest("hex"), uploadedBy]
  );
  return id;
}

// ---------------------------------------------------------------------
// Lịch Phụng vụ 2026 (Năm A) — 27/09 → 02/11; ngày thường suy theo tuần Thường Niên của Chúa Nhật gần nhất
// ---------------------------------------------------------------------
const ROMAN = { 26: "XXVI", 27: "XXVII", 28: "XXVIII", 29: "XXIX", 30: "XXX", 31: "XXXI" };
const WD = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const FEASTS = {
  "2026-09-29": ["Các Tổng lãnh Thiên thần Micae, Gabriel và Raphael", "Lễ kính", "white"],
  "2026-09-30": ["Thánh Giêrônimô, Linh mục, Tiến sĩ Hội Thánh", "Lễ nhớ", "white"],
  "2026-10-01": ["Thánh Têrêsa Hài Đồng Giêsu, Trinh nữ, Tiến sĩ Hội Thánh", "Lễ nhớ", "white"],
  "2026-10-02": ["Các Thiên thần Hộ thủ", "Lễ nhớ", "white"],
  "2026-10-07": ["Đức Mẹ Mân Côi", "Lễ nhớ", "white"],
  "2026-10-15": ["Thánh Têrêsa Giêsu (Avila), Trinh nữ, Tiến sĩ Hội Thánh", "Lễ nhớ", "white"],
  "2026-10-17": ["Thánh Inhaxiô Antiôkia, Giám mục, Tử đạo", "Lễ nhớ", "red"],
  "2026-10-28": ["Thánh Simon và Thánh Giuđa, Tông đồ", "Lễ kính", "red"],
  "2026-11-01": ["Các Thánh Nam Nữ", "Lễ trọng", "white"],
  "2026-11-02": ["Cầu cho các tín hữu đã qua đời", "Lễ cầu hồn", "violet"],
};
const NOTES = {
  "2026-10-04": "Thánh Phanxicô Assisi — Bổn mạng Lưu Xá (mừng trọng thể)",
  "2026-10-18": "Chúa Nhật Truyền Giáo",
};
function liturgicalCalendar() {
  const out = [];
  let week = 26;
  for (let d = "2026-09-27"; d <= "2026-11-02"; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 0 && d !== "2026-09-27") week += 1;
    const ot = `Tuần ${ROMAN[week] ?? week} Thường Niên`;
    let [title, rank, color] = FEASTS[d] ?? [];
    if (!title) {
      title = wd === 0 ? `Chúa Nhật ${ROMAN[week]} Thường Niên` : `${WD[wd]} ${ot}`;
      rank = wd === 0 ? "Chúa Nhật" : null;
      color = "green";
    }
    out.push({ d, title, rank, color, abstinence: wd === 5, note: NOTES[d] ?? null });
  }
  return out;
}

// ---------------------------------------------------------------------
export async function seed(ctx) {
  const { q, ids } = ctx;
  const U = (mockId) => ids.user[mockId];
  const M = (mockId) => ids.member[mockId];
  const allMock = Object.keys(ids.member);
  const today = (await q("SELECT app.local_today()::text AS d"))[0].d;
  const cat = async (kind, code) => (await q("SELECT id FROM categories WHERE kind = $1 AND code = $2", [kind, code]))[0].id;

  const has = async (sql) => Number((await q(sql))[0].n) > 0;

  // =====================================================================
  // 1) Lịch phụng vụ: ngày lễ + buổi phụng vụ + phân công
  // =====================================================================
  for (const x of liturgicalCalendar()) {
    await q(
      `INSERT INTO liturgical_days (day_date, title, rank_label, color, is_abstinence, note) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (day_date) DO NOTHING`,
      [x.d, x.title, x.rank, x.color, x.abstinence, x.note]
    );
  }

  const evtMass = await cat("event", "EVT_MASS");
  const evtPatron = await cat("event", "EVT_PATRON");
  const lead = U("6"); // Đặng Thanh Phong — Trưởng ban Phụng vụ
  await ctx.as(lead);

  const sessions = []; // { id, date, kind: 'night'|'mass', patron }
  const findExisting = async (start) =>
    (
      await q(
        `SELECT e.id FROM events e JOIN categories c ON c.id = e.category_id
          WHERE c.kind = 'event' AND c.code IN ('EVT_MASS', 'EVT_PATRON') AND e.deleted_at IS NULL AND e.status <> 'cancelled'
            AND e.starts_at BETWEEN $1::timestamptz - interval '90 minutes' AND $1::timestamptz + interval '90 minutes'
          LIMIT 1`,
        [start]
      )
    )[0]?.id;
  const createEvent = async (title, catId, start, minutes, location, description) => {
    const ex = await findExisting(start);
    if (ex) return { id: ex, created: false };
    const id = (
      await q(
        `INSERT INTO events (title, category_id, status, starts_at, ends_at, location_text, organizer_text, description, created_by)
         VALUES ($1, $2, 'scheduled', $3, $3::timestamptz + make_interval(mins => $4), $5, 'Ban Phụng vụ', $6, $7) RETURNING id`,
        [title, catId, start, minutes, location, description, lead]
      )
    )[0].id;
    return { id, created: true };
  };

  for (let i = -3; i <= 10; i++) {
    const d = addDays(today, i);
    const wd = weekday(d);
    const isPatron = d.slice(5) === "10-04";
    if (wd === 0 || isPatron) {
      const ev = isPatron
        ? await createEvent("Thánh lễ Bổn mạng Lưu Xá Phanxicô", evtPatron, at(d, "08:30"), 90, "Nhà nguyện Lưu xá",
            "Thánh lễ tạ ơn mừng quan thầy Thánh Phanxicô Assisi, tiệc ngọt huynh đệ và chụp hình lưu niệm.")
        : await createEvent("Thánh lễ Chúa Nhật cộng đoàn", evtMass, at(d, "08:30"), 75, "Nhà nguyện Lưu xá",
            "Thánh lễ Chúa Nhật chung của cộng đoàn, mời quý Cha linh hướng chủ tế.");
      sessions.push({ id: ev.id, date: d, start: at(d, "08:30"), kind: "mass", patron: isPatron });
    }
    if (wd !== 0) {
      const title = wd === 5 ? "Ngắm Đàng Thánh Giá & Kinh Tối hiệp thông" : wd === 6 ? "Kinh Tối & Chầu Thánh Thể" : "Kinh Tối & Lần hạt Mân Côi chung cả nhà";
      const ev = await createEvent(title, evtMass, at(d, "20:30"), 45, "Nhà nguyện Lưu xá",
        wd === 5 ? "Ngày kiêng thịt — cùng suy niệm 14 chặng Đàng Thánh Giá." : "Tháng Mân Côi: lần hạt chung và cầu nguyện cho ý chỉ cộng đoàn.");
      sessions.push({ id: ev.id, date: d, start: at(d, "20:30"), kind: "night", patron: false });
    }
  }

  if (!(await has("SELECT count(*) AS n FROM liturgy_assignments"))) {
    const role = Object.fromEntries((await q("SELECT code, id FROM liturgy_role_types")).map((r) => [r.code, r.id]));
    const presiders = ["6", "7", "8", "9", "10", "11", "12", "3", "4", "5"];
    const cantors = ["12", "9", "7", "11", "10", "8"];
    let pi = 0;
    let ci = 0;
    const statusFor = (s, mock) => (s.start.getTime() < Date.now() ? "served" : mock === "1" ? "assigned" : s.date <= addDays(today, 1) ? "confirmed" : "assigned");
    const add = async (s, code, mock, note = null) => {
      const r = await q(
        `INSERT INTO liturgy_assignments (event_id, role_type_id, member_id, status, note, assigned_by)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`,
        [s.id, role[code], M(mock), statusFor(s, mock), note, lead]
      );
      if (r[0] && s.start.getTime() > Date.now() && s.date <= addDays(today, 3) && mock !== "6") {
        await q("SELECT app.fn_notify_liturgy_assignment($1)", [r[0].id]);
      }
    };
    for (const s of sessions) {
      if (s.kind === "night") {
        // Thành viên Minh Tuấn chủ sự Kinh Tối ngày mai (để tự xác nhận/từ chối)
        const p = s.date === addDays(today, 1) ? "1" : presiders[pi++ % presiders.length];
        await add(s, "presider", p);
        let c = cantors[ci++ % cantors.length];
        if (c === p) c = cantors[ci++ % cantors.length];
        await add(s, "cantor", c);
      } else {
        await add(s, "lector", "9", "Bài đọc 1");
        await add(s, "lector", "10", "Bài đọc 2");
        await add(s, "acolyte", "6");
        await add(s, "acolyte", "1");
        await add(s, "cantor", "7", "Ca trưởng");
        await add(s, "organist", "11");
        await add(s, "sound", "12");
        await add(s, "usher", "3");
      }
    }
    // Thông báo phân công: thời điểm gửi = 2 ngày trước buổi (không ở tương lai), đã đọc nếu gửi quá 1 ngày
    await q(
      `UPDATE notifications n SET created_at = LEAST(now() - interval '30 minutes', e.starts_at - interval '2 days')
         FROM liturgy_assignments la JOIN events e ON e.id = la.event_id
        WHERE n.entity_table = 'liturgy_assignments' AND n.entity_id = la.id`
    );
    await q("UPDATE notifications SET read_at = created_at + interval '2 hours' WHERE entity_table = 'liturgy_assignments' AND created_at < now() - interval '1 day' AND read_at IS NULL");
  }

  // =====================================================================
  // 2) Thông báo
  // =====================================================================
  if (!(await has("SELECT count(*) AS n FROM announcements"))) {
    const A = ctx.mock.INITIAL_ANNOUNCEMENTS;
    const annCat = {
      urgent: await cat("announcement", "ANN_URGENT"),
      event: await cat("announcement", "ANN_EVENT"),
      kitchen: await cat("announcement", "ANN_KITCHEN"),
      common: await cat("announcement", "ANN_COMMON"),
    };
    const floor2 = (await q("SELECT id FROM floors WHERE level = 2 AND deleted_at IS NULL"))[0]?.id;
    const nextMass = sessions.filter((s) => s.kind === "mass" && s.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const patron = nextMass?.patron;

    const items = [
      {
        key: "plan",
        author: "2",
        cat: annCat.urgent,
        title: A[0].title,
        content: A[0].content,
        published: at(addDays(today, -3), "10:30"),
        pinned: true,
        ack: true,
        ackDeadline: at(addDays(today, 4), "22:00"),
        attachment: {
          name: A[0].fileName ?? "Ke_hoach_Le_Bon_Mang_2026.pdf",
          lines: [
            "LUU XA SINH VIEN PHANXICO",
            "KE HOACH TONG VE SINH & LE BON MANG 2026",
            "",
            "1. Tong ve sinh: 07h00 - 10h30 Thu Bay.",
            "   Khu A: san va nha nguyen. Khu B: phong khach, hanh lang.",
            "2. Thanh le Bon mang Thanh Phanxico Assisi: 08h30 Chua Nhat 04/10.",
            "3. Tiec ngot huynh de va chup hinh luu niem sau Thanh le.",
            "",
            "Pax et Bonum.",
          ],
        },
        readers: ["2", "3", "4", "5", "6", "7", "8", "9"],
        ackers: ["3", "4", "5", "6", "8"],
      },
      {
        key: "kitchen",
        author: "8",
        cat: annCat.kitchen,
        title: A[1].title,
        content: `${A[1].content}\n\nHạn chốt báo cơm: trưa trước 09:00, tối trước 15:00. Ai về muộn nhớ báo để ban bếp để phần.`,
        published: at(addDays(today, -4), "18:00"),
        readers: ["1", "2", "3", "4", "6", "8", "10"],
      },
      {
        key: "finance",
        author: "4",
        cat: annCat.common,
        title: A[2].title,
        content: A[2].content,
        published: at(addDays(today, -6), "09:00"),
        readers: allMock.filter((k) => !["11", "12"].includes(k)),
      },
      nextMass && {
        key: "mass",
        author: "6",
        cat: annCat.event,
        title: patron ? "Mời dự Thánh lễ tạ ơn mừng Bổn mạng Thánh Phanxicô Assisi" : "Mời dự Thánh lễ Chúa Nhật cộng đoàn",
        content: patron
          ? "Kính mời toàn thể anh em tham dự Thánh lễ tạ ơn mừng Bổn mạng Lưu Xá lúc 08:30 tại Nhà nguyện. Sau Thánh lễ có tiệc ngọt huynh đệ và chụp hình lưu niệm.\n\nAnh em bấm \"Tôi sẽ có mặt\" để Ban Phụng vụ chuẩn bị chỗ ngồi và phần quà."
          : "Kính mời anh em tham dự Thánh lễ Chúa Nhật cộng đoàn lúc 08:30 tại Nhà nguyện Lưu xá. Anh em bấm \"Tôi sẽ có mặt\" để Ban Phụng vụ sắp xếp.",
        published: minDate(hoursAgo(20), at(addDays(today, -1), "20:00")),
        eventId: nextMass.id,
        readers: ["1", "2", "3", "6", "7", "9", "12"],
        going: ["2", "3", "6", "7", "9", "12"],
      },
      floor2 && {
        key: "power",
        author: "2",
        cat: annCat.common,
        title: "Bảo trì đường điện Tầng 2 (Lầu 1) tối Thứ Ba",
        content:
          "Thợ điện sẽ thay aptomat và kiểm tra ổ cắm các phòng Tầng 2 (Lầu 1) từ 19:00 đến 21:00 tối Thứ Ba tuần này.\n\nAnh em phòng P.4, P.5 vui lòng sạc sẵn laptop, rút phích các thiết bị và để trống lối đi trước cửa phòng. Xin cảm ơn!",
        published: minDate(hoursAgo(5), at(addDays(today, -1), "14:00")),
        targets: [{ col: "floor_id", id: floor2 }],
        readers: ["10"],
      },
    ].filter(Boolean);

    for (const it of items) {
      const authorUser = U(it.author);
      await ctx.as(authorUser);
      const id = (
        await q(
          `INSERT INTO announcements (title, content, category_id, author_member_id, event_id, status, is_pinned, pinned_until,
                                      requires_ack, ack_deadline, published_at, created_at)
           VALUES ($1, $2, $3, $4, $5, 'published', $6, $7, $8, $9, $10, $10) RETURNING id`,
          [
            it.title,
            it.content,
            it.cat,
            M(it.author),
            it.eventId ?? null,
            !!it.pinned,
            it.pinned ? new Date(it.published.getTime() + 14 * 86400_000) : null,
            !!it.ack,
            it.ack ? it.ackDeadline : null,
            it.published,
          ]
        )
      )[0].id;
      for (const t of it.targets ?? []) await q(`INSERT INTO announcement_targets (announcement_id, ${t.col}) VALUES ($1, $2)`, [id, t.id]);
      if (it.attachment) {
        const fid = await storePdf(ctx, authorUser, it.attachment.name, it.attachment.lines);
        await q(
          `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by, created_at)
           VALUES ($1, 'announcement', $2, 'attachment', $3, $4)`,
          [fid, id, authorUser, it.published]
        );
      }
      // Hộp thư: gửi cho đối tượng nhận (như khi đăng thật), mốc gửi = lúc đăng
      await q("SELECT app.fn_notify_announcement($1)", [id]);
      await q("UPDATE notifications SET created_at = $2 WHERE entity_table = 'announcements' AND entity_id = $1", [id, it.published]);
      // Lượt đọc / xác nhận theo từng người
      const readers = new Set([it.author, ...(it.readers ?? [])]);
      let k = 0;
      for (const r of readers) {
        const readAt = minDate(new Date(it.published.getTime() + (20 + 37 * k++) * 60_000), hoursAgo(0.2));
        const acked = it.ack && (it.ackers ?? []).includes(r) ? new Date(readAt.getTime() + 5 * 60_000) : null;
        await q(
          `INSERT INTO announcement_reads (announcement_id, member_id, read_at, acknowledged_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [id, M(r), readAt, acked]
        );
        await q(
          `UPDATE notifications SET read_at = $3, acked_at = $4
            WHERE entity_table = 'announcements' AND entity_id = $1 AND member_id = $2 AND read_at IS NULL`,
          [id, M(r), readAt, acked]
        );
      }
      for (const g of it.going ?? []) {
        await q(
          `INSERT INTO event_participants (event_id, member_id, is_invited, rsvp, rsvp_at) VALUES ($1, $2, false, 'going', $3)
           ON CONFLICT (event_id, member_id) DO UPDATE SET rsvp = 'going', rsvp_at = EXCLUDED.rsvp_at`,
          [it.eventId, M(g), minDate(new Date(it.published.getTime() + 3600_000), hoursAgo(0.5))]
        );
      }
    }
  }

  // =====================================================================
  // 3) Diễn đàn
  // =====================================================================
  if (!(await has("SELECT count(*) AS n FROM forum_posts"))) {
    const T = ctx.mock.INITIAL_FORUM_THREADS;
    const fc = {
      "Đi chơi": await cat("forum", "FORUM_SPORT"),
      "Bếp & Thực đơn": await cat("forum", "FORUM_FOOD"),
      "Góp ý chung": await cat("forum", "FORUM_FEEDBACK"),
      "Học tập": await cat("forum", "FORUM_STUDY"),
      "Giải trí": await cat("forum", "FORUM_LEISURE"),
    };
    const nameToMock = Object.fromEntries(ctx.mock.INITIAL_MEMBERS.flatMap((m) => [[m.fullName, m.id], [m.name, m.id]]));
    const mockOf = (n) => nameToMock[n.replace(/\s*\(.*\)\s*$/, "").trim()];
    const posts = [
      {
        t: T[0],
        author: mockOf(T[0].author),
        created: hoursAgo(18),
        pinned: true,
        comments: [
          [mockOf(T[0].replies[0].author), T[0].replies[0].content, 17.5],
          [mockOf(T[0].replies[1].author), T[0].replies[1].content, 9],
          ["1", "Em đăng ký đi! Nếu đi xe máy theo đoàn thì em xin chở thêm một bạn ạ.", 6],
          ["6", "Nhớ sắp xếp giờ để cả đoàn kịp tham dự Thánh lễ Chúa Nhật trước khi xuất phát nhé anh em.", 4],
          ["9", "Ban Truyền thông sẽ mang máy ảnh, về làm album Khoảnh khắc cho cả nhà.", 1.5],
        ],
        likes: ["1", "2", "4", "6", "7", "9", "10", "12"],
      },
      {
        t: T[1],
        author: mockOf(T[1].author),
        created: hoursAgo(2),
        comments: [
          ["8", "Ban bếp ghi nhận, sẽ cân đối chi phí và báo lại trong thực đơn tuần tới.", 1.2],
          ["7", "Ủng hộ bún bò Huế! Nhớ thêm chả cua nha.", 0.6],
        ],
        likes: ["1", "3", "7", "8", "10", "11"],
      },
      {
        t: T[2],
        author: mockOf(T[2].author),
        created: hoursAgo(30),
        comments: [
          ["4", "Khoản này nằm trong hạn mức chi nhỏ, em sẽ lập phiếu chi trên mục Thu Chi để anh Đức duyệt.", 28],
          ["10", "Mua loại có công tắc riêng từng ổ và dây dài 5m là vừa bàn học chung ạ.", 26],
          ["2", "Đồng ý. Bảo lập phiếu chi nhé, nhớ chụp hóa đơn đính kèm.", 22],
        ],
        likes: ["1", "2", "3", "4", "5", "7", "9", "10", "11"],
      },
      {
        t: {
          title: "Chia sẻ đề cương ôn thi giữa kỳ Giải tích 1 & Vật lý đại cương",
          content:
            "Mình đã tổng hợp đề cương và đề thi các năm trước của Giải tích 1, Vật lý đại cương 1. Bạn nào cần thì để lại bình luận, tối thứ Năm mình mở lớp ôn chung ở phòng tự học tầng 1 nhé.",
          category: "Học tập",
        },
        author: "10",
        created: hoursAgo(3 * 24 + 5),
        comments: [
          ["11", "Cho em xin với anh ơi, em học khối kỹ thuật năm nhất.", 3 * 24 + 2],
          ["1", "Tối thứ Năm em tham gia, em mang thêm bảng phụ.", 2 * 24 + 20],
        ],
        likes: ["1", "4", "9", "11", "12"],
      },
      {
        t: {
          title: "Tối thứ Sáu xem bóng đá chung ở phòng sinh hoạt?",
          content:
            "Thứ Sáu này có trận đội tuyển, anh em nào muốn xem chung thì sau giờ Kinh Tối mình kéo máy chiếu ra phòng sinh hoạt. Giữ trật tự sau 22:30 để không ảnh hưởng mọi người nghỉ ngơi.",
          category: "Giải trí",
        },
        author: "11",
        created: hoursAgo(4 * 24 + 3),
        comments: [["3", "Được, nhưng tắt máy chiếu đúng giờ giới nghiêm nhé các em.", 4 * 24]],
        likes: ["1", "7", "12"],
      },
    ];
    for (const p of posts) {
      if (!p.author) throw new Error(`Không tìm thấy tác giả chủ đề "${p.t.title}"`);
      await ctx.as(U(p.author));
      const pid = (
        await q(
          `INSERT INTO forum_posts (title, content, category_id, author_member_id, is_pinned, created_at, updated_at, last_activity_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $6) RETURNING id`,
          [p.t.title, p.t.content, fc[p.t.category], M(p.author), !!p.pinned, p.created]
        )
      )[0].id;
      for (const [who, text, h] of p.comments) {
        if (!who) throw new Error(`Không tìm thấy người bình luận trong "${p.t.title}"`);
        await ctx.as(U(who));
        const when = hoursAgo(h);
        const cid = (
          await q(
            `INSERT INTO forum_comments (post_id, author_member_id, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
            [pid, M(who), text, when]
          )
        )[0].id;
        await q("SELECT app.fn_notify_forum_reply($1)", [cid]);
        await q(
          `UPDATE notifications SET created_at = $2, read_at = CASE WHEN $2::timestamptz < now() - interval '1 day' THEN $2::timestamptz + interval '3 hours' END
            WHERE entity_table = 'forum_posts' AND payload->>'comment_id' = $1::text`,
          [cid, when]
        );
        await q("UPDATE forum_posts SET last_activity_at = $2 WHERE id = $1", [pid, when]);
      }
      for (const l of p.likes) {
        await q("INSERT INTO forum_reactions (post_id, member_id, kind, created_at) VALUES ($1, $2, 'heart', $3) ON CONFLICT DO NOTHING", [
          pid,
          M(l),
          new Date(p.created.getTime() + 30 * 60_000),
        ]);
      }
    }
  }

  // =====================================================================
  // 4) Ý cầu nguyện (ẩn danh thật qua app.fn_post_prayer)
  // =====================================================================
  if (!(await has("SELECT count(*) AS n FROM prayer_intentions"))) {
    const P = ctx.mock.INITIAL_PRAYERS;
    const prayers = [
      { author: "7", anon: true, text: P[0].text, h: 2, pray: ["1", "2", "3", "4", "6", "8", "9", "10"] },
      { author: "9", anon: false, text: "Cầu nguyện cho bố của em đang nằm viện tại quê sớm bình phục sức khỏe.", h: 26, pray: ["2", "3", "4", "5", "6", "7", "8", "10", "11", "12"] },
      { author: "2", anon: false, text: P[2].text, h: 3 * 24 + 4, pray: ["1", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] },
      { author: "1", anon: true, text: "Xin anh em cầu nguyện cho em vượt qua giai đoạn áp lực học tập và giữ được sự bình an trong tâm hồn.", h: 5 * 24, pray: ["2", "6", "7", "9", "11", "12"] },
      { author: "6", anon: false, text: "Cầu cho các ân nhân đã giúp đỡ Lưu Xá trong năm học mới, xin Chúa trả công bội hậu cho họ.", h: 6 * 24, pray: ["1", "2", "3", "4", "8", "10", "12"] },
      { author: "11", anon: false, text: "Tạ ơn Chúa vì em đã tìm được công việc làm thêm phù hợp với lịch học. Xin tiếp tục cầu nguyện để em sắp xếp thời gian tốt.", h: 12 * 24, pray: ["1", "2", "6", "9", "10"], answered: true },
    ];
    for (const p of prayers) {
      await ctx.as(U(p.author));
      const id = (await q("SELECT app.fn_post_prayer($1, $2) AS id", [p.text, p.anon]))[0].id;
      const created = hoursAgo(p.h);
      await q(
        `UPDATE prayer_intentions SET created_at = $2, updated_at = $2, expires_at = $2::timestamptz + interval '30 days', status = $3 WHERE id = $1`,
        [id, created, p.answered ? "answered" : "open"]
      );
      await q("UPDATE prayer_intention_authors SET created_at = $2 WHERE intention_id = $1", [id, created]);
      let k = 0;
      for (const m of p.pray) {
        await q("INSERT INTO prayer_responses (intention_id, member_id, responded_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [
          id,
          M(m),
          minDate(new Date(created.getTime() + (15 + 25 * k++) * 60_000), hoursAgo(0.1)),
        ]);
      }
    }
  }

  // =====================================================================
  // 5) Góc chia sẻ Lời Chúa
  // =====================================================================
  if (!(await has("SELECT count(*) AS n FROM reflections"))) {
    const monday = addDays(today, -((weekday(today) + 6) % 7));
    const refl = [
      {
        author: "1",
        week: monday,
        ref: "Ga 14, 27",
        quote: "Thầy để lại bình an cho các con, Thầy ban bình an của Thầy cho các con. Thầy ban cho các con không theo kiểu thế gian...",
        body: "Giữa những bộn bề bài vở thi cử, xin cho mỗi anh em tìm thấy sự lắng đọng và bình an đích thực trong giờ kinh chung mỗi tối.",
        h: 30,
      },
      {
        author: "6",
        week: addDays(monday, -7),
        ref: "Mt 11, 29",
        quote: "Anh em hãy mang lấy ách của tôi, và hãy học với tôi, vì tôi có lòng hiền hậu và khiêm nhường.",
        body: "Thánh Phanxicô chọn sống nghèo khó và khiêm nhường như Đức Giêsu. Tuần này mỗi anh em thử làm một việc phục vụ âm thầm cho cộng đoàn mà không cần ai biết.",
        h: 8 * 24,
      },
      {
        author: "2",
        week: addDays(monday, -14),
        ref: "Pl 4, 6-7",
        quote: "Anh em đừng lo lắng gì cả. Nhưng trong mọi hoàn cảnh, anh em cứ đem lời cầu khẩn, van xin và tạ ơn, mà giãi bày trước mặt Thiên Chúa.",
        body: "Đầu năm học mới nhiều lo toan: học phí, việc làm thêm, môn học khó. Hãy biến mỗi nỗi lo thành một lời cầu nguyện và tin rằng anh em không bước đi một mình.",
        h: 15 * 24,
      },
    ];
    for (const r of refl) {
      await ctx.as(U(r.author));
      await q(
        `INSERT INTO reflections (author_member_id, scripture_ref, quote, body, week_of, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [M(r.author), r.ref, r.quote, r.body, r.week, hoursAgo(r.h)]
      );
    }
  }

  await ctx.as(U("2"));
}
