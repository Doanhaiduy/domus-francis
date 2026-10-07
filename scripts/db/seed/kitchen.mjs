// Seed phân hệ Bếp & Cơm: bật cờ feature.meals.enabled, thực đơn 2 tuần (tuần này + tuần sau) kèm người trực bếp,
// đăng ký suất các ngày đã qua của tuần + hôm nay + ngày mai, kho bếp, yêu cầu mua thêm, danh sách cần mua,
// một khảo sát món có phiếu bầu và vài góp ý bữa ăn. Mọi ngày tính theo "hôm nay" giờ VN lúc chạy seed.
// Nguồn món ăn / cặp trực: WEEKLY_MENUS cài cứng của giao diện cũ (src/app/bep-com/page.tsx).

// Tuần này (T2 → CN): [người trực chính, người phụ], món trưa, món tối
const WEEK_A = [
  { cooks: ["Gia Bảo", "Văn Đức"], lunch: ["Thịt ba chỉ luộc cà pháo", "Canh cua mồng tơi", "Đậu sốt cà chua"], dinner: ["Cá nục kho dứa", "Rau cải thìa xào tỏi", "Trứng chiên hành"] },
  { cooks: ["Quốc Việt", "Hoàng Long"], lunch: ["Sườn xào chua ngọt", "Canh rau ngót nấu thịt băm", "Bắp cải luộc chấm trứng"], dinner: ["Gà rang gừng sả", "Canh mướp nấu tôm khô", "Đậu phụ rán giòn"] },
  { cooks: ["Thanh Phong", "Văn Hiếu"], lunch: ["Bún bò Huế giò heo", "Rau sống bắp chuối", "Chả lụa chiên"], dinner: ["Thịt băm xào nấm rơm", "Canh bí đỏ hầm xương", "Rau muống luộc"] },
  { cooks: ["Đình Khôi", "Minh Tuấn"], lunch: ["Thịt kho trứng cút", "Canh bí đao sườn", "Đậu rán tẩm hành", "Dưa chuột bóp xổi"], dinner: ["Canh chua cá lóc Nam Bộ", "Rau muống xào tỏi", "Trứng chiên hành hoa"] },
  { cooks: ["Anh Khoa", "Tuấn Kiệt"], lunch: ["Cá thu Nhật sốt cà", "Canh rau đay tép đồng", "Lạc rang muối"], dinner: ["Thịt rang cháy cạnh", "Canh mồng tơi riêu cua", "Cà muối chua giòn"] },
  { cooks: ["Bảo Nam", "Hữu Phước"], lunch: ["Thịt vịt kho gừng", "Canh bầu nấu tôm", "Đậu xào thịt bò"], dinner: ["Lẩu gà lá giang", "Bún tươi & rau muống", "Chả cá thác lác"] },
  { cooks: ["Đình Khôi", "Gia Bảo"], lunch: ["Bò né sốt tiêu đen", "Cơm chiên Dương Châu", "Tráng miệng trái cây"], dinner: ["Cháo sườn bách thảo", "Rau củ luộc kho quẹt"], feast: true },
];
// Tuần sau
const WEEK_B = [
  { cooks: ["Minh Tuấn", "Văn Hiếu"], lunch: ["Gà kho gừng", "Canh cải xanh nấu tôm", "Đậu phụ sốt cà"], dinner: ["Cá basa chiên giòn", "Canh chua bắp cải", "Rau lang luộc"] },
  { cooks: ["Tuấn Kiệt", "Bảo Nam"], lunch: ["Thịt heo quay", "Canh khoai mỡ", "Dưa cải muối"], dinner: ["Mực xào cần tỏi", "Canh rau dền", "Trứng hấp vân"] },
  { cooks: ["Hữu Phước", "Anh Khoa"], lunch: ["Bún chả Hà Nội", "Nộm su hào cà rốt"], dinner: ["Sườn ram mặn", "Canh bí xanh", "Cải ngồng xào tỏi"] },
  { cooks: ["Văn Đức", "Thanh Phong"], lunch: ["Cá rô kho tộ", "Canh cua rau đay", "Cà pháo muối"], dinner: ["Thịt bò xào thiên lý", "Canh mồng tơi", "Đậu bắp luộc"] },
  { cooks: ["Hoàng Long", "Quốc Việt"], lunch: ["Thịt gà luộc lá chanh", "Canh măng chua", "Xôi trắng"], dinner: ["Đậu hũ nhồi thịt sốt cà", "Canh rau ngót", "Rau muống xào tỏi"] },
  { cooks: ["Gia Bảo", "Minh Tuấn"], lunch: ["Phở gà", "Quẩy giòn"], dinner: ["Cá kho riềng", "Canh chua cá", "Su su luộc"] },
  { cooks: ["Đình Khôi", "Văn Hiếu"], lunch: ["Lẩu thái hải sản", "Bún tươi", "Rau nhúng"], dinner: ["Cơm rang dưa bò", "Canh rong biển"] },
];

