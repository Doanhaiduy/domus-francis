// Seed phân hệ Hậu cần & Trực nhật: roster 3 tuần (tuần trước, tuần này, tuần sau — đã công bố), check-in + nghiệm thu,
// đơn đổi ca, sự cố (INITIAL_ISSUES), lượt giặt, thiết bị cho mượn + một lượt mượn. Ngày tính theo hôm nay (giờ VN).
//
// Check-in quá khứ: trigger trg_duty_checkins__rules kiểm khung giờ theo now() nên không chèn được lượt check-in của ngày đã qua.
// Seed TẮT RIÊNG trigger đó trong transaction (bật lại trước COMMIT); mọi trigger khác (cập nhật trạng thái ca, BR-DUTY-09
// đủ tiêu chí, nghiệm thu không tự duyệt, cộng điểm, nhật ký) vẫn chạy thật. Ảnh minh chứng là ảnh tổng hợp sinh tại chỗ (không tải mạng).
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadEnvLocal, ROOT } from "../env.mjs";

// Đội trực (mock id thành viên). Trưởng nhà (2) là người nghiệm thu; ca của đội Trưởng nhà để chờ nghiệm thu (không tự nghiệm thu).
const TEAMS = [
  { ids: ["3", "6"], room: "P.1" }, // Hoàng Long + Thanh Phong
  { ids: ["1", "10"], room: "P.4" }, // Minh Tuấn + Tuấn Kiệt
  { ids: ["7", "8"], room: "P.3" }, // Văn Hiếu + Đình Khôi
  { ids: ["2", "5"], room: "P.1" }, // Văn Đức + Quốc Việt
  { ids: ["4", "9"], room: "P.2" }, // Gia Bảo + Anh Khoa
  { ids: ["11", "12"], room: "P.5" }, // Bảo Nam + Hữu Phước
];

const NOTES = {
  KITCHEN: ["Đã rửa sạch bồn, lau bếp gas và bàn ăn, đổ rác bếp.", "Cọ chảo nồi, lau sàn bếp và thay túi rác mới."],
  STAIRS: ["Đã quét và lau cầu thang, lau tay vịn các tầng.", "Lau sạch hành lang T1–T2, gom rác góc cầu thang."],
  BATHROOM: ["Đã cọ sạch sàn WC, lavabo, gương và thay túi rác.", "Cọ bồn cầu, lau gương, bổ sung xà phòng rửa tay."],
  CHAPEL: ["Lau bàn thờ, xếp ghế, hút bụi thảm nguyện đường.", "Thay nến, lau sàn sảnh nguyện, xếp sách kinh ngăn nắp."],
  ROOF: ["Quét sân thượng, gom rác, lau khu máy giặt.", "Dọn sân phơi, đổ rác tái chế, lau bậc lên sân thượng."],
  GATE: ["Quét sân trước, lau cổng và hộp thư.", "Dọn lá cây sân trước, xếp xe gọn gàng."],
  WHOLE_HOUSE: ["Tổng vệ sinh: lau cửa kính, quét mạng nhện, dọn kho.", "Tổng vệ sinh toàn nhà, khuân đồ cũ ra khu tập kết."],
};
const FEEDBACK = ["Rất sạch sẽ, gọn gàng — cảm ơn anh em!", "Đạt chuẩn vệ sinh quy định.", "Sạch, thơm tho, có lau khô sàn.", "Ổn, lần sau nhớ đổ rác sớm hơn chút."];
const COLORS = [
  ["#ede9fe", "#7c3aed"], ["#e0f2fe", "#0369a1"], ["#dcfce7", "#15803d"], ["#fef3c7", "#b45309"], ["#ffe4e6", "#be123c"], ["#f1f5f9", "#475569"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400e3);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400e3).toISOString().slice(0, 10);
const dow = (iso) => (new Date(Date.parse(iso)).getUTCDay() + 6) % 7; // 0 = Thứ Hai
const mod = (n, m) => ((n % m) + m) % m;

