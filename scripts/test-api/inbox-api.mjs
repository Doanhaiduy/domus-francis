// Kiểm thử HỘP "VIỆC CẦN XỬ LÝ" (GET /api/v1/inbox — src/server/modules/inbox.ts, db/app/1044):
//   • thành viên thường: eligible = false, không có mục nào; người có quyền chỉ thấy loại việc của quyền mình
//   • đếm đúng theo quyền + dưới RLS, MỘT vòng DB; việc quá hạn ⇒ urgent + overdue; href trỏ đúng trang/tab xử lý
//   • đơn xin phép / phiếu chi của CHÍNH MÌNH không tính vào việc của mình (không ai tự duyệt); phiếu chi chỉ tính khi người xem còn ký được
//     (khớp nút "Duyệt" của trang Thu chi)
//   • Thủ quỹ: báo đã đóng quỹ, giao dịch ngân hàng chưa khớp, ủng hộ chờ xác nhận; sự cố, hình phạt quá hạn, góp ý, yêu cầu dữ liệu, check-in lễ,
//     đăng ký tìm hiểu
// Dữ liệu thử có hậu tố duy nhất và được dọn ở cuối (chạy lại được trên DB đã từng chạy).
import pg from "pg";

export async function run({ as, test, eq, ok, section, Client, pgConfig }) {
  section("Hộp “Việc cần xử lý” — GET /api/v1/inbox");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const tag = `inbox-${Date.now().toString(36)}`;
  const head = await as("duc.tran@luuxa.local"); // Trưởng nhà
  const treasurer = await as("bao.pham@luuxa.local"); // Thủ quỹ
  const admin = await as("viet.vu@luuxa.local");
  const member = await as("tuan.nguyen@luuxa.local");
  const liturgy = await as("phong.dang@luuxa.local"); // Trưởng ban Phụng vụ
  const meOf = async (c) => (await c.get("/api/v1/auth/me")).json.member;
  const memberMe = await meOf(member);
  const headMe = await meOf(head);
  const otherMe = await meOf(await as("hieu.bui@luuxa.local"));

  const inbox = async (c) => {
    const r = await c.get("/api/v1/inbox");
    eq(r.status, 200, JSON.stringify(r.json));
    return r.json;
  };
  const item = (box, kind) => box.items.find((i) => i.kind === kind) ?? null;
  const countOf = (box, kind) => item(box, kind)?.count ?? 0;
  const cleanups = [];

  try {
    await test("Chưa đăng nhập → 401; thành viên thường: eligible = false, total = 0, không có mục nào", async () => {
      const anon = await new Client("anon-inbox").init();
      eq((await anon.get("/api/v1/inbox")).status, 401);
      const box = await inbox(member);
      eq(box.eligible, false);
      eq(box.total, 0);
      eq(box.items.length, 0);
      ok(typeof box.generatedAt === "string", "thiếu generatedAt");
    });

    await test("Trưởng ban Phụng vụ: eligible = true, chỉ có loại việc check-in đi lễ; Trưởng nhà / Thủ quỹ / Admin: eligible = true", async () => {
      const lit = await inbox(liturgy);
      eq(lit.eligible, true);
      ok(lit.items.every((i) => i.kind === "mass_checkin"), `loại việc lạ: ${lit.items.map((i) => i.kind)}`);
      for (const c of [head, treasurer, admin]) eq((await inbox(c)).eligible, true);
      // Thủ quỹ không có quyền duyệt đơn xin phép / sự cố / hình phạt
      const t = await inbox(treasurer);
      ok(!t.items.some((i) => ["leave", "issue", "discipline_overdue", "feedback", "application"].includes(i.kind)), `Thủ quỹ thấy việc ngoài quyền: ${t.items.map((i) => i.kind)}`);
    });

    await test("Mỗi mục đủ trường; total = tổng count; mục gấp lên trước; GET chạy MỘT vòng DB (Server-Timing)", async () => {
      const r = await admin.get("/api/v1/inbox");
      eq(r.status, 200);
      const box = r.json;
      eq(box.total, box.items.reduce((s, i) => s + i.count, 0));
      for (const i of box.items) {
        ok(i.count > 0 && typeof i.label === "string" && i.label.length > 3, JSON.stringify(i));
        ok(i.href.startsWith("/") && !i.href.startsWith("//"), `href sai: ${i.href}`);
        eq(i.urgent, (i.overdue ?? 0) > 0, `urgent phải khớp overdue: ${JSON.stringify(i)}`);
      }
      const firstNormal = box.items.findIndex((i) => !i.urgent);
      ok(firstNormal < 0 || box.items.slice(firstNormal).every((i) => !i.urgent), "mục gấp phải đứng trước");
      const st = r.headers.get("server-timing") ?? "";
      ok(/"1 round-trips\/1 tx"/.test(st), `phải 1 vòng DB: ${st}`);
    });

    await test("Đơn xin phép: thành viên gửi ⇒ Trưởng nhà thấy `leave` +1 (sắp tới giờ ⇒ gấp); đơn của chính Trưởng nhà không tính cho Trưởng nhà (Admin vẫn thấy); hủy ⇒ giảm", async () => {
      const before = await inbox(head);
      const beforeAdmin = await inbox(admin);
      const iso = (ms) => new Date(Date.now() + ms).toISOString();
      const body = (who) => ({ kind: "late_return", startsAt: iso(3600_000), endsAt: iso(5 * 3600_000), reason: `Kiểm thử hộp việc (${who}) ${tag}`, destination: "Thư viện trường", notify: false });
      const a = await member.post("/api/v1/leave", body("thành viên"));
      eq(a.status, 201, JSON.stringify(a.json));
      cleanups.push(() => member.patch(`/api/v1/leave/${a.json.id}`, { action: "cancel" }));
      const after = await inbox(head);
      eq(countOf(after, "leave"), countOf(before, "leave") + 1);
      const it = item(after, "leave");
      eq(it.href, "/xin-phep");
      eq(it.urgent, true, "đơn còn < 12 giờ là tới giờ đi ⇒ gấp");
      ok(it.overdue >= 1 && /sắp tới giờ/.test(it.hint ?? ""), JSON.stringify(it));
      eq((await inbox(member)).eligible, false, "người gửi đơn không có hộp việc");

      const h = await head.post("/api/v1/leave", body("Trưởng nhà"));
      eq(h.status, 201, JSON.stringify(h.json));
      cleanups.push(() => head.patch(`/api/v1/leave/${h.json.id}`, { action: "cancel" }));
      eq(countOf(await inbox(head), "leave"), countOf(before, "leave") + 1, "đơn của chính mình không tính");
      eq(countOf(await inbox(admin), "leave"), countOf(beforeAdmin, "leave") + 2, "Admin thấy cả hai đơn");

      eq((await member.patch(`/api/v1/leave/${a.json.id}`, { action: "cancel" })).status, 200);
      eq((await head.patch(`/api/v1/leave/${h.json.id}`, { action: "cancel" })).status, 200);
      eq(countOf(await inbox(head), "leave"), countOf(before, "leave"), "hủy đơn ⇒ hết việc");
    });

    await test("Phiếu chi: chỉ tính phiếu NGƯỜI XEM còn ký được — phiếu mình lập không tính cho mình; khớp nút Duyệt của trang Thu chi", async () => {
      const opts = (await member.get("/api/v1/finance/options")).json;
      const fund = opts.funds.find((f) => /CASH|tiền mặt/i.test(`${f.code ?? ""} ${f.name ?? ""}`)) ?? opts.funds[0];
      const voucher = (who) => ({
        title: `Hộp việc ${who} ${tag}`,
        amountVnd: 150_000, // ≤ hạn mức Thủ quỹ tự duyệt (200.000đ) ⇒ phiếu 1 chữ ký
        categoryId: opts.categories[0].id,
        expenseDate: opts.today,
        fundId: fund.id,
        noReceiptReason: "Kiểm thử hộp việc — không có hóa đơn",
        submit: true,
      });
      const users = { head, treasurer, admin };
      const before = {};
      for (const [k, c] of Object.entries(users)) before[k] = countOf(await inbox(c), "expense_approve");

      const byMember = await member.post("/api/v1/finance/expenses", voucher("thành viên"));
      eq(byMember.status, 201, JSON.stringify(byMember.json));
      eq(byMember.json.status, "pending_approval");
      const byHead = await head.post("/api/v1/finance/expenses", voucher("Trưởng nhà"));
      eq(byHead.status, 201, JSON.stringify(byHead.json));
      // Dọn: Admin hủy (kể cả phiếu đã duyệt) rồi xóa vĩnh viễn phiếu đã hủy
      for (const id of [byMember.json.id, byHead.json.id]) {
        cleanups.push(async () => {
          await admin.post(`/api/v1/finance/expenses/${id}/cancel`, { reason: "Dọn dữ liệu kiểm thử hộp việc" });
          await admin.del(`/api/v1/finance/expenses/${id}`);
        });
      }

      const mine = [byMember.json.id, byHead.json.id];
      for (const [k, c] of Object.entries(users)) {
        const box = await inbox(c);
        const list = (await c.get("/api/v1/finance/expenses")).json;
        const canApprove = (Array.isArray(list) ? list : []).filter((e) => mine.includes(e.id) && e.can.approve).length;
        eq(countOf(box, "expense_approve") - before[k], canApprove, `${k}: số phiếu mới trong hộp việc phải khớp nút Duyệt`);
      }
      eq(countOf(await inbox(head), "expense_approve") - before.head, 1, "Trưởng nhà: chỉ phiếu của thành viên (phiếu mình lập không tính)");
      eq(countOf(await inbox(treasurer), "expense_approve") - before.treasurer, 2, "Thủ quỹ ký được cả hai (≤ hạn mức tự duyệt)");
      eq(countOf(await inbox(admin), "expense_approve") - before.admin, 2);
      ok(item(await inbox(head), "expense_approve").href.startsWith("/thu-chi?tab=chi"), "href phải mở tab phiếu chi");

      // Ký xong ⇒ hết việc của người ký; phiếu chuyển sang "chờ chi" cho Thủ quỹ
      const payBefore = countOf(await inbox(treasurer), "expense_pay");
      const d = await head.post(`/api/v1/finance/expenses/${byMember.json.id}/decision`, { decision: "approved" });
      eq(d.status, 200, JSON.stringify(d.json));
      eq(countOf(await inbox(head), "expense_approve"), before.head, "đã duyệt ⇒ không còn trong hộp việc");
      eq(countOf(await inbox(treasurer), "expense_pay"), payBefore + 1, "phiếu đã duyệt ⇒ việc chờ chi của Thủ quỹ");
      ok(!(await inbox(head)).items.some((i) => i.kind === "expense_pay"), "Trưởng nhà không có quyền ghi chi");
    });

    await test("Thủ quỹ: báo đã đóng / giao dịch ngân hàng chưa khớp (> 7 ngày ⇒ gấp) / ủng hộ chờ xác nhận; Trưởng nhà không có quyền đối soát", async () => {
      const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
      const tBefore = await inbox(treasurer);
      const hBefore = await inbox(head);
      // Báo đã đóng quỹ (khoản còn nợ, chưa có báo nào đang chờ)
      const ct = (
        await sql(
          `SELECT ct.id, ct.member_id, ct.plan_id FROM contributions ct
            WHERE ct.status IN ('unpaid', 'partial')
              AND NOT EXISTS (SELECT 1 FROM contribution_claims c WHERE c.contribution_id = ct.id AND c.status = 'pending')
            ORDER BY ct.created_at DESC LIMIT 1`
        )
      ).rows[0];
      let claimId = null;
      if (ct) {
        claimId = (
          await sql("INSERT INTO contribution_claims (contribution_id, member_id, method, note) VALUES ($1, $2, 'bank_transfer', $3) RETURNING id", [ct.id, ct.member_id, tag])
        ).rows[0].id;
        cleanups.push(() => sql("DELETE FROM contribution_claims WHERE id = $1", [claimId]));
      }
      const fund = (await sql("SELECT id FROM funds WHERE deleted_at IS NULL ORDER BY code LIMIT 1")).rows[0];
      const line = (
        await sql(
          `INSERT INTO bank_statement_lines (fund_id, import_batch_id, txn_date, direction, amount_vnd, description, bank_reference, source)
           VALUES ($1, gen_random_uuid(), $2::date - 10, 'in', 12345, $3, $3, 'import') RETURNING id`,
          [fund.id, today, tag]
        )
      ).rows[0].id;
      cleanups.push(() => sql("DELETE FROM bank_statement_lines WHERE id = $1", [line]));
      const don = (
        await sql("INSERT INTO donations (donor_member_id, donor_name, amount_vnd, donated_on, method, status, self_reported, note) VALUES ($1, 'Minh Tuấn', 70000, $2::date, 'cash', 'pending', true, $3) RETURNING id", [
          memberMe.id,
          today,
          tag,
        ])
      ).rows[0].id;
      cleanups.push(() => sql("DELETE FROM donations WHERE id = $1", [don]));

      const t = await inbox(treasurer);
      if (claimId) {
        eq(countOf(t, "claim"), countOf(tBefore, "claim") + 1, "báo đã đóng chờ xác nhận");
        ok(item(t, "claim").href.startsWith("/thu-chi?tab=tong-quan"), item(t, "claim").href);
      }
      eq(countOf(t, "bank_line"), countOf(tBefore, "bank_line") + 1);
      eq(item(t, "bank_line").urgent, true, "giao dịch quá 7 ngày chưa khớp ⇒ gấp");
      ok(/quá 7 ngày/.test(item(t, "bank_line").hint ?? ""), item(t, "bank_line").hint);
      eq(countOf(t, "donation"), countOf(tBefore, "donation") + 1);
      eq(item(t, "donation").href, "/thu-chi?tab=ung-ho");
      ok(/70\.000đ/.test(item(t, "donation").hint ?? "") || countOf(t, "donation") > 1, item(t, "donation").hint);

      const h = await inbox(head);
      eq(item(h, "bank_line"), null, "Trưởng nhà không có finance.reconcile");
      eq(countOf(h, "donation"), countOf(hBefore, "donation") + 1, "Trưởng nhà có quyền ghi thu ⇒ thấy ủng hộ chờ xác nhận");
      eq((await inbox(member)).eligible, false, "người báo ủng hộ không có hộp việc");
    });

    await test("Sự cố: báo hỏng mới ⇒ Trưởng nhà thấy `issue` (chưa tiếp nhận · chưa giao); quá hạn SLA ⇒ gấp; xong ⇒ hết việc", async () => {
      const before = countOf(await inbox(head), "issue");
      const r = await member.post("/api/v1/issues", { title: `Bóng đèn hành lang hỏng ${tag}`, locationText: "Hành lang tầng 2", urgency: "medium" });
      eq(r.status, 201, JSON.stringify(r.json));
      cleanups.push(() => admin.del(`/api/v1/issues/${r.json.id}`));
      let box = await inbox(head);
      eq(countOf(box, "issue"), before + 1);
      ok(/chưa tiếp nhận/.test(item(box, "issue").hint ?? "") && /chưa giao người/.test(item(box, "issue").hint ?? ""), item(box, "issue").hint);
      eq(item(box, "issue").href, "/hau-can?tab=bao-hong");
      eq((await inbox(member)).items.length, 0, "người báo hỏng không có hộp việc");

      await sql("UPDATE maintenance_issues SET sla_due_at = now() - interval '1 hour' WHERE id = $1", [r.json.id]);
      box = await inbox(head);
      eq(item(box, "issue").urgent, true, "quá hạn SLA ⇒ gấp");
      ok(/quá hạn/.test(item(box, "issue").hint ?? ""), item(box, "issue").hint);

      // Tiếp nhận + giao người + còn hạn ⇒ không còn là việc của người quản lý
      await sql("UPDATE maintenance_issues SET sla_due_at = now() + interval '2 days' WHERE id = $1", [r.json.id]);
      eq((await head.post(`/api/v1/issues/${r.json.id}/assign`, { memberId: otherMe.id, note: "Kiểm thử" })).status, 200);
      eq((await head.patch(`/api/v1/issues/${r.json.id}`, { status: "in_progress" })).status, 200);
      eq(countOf(await inbox(head), "issue"), before, "đang có người xử lý, còn hạn ⇒ không tính");
    });

    await test("Hình phạt quá hạn (luôn gấp), góp ý mới, yêu cầu dữ liệu sắp hết hạn 72 giờ, check-in lễ chờ duyệt, đăng ký tìm hiểu", async () => {
      const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
      const hBefore = await inbox(head);
      const lBefore = await inbox(liturgy);
      const disc = (
        await sql(
          `INSERT INTO discipline_records (member_id, rule_title, occurred_on, penalty_kind, penalty_qty, penalty_starts_on, penalty_ends_on, note)
           VALUES ($1, 'Về muộn không xin phép', $2::date - 10, 'rosary', 1, $2::date - 9, $2::date - 2, $3) RETURNING id`,
          [otherMe.id, today, tag]
        )
      ).rows[0].id;
      cleanups.push(() => sql("DELETE FROM discipline_records WHERE id = $1", [disc]));
      const fb = (await sql("INSERT INTO app_feedback (member_id, category, content) VALUES ($1, 'idea', $2) RETURNING id", [memberMe.id, `Góp ý kiểm thử hộp việc ${tag}`])).rows[0].id;
      cleanups.push(() => sql("DELETE FROM app_feedback WHERE id = $1", [fb]));
      const dsr = (
        await sql("INSERT INTO data_subject_requests (member_id, request_type, details, received_at, due_at) VALUES ($1, 'access', $2, now() - interval '62 hours', now() + interval '10 hours') RETURNING id", [
          memberMe.id,
          tag,
        ])
      ).rows[0].id;
      cleanups.push(() => sql("DELETE FROM data_subject_requests WHERE id = $1", [dsr]));
      // Check-in lễ chờ duyệt: Chúa Nhật đã qua gần nhất, người chưa check-in ngày đó
      const sunday = (await sql("SELECT (app.local_today() - extract(isodow FROM app.local_today())::int)::text AS d")).rows[0].d;
      const mc = (
        await sql(
          `INSERT INTO mass_checkins (day_date, member_id, occasion, church, note)
           SELECT $1::date, m.id, 'sunday', 'Nhà thờ Chánh Tòa Kitô Vua', $2 FROM members m
            WHERE m.id = ANY ($3::uuid[]) AND NOT EXISTS (SELECT 1 FROM mass_checkins c WHERE c.day_date = $1::date AND c.member_id = m.id)
            LIMIT 1 RETURNING id`,
          [sunday, tag, [memberMe.id, otherMe.id]]
        )
      ).rows[0]?.id;
      if (mc) {
        cleanups.push(() => sql("DELETE FROM mass_checkins WHERE id = $1", [mc]));
        // Cấu hình tự xác nhận check-in không cần ảnh (nếu có) ⇒ đưa về "chờ duyệt" cho ca kiểm thử
        await sql("UPDATE mass_checkins SET status = 'submitted', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL WHERE id = $1 AND status <> 'submitted'", [mc]).catch(() => {});
      }
      const mcPending = mc ? (await sql("SELECT status FROM mass_checkins WHERE id = $1", [mc])).rows[0]?.status === "submitted" : false;
      const inq = (await sql("INSERT INTO admission_inquiries (full_name, phone, message, created_at) VALUES ('Người tìm hiểu thử', '0900000000', $1, now() - interval '4 days') RETURNING id", [tag])).rows[0].id;
      cleanups.push(() => sql("DELETE FROM admission_inquiries WHERE id = $1", [inq]));

      const h = await inbox(head);
      eq(countOf(h, "discipline_overdue"), countOf(hBefore, "discipline_overdue") + 1);
      eq(item(h, "discipline_overdue").urgent, true, "hình phạt quá ngày kết thúc ⇒ gấp");
      eq(item(h, "discipline_overdue").href, "/ky-luat");
      eq(countOf(h, "feedback"), countOf(hBefore, "feedback") + 1);
      eq(item(h, "feedback").urgent, false, "góp ý không bao giờ quá hạn");
      eq(item(h, "feedback").href, "/gop-y?tab=all");
      eq(countOf(h, "data_request"), countOf(hBefore, "data_request") + 1);
      eq(item(h, "data_request").urgent, true, "còn < 24 giờ tới hạn 72 giờ ⇒ gấp");
      eq(item(h, "data_request").href, "/thanh-vien?tab=data-requests");
      eq(countOf(h, "inquiry"), countOf(hBefore, "inquiry") + 1);
      eq(item(h, "inquiry").urgent, true, "chờ liên hệ quá 3 ngày ⇒ gấp");
      eq(item(h, "inquiry").href, "/bai-viet?tab=inquiries");
      if (mcPending) {
        const l = await inbox(liturgy);
        eq(countOf(l, "mass_checkin"), countOf(lBefore, "mass_checkin") + 1, "Trưởng ban Phụng vụ thấy check-in chờ duyệt");
        ok(/^\/lich-su-kien\?date=\d{4}-\d{2}-\d{2}$/.test(item(l, "mass_checkin").href), item(l, "mass_checkin").href);
      }
      // Thành viên có góp ý / yêu cầu dữ liệu của chính mình vẫn không có hộp việc
      eq((await inbox(member)).eligible, false);
    });

    await test("Mục gấp lên đầu danh sách (Trưởng nhà đang có hình phạt quá hạn + yêu cầu dữ liệu gấp)", async () => {
      const today = (await sql("SELECT app.local_today()::text AS d")).rows[0].d;
      const id = (
        await sql(
          `INSERT INTO discipline_records (member_id, rule_title, occurred_on, penalty_kind, penalty_qty, penalty_starts_on, penalty_ends_on, note)
           VALUES ($1, 'Kiểm thử thứ tự', $2::date - 5, 'mass', 1, $2::date - 4, $2::date - 1, $3) RETURNING id`,
          [otherMe.id, today, tag]
        )
      ).rows[0].id;
      cleanups.push(() => sql("DELETE FROM discipline_records WHERE id = $1", [id]));
      const box = await inbox(head);
      ok(box.items[0].urgent, `mục đầu phải là việc gấp: ${JSON.stringify(box.items[0])}`);
    });
  } finally {
    for (const f of cleanups.reverse()) {
      try {
        await f();
      } catch {
        /* dọn tiếp */
      }
    }
    // Dọn phần còn sót (chạy dở lần trước)
    await sql("DELETE FROM discipline_records WHERE note LIKE 'inbox-%'").catch(() => {});
    await sql("DELETE FROM app_feedback WHERE content LIKE 'Góp ý kiểm thử hộp việc %'").catch(() => {});
    await sql("DELETE FROM data_subject_requests WHERE details LIKE 'inbox-%'").catch(() => {});
    await sql("DELETE FROM admission_inquiries WHERE message LIKE 'inbox-%'").catch(() => {});
    await sql("DELETE FROM mass_checkins WHERE note LIKE 'inbox-%'").catch(() => {});
    await sql("DELETE FROM donations WHERE note LIKE 'inbox-%' AND status = 'pending'").catch(() => {});
    await sql("DELETE FROM contribution_claims WHERE note LIKE 'inbox-%' AND status = 'pending'").catch(() => {});
    await sql("DELETE FROM bank_statement_lines WHERE bank_reference LIKE 'inbox-%' AND match_status <> 'matched'").catch(() => {});
  }
  void headMe;
}