const PANTRY = [
  { name: "Gạo thơm ST25", unit: "kg", qty: 16, par: 25, icon: "🌾" },
  { name: "Dầu ăn Simply 5L", unit: "bình", qty: 1, par: 2, icon: "🍾" },
  { name: "Nước mắm Nam Ngư 750ml", unit: "chai", qty: 4, par: 4, icon: "🧂" },
  { name: "Hạt nêm Knorr 900g", unit: "gói", qty: 2, par: 2, icon: "📦" },
  { name: "Trứng gà công nghiệp", unit: "quả", qty: 8, par: 30, icon: "🥚" },
  { name: "Đường cát trắng 1kg", unit: "gói", qty: 2, par: 2, icon: "🍚" },
  { name: "Nước rửa chén Sunlight 3.8kg", unit: "can", qty: 1, par: 1, icon: "🧴" },
  { name: "Muối i-ốt", unit: "gói", qty: 1, par: 3, icon: "🧂" },
  { name: "Mì chính Ajinomoto", unit: "kg", qty: 0.5, par: 1, icon: "🥢" },
];

/** Bảng băm nhỏ, tất định: cùng (ngày, bữa, người) luôn cho cùng kết quả. */
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function seed(ctx) {
  const { q, ids, mock } = ctx;
  const existing = (await q("SELECT (SELECT count(*) FROM pantry_items)::int AS p, (SELECT count(*) FROM meal_menus)::int AS m"))[0];
  if (existing.p > 0 || existing.m > 0) {
    console.log("    (bỏ qua seed kitchen: đã có dữ liệu bếp)");
    return;
  }
  const userOf = {}; // tên hiển thị → users.id
  for (const m of mock.INITIAL_MEMBERS) userOf[m.name] = ids.user[m.id];
  const memberOf = (name) => {
    const id = ids.memberByName[name];
    if (!id) throw new Error(`seed kitchen: không thấy thành viên "${name}"`);
    return id;
  };
  const lead = userOf["Đình Khôi"] ?? ids.userByRole.kitchen_lead;
  const head = ids.userByRole.house_head;

  // 1) người quản lý bật lại phân hệ (khóa feature.meals.enabled cần setting.write)
  await ctx.as(head);
  await q("UPDATE settings SET value = 'true'::jsonb, updated_by = $1 WHERE key = 'feature.meals.enabled'", [head]);

  const d = (await q(
    "SELECT app.local_today()::text AS today, date_trunc('week', app.local_today())::date::text AS wk, to_char(app.local_today(), 'MM-DD') AS md"
  ))[0];
  const addDays = (iso, n) => {
    const t = new Date(`${iso}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const tomorrow = addDays(d.today, 1);

  // 2) Thực đơn + người trực (Trưởng ban Ẩm thực lập)
  await ctx.as(lead);
  const menus = []; // { id, date, meal }
  for (let i = 0; i < 14; i++) {
    const date = addDays(d.wk, i);
    const plan = (i < 7 ? WEEK_A : WEEK_B)[i % 7];
    const feast = date.slice(5) === "10-04";
    for (const meal of ["lunch", "dinner"]) {
      const status = date < d.today ? "served" : "open";
      const title = feast && meal === "lunch" ? "Tiệc Lễ Bổn Mạng Thánh Phanxicô" : plan.feast && meal === "lunch" ? "Cơm Chúa Nhật cộng đoàn" : null;
      const cost = feast && meal === "lunch" ? 40000 : null;
      const r = await q(
        `INSERT INTO meal_menus (menu_date, meal_type, title, dishes, cost_per_serving_vnd, cutoff_at, status, approved_by, created_by)
         VALUES ($1::date, $2::meal_type_t, $3, $4, $5, app.fn_meal_default_cutoff($1::date, $2::meal_type_t), $6, $7, $7) RETURNING id`,
        [date, meal, title, plan[meal], cost, status, lead]
      );
      const id = r[0].id;
      menus.push({ id, date, meal });
      const [main, sub] = plan.cooks;
      await q("INSERT INTO meal_menu_cooks (menu_id, member_id, role_label) VALUES ($1, $2, 'lead'), ($1, $3, 'assistant')", [id, memberOf(main), memberOf(sub)]);
    }
  }

  // 3) Đăng ký suất: các ngày đã qua của tuần + hôm nay + ngày mai — hầu hết anh em ăn, vài người báo vắng / chưa đăng ký
  const people = mock.INITIAL_MEMBERS.map((m) => ({ name: m.name, member: ids.member[m.id], user: ids.user[m.id] }));
  for (const mn of menus) {
    if (mn.date > tomorrow) continue;
    const future = mn.date >= tomorrow;
    for (const p of people) {
      const h = hash(`${mn.date}|${mn.meal}|${p.name}`) % 12;
      if (future && h === 0) continue; // chưa đăng ký
      const willEat = h > 1; // ~1/6 báo vắng
      // Ngày mai: anh em tự đăng ký (trước giờ chốt); ngày đã qua/hôm nay: Ban Ẩm thực chốt sổ hộ
      await ctx.as(future ? p.user : lead);
      await q(
        "INSERT INTO meal_registrations (menu_id, member_id, will_eat, guests, note) VALUES ($1, $2, $3, $4, $5)",
        [mn.id, p.member, willEat, willEat && h === 11 && mn.meal === "dinner" ? 1 : 0, willEat ? null : "Có lịch học / đi lễ"]
      );
    }
  }
  // Vài người đăng ký sớm cho các ngày còn lại của tuần sau
  for (const mn of menus.filter((x) => x.date > tomorrow)) {
    for (const p of people.slice(0, 5)) {
      if (hash(`${mn.date}${mn.meal}${p.name}`) % 3 === 0) continue;
      await ctx.as(p.user);
      await q("INSERT INTO meal_registrations (menu_id, member_id, will_eat) VALUES ($1, $2, true)", [mn.id, p.member]);
    }
  }

  // 4) Kho bếp
  await ctx.as(lead);
  const pantry = {};
  for (const it of PANTRY) {
    const r = await q(
      "INSERT INTO pantry_items (name, unit, qty_on_hand, par_level, icon, last_restocked_on) VALUES ($1, $2, $3, $4, $5, $6::date) RETURNING id",
      [it.name, it.unit, it.qty, it.par, it.icon, addDays(d.today, -6)]
    );
    pantry[it.name] = r[0].id;
  }

  // 5) Yêu cầu mua thêm (thành viên đề xuất) + xử lý của Ban Ẩm thực
  await ctx.as(userOf["Minh Tuấn"]);
  await q("INSERT INTO pantry_restock_requests (pantry_item_id, item_name, qty, note, requested_by) VALUES ($1, '', 2, 'Bình dầu ăn còn chưa tới nửa', $2)",
    [pantry["Dầu ăn Simply 5L"], memberOf("Minh Tuấn")]);
  await ctx.as(userOf["Tuấn Kiệt"]);
  await q("INSERT INTO pantry_restock_requests (item_name, qty, unit, note, requested_by) VALUES ('Tương ớt Chinsu', 2, 'chai', 'Anh em hay ăn kèm trứng chiên', $1)",
    [memberOf("Tuấn Kiệt")]);
  await ctx.as(userOf["Văn Hiếu"]);
  const eggReq = (await q("INSERT INTO pantry_restock_requests (pantry_item_id, item_name, qty, note, requested_by) VALUES ($1, '', 30, 'Sắp hết trứng cho bữa sáng', $2) RETURNING id",
    [pantry["Trứng gà công nghiệp"], memberOf("Văn Hiếu")]))[0].id;
  await ctx.as(userOf["Bảo Nam"]);
  const riceReq = (await q("INSERT INTO pantry_restock_requests (pantry_item_id, item_name, qty, requested_by) VALUES ($1, '', 10, $2) RETURNING id",
    [pantry["Gạo thơm ST25"], memberOf("Bảo Nam")]))[0].id;
  await ctx.as(userOf["Hữu Phước"]);
  const sauceReq = (await q("INSERT INTO pantry_restock_requests (item_name, qty, unit, note, requested_by) VALUES ('Sa tế tôm', 1, 'hũ', NULL, $1) RETURNING id",
    [memberOf("Hữu Phước")]))[0].id;

  await ctx.as(lead);
  await q("UPDATE pantry_restock_requests SET status = 'approved', resolution_note = 'Đã đưa vào danh sách đi chợ sáng mai' WHERE id = ANY($1::uuid[])", [[eggReq, riceReq]]);
  await q("UPDATE pantry_restock_requests SET status = 'rejected', resolution_note = 'Kho còn 1 hũ sa tế ở tủ trên' WHERE id = $1", [sauceReq]);

  // 6) Danh sách cần mua (gạo đã mua hôm qua ⇒ trigger cộng 10 kg vào kho và đóng yêu cầu)
  await q(
    `INSERT INTO shopping_list_items (name, qty, unit, pantry_item_id, restock_request_id, needed_on, est_cost_vnd, note) VALUES
       ('', 30, 'quả', $1, $2, $3::date, 105000, 'Mua ở chợ Triều Khúc'),
       ('Rau muống', 3, 'bó', NULL, NULL, $3::date, 30000, NULL),
       ('Thịt ba chỉ', 2, 'kg', NULL, NULL, $3::date, 260000, 'Cho bữa trưa thứ Hai')`,
    [pantry["Trứng gà công nghiệp"], eggReq, tomorrow]
  );
  await q(
    "INSERT INTO shopping_list_items (name, qty, unit, pantry_item_id, restock_request_id, needed_on, est_cost_vnd, is_purchased) VALUES ('', 10, 'kg', $1, $2, $3::date, 230000, true)",
    [pantry["Gạo thơm ST25"], riceReq, addDays(d.today, -1)]
  );

  // 7) Khảo sát món tuần sau + phiếu bầu
  const nextMonday = addDays(d.wk, 7);
  const survey = (await q(
    `INSERT INTO meal_surveys (title, description, max_choices, allow_suggestions, target_week, closes_at, created_by)
     VALUES ('Món mặn anh em muốn ăn tuần sau?', 'Ban Ẩm thực lên thực đơn tuần sau theo kết quả bình chọn.', 2, true, $1::date, now() + interval '3 days', $2) RETURNING id`,
    [nextMonday, lead]
  ))[0].id;
  const opts = {};
  let order = 0;
  for (const label of ["Gà kho gừng", "Cá basa chiên xù", "Bò xào thiên lý", "Sườn ram mặn"]) {
    opts[label] = (await q("INSERT INTO meal_survey_options (survey_id, label, sort_order) VALUES ($1, $2, $3) RETURNING id", [survey, label, order++]))[0].id;
  }
  await ctx.as(userOf["Minh Tuấn"]);
  opts["Đậu hũ nhồi thịt sốt cà"] = (await q(
    "INSERT INTO meal_survey_options (survey_id, label, sort_order, suggested_by) VALUES ($1, 'Đậu hũ nhồi thịt sốt cà', 10, $2) RETURNING id",
    [survey, memberOf("Minh Tuấn")]
  ))[0].id;
  const labels = Object.keys(opts);
  for (const p of people.slice(0, 10)) {
    await ctx.as(p.user);
    const h = hash(p.name);
    const picks = new Set([labels[h % labels.length], labels[(h >>> 3) % labels.length]]);
    for (const l of picks) await q("INSERT INTO meal_survey_votes (survey_id, option_id, member_id) VALUES ($1, $2, $3)", [survey, opts[l], p.member]);
  }

  // 8) Góp ý bữa ăn (các bữa đã qua trong tuần)
  const comments = ["Canh rất vừa miệng, cảm ơn anh em trực bếp!", "Món kho hơi mặn một chút.", "Cơm hôm nay ngon, nhiều rau.", null, "Nên thêm chút ớt cho món xào.", null];
  const past = menus.filter((m) => m.date < d.today).slice(-6);
  for (const mn of past) {
    for (const p of people) {
      const h = hash(`fb|${mn.id}|${p.name}`);
      if (h % 3 !== 0) continue;
      await ctx.as(p.user);
      await q("INSERT INTO meal_feedback (menu_id, member_id, rating, comment) VALUES ($1, $2, $3, $4)", [mn.id, p.member, 3 + (h % 3), comments[h % comments.length]]);
    }
  }
  await ctx.as(head);
}