async function dHash(buf) {
  const px = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return BigInt.asIntN(64, h).toString();
}

export async function seed(ctx) {
  const { q, ids, mock } = ctx;
  // app.status_reason do các hàm nghiệp vụ đặt với phạm vi transaction — seed chạy MỘT transaction nên phải xóa sau mỗi bước để không "rò" sang nhật ký kế tiếp
  const clearReason = () => q("SELECT set_config('app.status_reason', '', true)");
  const env = loadEnvLocal();
  const storageRoot = path.resolve(ROOT, process.env.STORAGE_DIR || env.STORAGE_DIR || ".local/storage");
  const base = (await q("SELECT app.local_today()::text AS today, date_trunc('week', app.local_today())::date::text AS monday"))[0];
  const today = base.today;
  const thisMonday = base.monday;
  const U = ids.user;
  const M = ids.member;
  const HEAD = U["2"];
  // Người điều phối trực nhật / hậu cần (lập roster, phân loại sự cố, thiết bị): Trưởng nhà — đã bỏ vai trò Phó nhà
  const MANAGER = HEAD;

  const areas = Object.fromEntries((await q("SELECT code, id, name FROM cleaning_areas")).map((r) => [r.code, r]));
  const shifts = Object.fromEntries((await q("SELECT code, id, name FROM duty_shifts")).map((r) => [r.code, r]));
  const rooms = Object.fromEntries((await q("SELECT code, id FROM rooms WHERE deleted_at IS NULL")).map((r) => [r.code, r.id]));
  const year = (await q("SELECT id FROM academic_years WHERE is_current LIMIT 1"))[0]?.id ?? null;

  // ------------------------------------------------------------------
  // 1) Roster 3 tuần
  // ------------------------------------------------------------------
  const weeks = [addDays(thisMonday, -7), thisMonday, addDays(thisMonday, 7)];
  const already = await q("SELECT 1 FROM duty_rosters WHERE week_start = ANY($1::date[])", [weeks]);
  const created = []; // { id, date, area, shift, members: [mockId], room }
  if (!already.length) {
    await ctx.as(MANAGER);
    for (const wk of weeks) {
      const [ro] = await q(
        `INSERT INTO duty_rosters (academic_year_id, week_start, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [year, wk, wk === thisMonday ? "Roster tuần này — đổi ca qua mục Đơn đổi ca, không tự đổi miệng." : null, MANAGER]
      );
      for (let i = 0; i < 7; i++) {
        const date = addDays(wk, i);
        const s = mod(daysBetween(date, today), TEAMS.length);
        const team = (k) => TEAMS[mod(s + k, TEAMS.length)];
        const plan = [];
        if (dow(date) === 5) {
          // Thứ Bảy: tổng vệ sinh toàn nhà (mọi người trừ Trưởng nhà — người nghiệm thu)
          plan.push({ area: "WHOLE_HOUSE", shift: "MORNING", members: Object.keys(M).filter((k) => k !== "2"), room: null });
          plan.push({ area: "KITCHEN", shift: "AFTERNOON", members: team(2).ids, room: team(2).room });
          plan.push({ area: "ROOF", shift: "AFTERNOON", members: team(4).ids, room: team(4).room });
          plan.push({ area: "CHAPEL", shift: "EVENING", members: team(3).ids, room: team(3).room });
        } else {
          plan.push({ area: "BATHROOM", shift: "MORNING", members: team(0).ids, room: team(0).room });
          plan.push({ area: "STAIRS", shift: "MORNING", members: team(1).ids, room: team(1).room });
          plan.push({ area: "KITCHEN", shift: "AFTERNOON", members: team(2).ids, room: team(2).room });
          plan.push({ area: "CHAPEL", shift: "EVENING", members: team(3).ids, room: team(3).room });
          if (dow(date) === 2) plan.push({ area: "ROOF", shift: "AFTERNOON", members: team(4).ids, room: team(4).room });
          if (dow(date) === 6) plan.push({ area: "GATE", shift: "AFTERNOON", members: [team(5).ids[0]], room: team(5).room });
        }
        for (const p of plan) {
          const [a] = await q(
            `INSERT INTO duty_assignments (roster_id, area_id, shift_id, duty_date, room_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [ro.id, areas[p.area].id, shifts[p.shift].id, date, p.room ? rooms[p.room] ?? null : null, MANAGER]
          );
          let k = 0;
          for (const mid of p.members) {
            await q(
              `INSERT INTO duty_assignment_members (assignment_id, duty_date, shift_id, member_id, member_role, added_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [a.id, date, shifts[p.shift].id, M[mid], k++ === 0 ? "lead" : "member", MANAGER]
            );
          }
          created.push({ id: a.id, date, area: p.area, shift: p.shift, members: p.members });
        }
      }
      await q("SELECT app.fn_publish_roster($1)", [ro.id]);
    }

    // ------------------------------------------------------------------
    // 2) Check-in + nghiệm thu cho các ngày đã qua
    // ------------------------------------------------------------------
    const special = new Map(); // key = `${k}:${area}` → outcome
    special.set("-1:KITCHEN", "rework");
    special.set("-1:STAIRS", "pending");
    special.set("-1:CHAPEL", "pending");
    special.set("-2:STAIRS", "missed");
    special.set("-1:WHOLE_HOUSE", "pending");

    await q("ALTER TABLE duty_checkins DISABLE TRIGGER trg_duty_checkins__rules");
    let n = 0;
    for (const a of created) {
      const k = daysBetween(a.date, today);
      if (k > 0) continue;
      const win = (
        await q("SELECT lower(app.shift_window($1::date, $2::uuid)) AS s, upper(app.shift_window($1::date, $2::uuid)) AS e, upper(app.shift_window($1::date, $2::uuid)) < now() AS ended", [
          a.date,
          shifts[a.shift].id,
        ])
      )[0];
      // Ca của hôm nay: chỉ những ca đã kết thúc mới có check-in (chờ nghiệm thu); ca chưa tới để người dùng tự check-in
      if (k === 0 && !win.ended) continue;
      const outcome = special.get(`${k}:${a.area}`) ?? (k === 0 ? "pending" : "approved");
      if (outcome === "missed") continue;
      const checker = a.members[n % a.members.length];
      const checkerUser = U[checker];
      const checkedAt = new Date(new Date(win.s).getTime() + (25 + ((n * 7) % 30)) * 60e3);

      // Ảnh minh chứng tổng hợp (duy nhất cho mỗi lần check-in)
      const [c1, c2] = COLORS[n % COLORS.length];
      const areaName = areas[a.area].name;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
        <rect width="480" height="360" fill="url(#g)"/>
        <circle cx="${300 + (n * 37) % 150}" cy="${40 + (n * 53) % 140}" r="${30 + (n % 5) * 10}" fill="#ffffff" opacity="0.35"/>
        <rect x="${20 + (n * 29) % 200}" y="${30 + (n * 17) % 120}" width="${60 + (n % 4) * 20}" height="${40 + (n % 3) * 15}" rx="10" fill="#ffffff" opacity="0.25"/>
        <rect x="30" y="250" width="420" height="80" rx="16" fill="#ffffff" opacity="0.88"/>
        <text x="50" y="285" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#1f2937">${esc(areaName)} · ${esc(shifts[a.shift].name)}</text>
        <text x="50" y="314" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#4b5563">Ảnh minh chứng (dữ liệu mẫu) · ${a.date.split("-").reverse().join("/")} · #${n + 1}</text>
      </svg>`;
      const body = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
      const thumb = await sharp(body).resize({ width: 360, height: 360, fit: "inside" }).webp({ quality: 80 }).toBuffer();
      const [{ id: fileId }] = await q("SELECT app.uuid_v7() AS id");
      const ym = checkedAt.toISOString().slice(0, 7).split("-");
      const key = `cleaning-evidence/${ym[0]}/${ym[1]}/${fileId}.jpg`;
      const thumbKey = `cleaning-evidence/${ym[0]}/${ym[1]}/${fileId}.thumb.webp`;
      await mkdir(path.dirname(path.join(storageRoot, key)), { recursive: true });
      await writeFile(path.join(storageRoot, key), body);
      await writeFile(path.join(storageRoot, thumbKey), thumb);
      await q(
        `INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, detected_mime, size_bytes, sha256, phash,
                                    width_px, height_px, exif_stripped, status, scan_status, variants, uploaded_by, created_at)
         VALUES ($1, 'cleaning-evidence', $2, $3, 'image/jpeg', 'image/jpeg', $4, $5, $6::bigint, 480, 360, true, 'ready', 'skipped', $7::jsonb, $8, $9)`,
        [fileId, key, `minh-chung-${a.area.toLowerCase()}.jpg`, body.length, createHash("sha256").update(body).digest("hex"), await dHash(body),
          JSON.stringify({ thumb: thumbKey }), checkerUser, checkedAt]
      );

      await ctx.as(checkerUser);
      const [{ id: ckId }] = await q("SELECT app.uuid_v7() AS id");
      await q(
        `INSERT INTO duty_checkins (id, assignment_id, attempt, checked_in_by_member_id, checked_in_at, evidence_file_id, is_late, late_minutes, note, created_at)
         VALUES ($1, $2, 1, $3, $4, $5, false, NULL, $6, $4)`,
        [ckId, a.id, M[checker], checkedAt, fileId, NOTES[a.area][n % 2]]
      );
      await q(
        `INSERT INTO checkin_items (checkin_id, template_item_id, is_done)
         SELECT $1, it.id, true FROM checklist_template_items it JOIN duty_assignments x ON x.checklist_template_id = it.template_id WHERE x.id = $2`,
        [ckId, a.id]
      );
      await q(
        `INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by, created_at)
         VALUES ($1, 'duty_checkin', $2, 'evidence', $3, $4)`,
        [fileId, ckId, checkerUser, checkedAt]
      );

      // Người nghiệm thu: Trưởng nhà (duy nhất có duty.review sau khi bỏ vai trò Phó nhà). Ca có chính Trưởng nhà trực thì
      // không ai khác được nghiệm thu (BR-DUTY-02) ⇒ để ở trạng thái chờ nghiệm thu.
      if ((outcome === "approved" || outcome === "rework") && !a.members.includes("2")) {
        const reviewerMock = "2";
        await ctx.as(U[reviewerMock]);
        const reviewedAt = new Date(checkedAt.getTime() + (30 + (n % 4) * 20) * 60e3);
        if (outcome === "approved") {
          await q(
            `INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score, feedback, reviewed_at) VALUES ($1, $2, 'approved', $3, $4, $5)`,
            [ckId, M[reviewerMock], 4 + (n % 2), FEEDBACK[n % FEEDBACK.length], reviewedAt]
          );
        } else {
          await q(
            `INSERT INTO duty_reviews (checkin_id, reviewer_member_id, decision, score, feedback, reviewed_at) VALUES ($1, $2, 'rework', 2, $3, $4)`,
            [ckId, M[reviewerMock], "Bồn rửa còn dầu mỡ, sàn bếp chưa lau khô — anh em dọn lại và chụp ảnh mới giúp nhé.", reviewedAt]
          );
        }
        await clearReason();
      }
      n++;
    }
    // Kiểm ngay BR-DUTY-09 (đủ tiêu chí) cho các lượt vừa chèn rồi mới bật lại trigger (ALTER TABLE không chạy khi còn sự kiện trigger chờ)
    await q("SET CONSTRAINTS trg_duty_checkins__required_items IMMEDIATE");
    await q("ALTER TABLE duty_checkins ENABLE TRIGGER trg_duty_checkins__rules");
    await q("SET CONSTRAINTS trg_duty_checkins__required_items DEFERRED");

    // Ca quá hạn không check-in ⇒ bỏ ca (đúng tiến trình nền của thiết kế)
    await ctx.as(null);
    await q("SELECT app.fn_mark_missed_duties()");
    await clearReason();

    // ------------------------------------------------------------------
    // 3) Đơn đổi ca: một đơn chờ người nhận, một đơn chờ người quản lý duyệt
    // ------------------------------------------------------------------
    const memberOf = (mockId) => created.filter((c) => c.members.includes(mockId));
    const busyAt = (mockId, date, shift) => created.some((c) => c.date === date && c.shift === shift && c.members.includes(mockId));
    const future = (c) => daysBetween(c.date, today) >= 2;
    // (a) Văn Hiếu nhờ Anh Khoa (chờ người nhận)
    const s1 = memberOf("7").find((c) => future(c) && c.area !== "WHOLE_HOUSE" && !busyAt("9", c.date, c.shift));
    if (s1) {
      await ctx.as(U["7"]);
      await q("SELECT app.fn_request_duty_swap($1, $2, $3)", [s1.id, M["9"], "Trùng lịch thi giữa kỳ môn Kết cấu thép, nhờ anh Khoa trực giúp."]);
    }
    // (b) Gia Bảo nhờ Bảo Nam, Bảo Nam đã đồng ý (chờ Trưởng nhà duyệt)
    const s2 = memberOf("4").find((c) => daysBetween(c.date, today) >= 3 && c.area !== "WHOLE_HOUSE" && !busyAt("11", c.date, c.shift));
    if (s2) {
      await ctx.as(U["4"]);
      const [{ id: swapId }] = await q("SELECT app.fn_request_duty_swap($1, $2, $3) AS id", [s2.id, M["11"], "Đi thực tập ở công trường Bắc Ninh cả ngày, xin đổi ca."]);
      await ctx.as(U["11"]);
      await q("SELECT app.fn_peer_respond_duty_swap($1, true, $2)", [swapId, "Mình trực thay được."]);
      await clearReason();
    }
  }

  // ------------------------------------------------------------------
  // 4) Sự cố (INITIAL_ISSUES + một sự cố máy giặt)
  // ------------------------------------------------------------------
  if (!(await q("SELECT 1 FROM maintenance_issues LIMIT 1")).length) {
    const byName = (s) => {
      const name = String(s || "").replace(/\s*\(.*\)\s*$/, "").trim();
      return ids.memberByName[name] ?? ids.memberByFullName[name] ?? null;
    };
    const userOfMember = Object.fromEntries(Object.entries(M).map(([k, v]) => [v, U[k]]));
    const cat = Object.fromEntries((await q("SELECT code, id FROM categories WHERE kind = 'maintenance'")).map((r) => [r.code, r.id]));
    const STATUS = { "Mới tiếp nhận": "new", "Đang xử lý": "in_progress", "Đã xong": "done" };
    const EXTRA = {
      "LOG-108": { urgency: "high", category: "MAINT_ELEC", room: null, ageH: 3, reporter: M["11"], assignee: null },
      "LOG-107": { urgency: "medium", category: "MAINT_WATER", room: "P.WC_NGOAI", ageH: 26, reporter: null, assignee: M["7"] },
      "LOG-105": { urgency: "low", category: "MAINT_DOOR", room: "P.4", ageH: 52, reporter: null, assignee: M["3"] },
    };
    const list = [
      ...(mock.INITIAL_ISSUES ?? []),
      {
        id: "LOG-109",
        title: "Máy giặt Electrolux rung mạnh, kêu to khi vắt",
        location: "Sân thượng & khu giặt phơi",
        reportedBy: "Hữu Phước",
        status: "Đang xử lý",
        description: "Máy rung lắc và kêu lạch cạch ở chế độ vắt, có thể lệch chân đế hoặc mòn giảm xóc. Tạm dùng máy Aqua.",
        assignee: "Hoàng Long",
      },
    ];
    for (const it of list) {
      const no = Number(String(it.id).replace(/\D/g, "")) || null;
      const ex = EXTRA[it.id] ?? { urgency: "medium", category: "MAINT_APP", room: null, ageH: 8, reporter: null, assignee: byName(it.assignee) };
      const reporter = ex.reporter ?? byName(it.reportedBy) ?? M["11"];
      const status = STATUS[it.status] ?? "new";
      const loc = ex.room ? null : it.location;
      await clearReason();
      await ctx.as(userOfMember[reporter]);
      const [row] = await q(
        `INSERT INTO maintenance_issues (issue_no, title, category_id, location_room_id, location_text, reporter_member_id, description, urgency, created_at)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::urgency_t, now() - make_interval(hours => $9)) RETURNING id`,
        [no, it.title, cat[ex.category] ?? null, ex.room ? rooms[ex.room] ?? null : null, ex.room ? (it.location ?? null) : loc, reporter, it.description, ex.urgency, ex.ageH]
      );
      await ctx.as(MANAGER);
      if (it.cost) {
        await q(`INSERT INTO repair_costs (issue_id, cost_kind, amount_vnd, description, created_by) VALUES ($1, 'estimate', $2, $3, $4)`, [
          row.id, it.cost, status === "done" ? "Bộ bản lề cối inox thay mới" : "Bóng LED tuýp 1m2 + tăng phô", MANAGER,
        ]);
      }
      const assignee = ex.assignee ?? byName(it.assignee);
      if (assignee && status !== "new") {
        const note = it.id === "LOG-107" ? "Đã khảo sát, đang ra tiệm điện nước mua gioăng cao su 21mm" : it.id === "LOG-109" ? "Đã gọi thợ, chờ giảm xóc thay thế" : null;
        await q(`INSERT INTO issue_assignments (issue_id, assignee_member_id, role_label, note, assigned_by) VALUES ($1, $2, 'lead', $3, $4)`, [row.id, assignee, note, MANAGER]);
      }
      if (status !== "new") {
        await q("SELECT set_config('app.status_reason', $1, true)", ["Đã tiếp nhận và phân công xử lý"]);
        await q("UPDATE maintenance_issues SET status = 'in_progress' WHERE id = $1", [row.id]);
      }
      if (it.id === "LOG-109") {
        await q("SELECT set_config('app.status_reason', $1, true)", ["Chờ giảm xóc thay thế"]);
        await q("UPDATE maintenance_issues SET status = 'waiting_parts' WHERE id = $1", [row.id]);
      }
      if (status === "done") {
        await q("SELECT set_config('app.status_reason', $1, true)", ["Đã thay bản lề mới, cửa đóng kín"]);
        await q("UPDATE maintenance_issues SET status = 'done' WHERE id = $1", [row.id]);
        await ctx.as(userOfMember[reporter]);
        await q("SELECT app.fn_verify_issue($1)", [row.id]);
      }
      await q("SELECT set_config('app.status_reason', '', true)");
    }
    await q("SELECT setval(pg_get_serial_sequence('maintenance_issues', 'issue_no'), (SELECT max(issue_no) FROM maintenance_issues))");
  }

  // ------------------------------------------------------------------
  // 5) Lượt giặt sắp tới (trigger không cho đặt lượt đã qua)
  // ------------------------------------------------------------------
  if (!(await q("SELECT 1 FROM laundry_bookings LIMIT 1")).length) {
    const machines = Object.fromEntries((await q("SELECT code, id FROM laundry_machines")).map((r) => [r.code, r.id]));
    const slots = (await q("SELECT app.setting_json('laundry.slots') AS s"))[0].s;
    const wanted = [
      { day: 0, slot: 5, machine: "AQUA9", who: "12" },
      { day: 0, slot: 6, machine: "ELX", who: "4" },
      { day: 1, slot: 0, machine: "AQUA9", who: "8" },
      { day: 1, slot: 6, machine: "AQUA9", who: "1" },
      { day: 2, slot: 4, machine: "ELX", who: "9" },
      { day: 2, slot: 5, machine: "AQUA9", who: "7" },
      { day: 3, slot: 1, machine: "AQUA9", who: "11" },
      { day: 4, slot: 6, machine: "ELX", who: "10" },
      { day: 5, slot: 3, machine: "AQUA9", who: "3" },
    ];
    for (const w of wanted) {
      const date = addDays(today, w.day);
      const [s, e] = slots[w.slot];
      const ok = (await q("SELECT ($1::date + $2::time) AT TIME ZONE 'Asia/Ho_Chi_Minh' > now() + interval '40 minutes' AS ok", [date, s]))[0].ok;
      if (!ok) continue;
      await ctx.as(U[w.who]);
      await q(
        `INSERT INTO laundry_bookings (machine_id, member_id, starts_at, ends_at)
         VALUES ($1, $2, ($3::date + $4::time) AT TIME ZONE 'Asia/Ho_Chi_Minh', ($3::date + $5::time) AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
        [machines[w.machine], M[w.who], date, s, e]
      );
    }
  }

  // ------------------------------------------------------------------
  // 6) Thiết bị dùng chung + một lượt mượn đang mở
  // ------------------------------------------------------------------
  if (!(await q("SELECT 1 FROM assets LIMIT 1")).length) {
    await ctx.as(MANAGER);
    const ASSETS = [
      ["AV-001", "Máy chiếu Full HD Epson", "audio_visual", "P.SANH1", "Tủ thiết bị phòng sinh hoạt", 6500000],
      ["DC-001", "Máy khoan cầm tay & bộ mũi khoan", "tool", null, "Tủ đồ nghề tầng 1", 1200000],
      ["DC-002", "Thang nhôm rút 3.8m", "tool", null, "Gầm cầu thang tầng 1", 1650000],
      ["DI-001", "Ổ cắm dài 10m chịu tải", "electrical", "P.SANH1", "Kệ cạnh tivi", 280000],
      ["AV-002", "Loa kéo bluetooth & 2 micro", "audio_visual", "P.SANH2", "Góc phải sảnh nguyện", 3200000],
      ["DC-003", "Bộ tua vít & kìm đa năng", "tool", null, "Tủ đồ nghề tầng 1", 350000],
    ];
    const assetIds = {};
    for (const [tag, name, type, room, loc, cost] of ASSETS) {
      const [a] = await q(
        `INSERT INTO assets (asset_tag, name, asset_type, room_id, location_text, status, purchase_cost_vnd, is_loanable, created_by)
         VALUES ($1, $2, $3, $4, $5, 'in_service', $6, true, $7) RETURNING id`,
        [tag, name, type, room ? rooms[room] ?? null : null, loc, cost, MANAGER]
      );
      assetIds[tag] = a.id;
    }
    // Văn Đức đang mượn máy khoan (hạn trả 18:00 hôm nay theo giờ VN, nếu đã qua thì ngày mai)
    await ctx.as(HEAD);
    await q(
      `INSERT INTO asset_loans (asset_id, borrower_member_id, borrowed_at, due_at, checked_out_by)
       VALUES ($1, $2, now() - interval '2 hours',
               CASE WHEN (app.local_today() + time '18:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' > now()
                    THEN (app.local_today() + time '18:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                    ELSE (app.local_today() + 1 + time '18:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END, $3)`,
      [assetIds["DC-001"], M["2"], HEAD]
    );
  }
  await ctx.as(HEAD);
}
