// Kiểm thử gói E — Rời nhà có danh sách việc còn treo, kích hoạt lại một bước (GET/POST /api/v1/members/:id/departure, POST …/reactivate):
// danh sách đúng (khoản quỹ chưa đóng, tuần trực sắp tới, hình phạt đang mở, đơn xin phép đang chờ), áp dụng một lần trong MỘT giao dịch
// (miễn quỹ, gỡ khỏi tuần trực — tuần chỉ còn mình người đó thì xóa, miễn hình phạt, từ chối đơn chờ, tạo hồ sơ cựu, đổi trạng thái + khóa tài khoản),
// chặn tự rời, chặn rời hai lần, kích hoạt lại mở lại tài khoản.
import pg from "pg";

const shiftMonth = (ym, n) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export async function run({ as, test, eq, ok, section, pgConfig }) {
  section("Thành viên — rời nhà có danh sách việc treo, kích hoạt lại");
  const sql = async (text, params) => {
    const db = new pg.Client(pgConfig());
    await db.connect();
    try {
      return await db.query(text, params);
    } finally {
      await db.end();
    }
  };
  const head = await as("duc.tran@luuxa.local"); // member.status.change, waive, duty.manage, discipline.manage, leave.review
  const regular = await as("tuan.nguyen@luuxa.local");
  const treasurer = await as("bao.pham@luuxa.local");
  const tag = Date.now().toString(36);
  const email = `roi.${tag}@luuxa.local`;
  const fullName = `Gioan Rời Nhà ${tag}`;
  const headMe = (await head.get("/api/v1/auth/me")).json.member.id;
  const partnerId = (await regular.get("/api/v1/auth/me")).json.member.id;
  let id;
  let recordId = null;
  const weekIds = [];
  const leaveIds = [];

  try {
    await test("Chuẩn bị: thành viên mới có tài khoản + khoản quỹ chưa đóng + 2 tuần trực + 1 hình phạt đang mở + 1 đơn xin phép chờ duyệt", async () => {
      const r = await head.post("/api/v1/members", { fullName, email, createAccount: true, roomCode: null });
      eq(r.status, 201, JSON.stringify(r.json));
      id = r.json.id;
      // Khoản quỹ chưa đóng: thêm người mới vào một kế hoạch thu đang có ("Cập nhật người phải đóng") — chạy lại được nhiều lần
      const plans = (await treasurer.get("/api/v1/finance/contribution-plans")).json.filter((x) => x.status !== "cancelled" && x.status !== "draft");
      let got = 0;
      for (const plan of plans) {
        await treasurer.post(`/api/v1/finance/contribution-plans/${plan.id}/members`, { memberIds: [id] });
        got = (await head.get(`/api/v1/members/${id}/departure`)).json.dues.items.length;
        if (got) break;
      }
      ok(got > 0, "không dựng được khoản quỹ chưa đóng cho người thử: " + plans.length + " kế hoạch");
      const options = (await treasurer.get("/api/v1/finance/options")).json;
      // Hai tuần trực trong tương lai: tuần A có thêm người trực cùng, tuần B chỉ có người rời
      const mondays = (await sql("SELECT (date_trunc('week', app.local_today() + 7 * 31)::date)::text AS a, (date_trunc('week', app.local_today() + 7 * 32)::date)::text AS b")).rows[0];
      for (const [wk, members] of [[mondays.a, [id, partnerId]], [mondays.b, [id]]]) {
        ok(!(await sql("SELECT 1 FROM duty_weeks WHERE week_start = $1", [wk])).rowCount, "tuần thử đã có sẵn");
        const w = await sql("INSERT INTO duty_weeks (week_start) VALUES ($1) RETURNING id", [wk]);
        weekIds.push({ id: w.rows[0].id, weekStart: wk });
        for (const m of members) await sql("INSERT INTO duty_week_members (week_id, member_id) VALUES ($1, $2)", [w.rows[0].id, m]);
      }
      // Hình phạt đang mở
      const rec = await head.post("/api/v1/discipline/records", { memberId: id, ruleTitle: `Vi phạm thử rời nhà ${tag}`, occurredOn: options.today, penaltyKind: "rosary", penaltyQty: 3 });
      eq(rec.status, 201, JSON.stringify(rec.json));
      recordId = rec.json.id;
      // Đơn xin phép đang chờ (chèn thẳng — người rời chưa đổi mật khẩu tạm nên chưa đăng nhập gửi đơn được)
      const lv = await sql(
        `INSERT INTO leave_requests (member_id, kind, starts_at, ends_at, reason, destination)
         VALUES ($1, 'long_leave', now() + interval '1 day', now() + interval '4 days', 'Đi thực tập kiểm thử', 'Nơi thực tập') RETURNING id`,
        [id]
      );
      leaveIds.push(lv.rows[0].id);
    });

    await test("Danh sách việc treo: khoản quỹ (tổng), tuần trực (kèm người trực cùng), hình phạt đang mở, đơn chờ duyệt; Trưởng nhà có đủ quyền xử lý", async () => {
      const r = await head.get(`/api/v1/members/${id}/departure`);
      eq(r.status, 200, JSON.stringify(r.json));
      const c = r.json;
      eq(c.member.id, id);
      eq(c.isSelf, false);
      ok(c.dues.items.length >= 1 && c.dues.totalVnd > 0, "có khoản quỹ chưa đóng: " + JSON.stringify(c.dues));
      eq(c.dues.totalVnd, c.dues.items.reduce((s, d) => s + d.remainingVnd, 0));
      eq(c.dues.canWaive, true);
      eq(c.dutyWeeks.items.length, 2);
      const partnered = c.dutyWeeks.items.find((w) => w.weekStart === weekIds[0].weekStart);
      eq(partnered.partners.length, 1, "tuần A có 1 người trực cùng");
      eq(c.dutyWeeks.items.find((w) => w.weekStart === weekIds[1].weekStart).partners.length, 0, "tuần B chỉ có mình người rời");
      eq(c.discipline.items.length, 1);
      eq(c.discipline.items[0].id, recordId);
      eq(c.leaves.items.length, 1);
      eq(c.leaves.canReview, true);
      eq(c.hasAlumniProfile, false);
    });

    await test("Chặn: tự đánh dấu mình đã rời (422); thành viên thường không áp dụng được (không đổi trạng thái)", async () => {
      const self = await head.post(`/api/v1/members/${headMe}/departure`, { status: "left" });
      eq(self.status, 422, JSON.stringify(self.json));
      eq(self.json.code, "SELF_DEPARTURE");
      const bad = await regular.post(`/api/v1/members/${id}/departure`, { status: "left", waiveDues: true });
      ok(bad.status >= 400, `thành viên thường không được: ${bad.status}`);
      eq((await sql("SELECT status::text AS s FROM members WHERE id = $1", [id])).rows[0].s, "active");
      eq((await head.post(`/api/v1/members/${id}/departure`, { status: "active" })).status, 400, "trạng thái không hợp lệ");
    });

    await test("Thiếu quyền một bước ⇒ lỗi và KHÔNG bước nào được ghi (một giao dịch): Thủ quỹ không có quyền sửa lịch trực / miễn hình phạt", async () => {
      const r = await treasurer.post(`/api/v1/members/${id}/departure`, { status: "left", removeDutyWeeks: true, waiveDiscipline: true });
      ok(r.status >= 400, `phải bị chặn: ${r.status} ${JSON.stringify(r.json)}`);
      eq((await sql("SELECT status::text AS s FROM members WHERE id = $1", [id])).rows[0].s, "active");
      eq((await sql("SELECT count(*)::int AS n FROM duty_week_members WHERE member_id = $1", [id])).rows[0].n, 2, "tuần trực còn nguyên");
    });

    await test("Áp dụng một lần: miễn quỹ + gỡ khỏi tuần trực + miễn hình phạt + từ chối đơn chờ + tạo hồ sơ cựu + đổi trạng thái 'đã rời' (khóa tài khoản)", async () => {
      const before = (await head.get(`/api/v1/members/${id}/departure`)).json;
      const r = await head.post(`/api/v1/members/${id}/departure`, {
        status: "left",
        reason: "Tốt nghiệp, chuyển nơi ở (kiểm thử)",
        waiveDues: true,
        removeDutyWeeks: true,
        waiveDiscipline: true,
        cancelLeaves: true,
        createAlumni: true,
      });
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.status, "left");
      eq(r.json.duesWaived, before.dues.items.length);
      eq(r.json.duesWaivedVnd, before.dues.totalVnd);
      eq(r.json.dutyWeeksUpdated, 2);
      eq(r.json.disciplineWaived, 1);
      eq(r.json.leavesRejected, 1);
      eq(r.json.alumniCreated, true);
      // Đối chiếu CSDL
      const m = (await sql("SELECT m.status::text AS s, m.left_reason, u.status::text AS us FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = $1", [id])).rows[0];
      eq(m.s, "left");
      eq(m.us, "disabled", "tài khoản bị vô hiệu khi rời");
      const open = (await sql("SELECT count(*)::int AS n FROM contributions WHERE member_id = $1 AND amount_due_vnd - discount_vnd - paid_vnd > 0 AND status IN ('unpaid','partial')", [id])).rows[0].n;
      eq(open, 0, "không còn khoản quỹ phải thu");
      eq((await sql("SELECT count(*)::int AS n FROM duty_week_members WHERE member_id = $1", [id])).rows[0].n, 0);
      eq((await sql("SELECT count(*)::int AS n FROM duty_week_members WHERE week_id = $1", [weekIds[0].id])).rows[0].n, 1, "tuần A còn người trực cùng");
      eq((await sql("SELECT count(*)::int AS n FROM duty_weeks WHERE id = $1", [weekIds[1].id])).rows[0].n, 0, "tuần B chỉ có mình người rời ⇒ xóa tuần");
      eq((await sql("SELECT status::text AS s FROM discipline_records WHERE id = $1", [recordId])).rows[0].s, "waived");
      eq((await sql("SELECT status::text AS s FROM leave_requests WHERE id = $1", [leaveIds[0]])).rows[0].s, "rejected");
      eq((await sql("SELECT count(*)::int AS n FROM alumni_profiles WHERE member_id = $1", [id])).rows[0].n, 1);
      // Danh sách việc treo giờ trống
      const after = (await head.get(`/api/v1/members/${id}/departure`)).json;
      eq(after.dues.items.length + after.dutyWeeks.items.length + after.discipline.items.length + after.leaves.items.length, 0);
      eq(after.hasAlumniProfile, true);
    });

    await test("Rời hai lần ⇒ 409", async () => {
      const r = await head.post(`/api/v1/members/${id}/departure`, { status: "alumni" });
      eq(r.status, 409, JSON.stringify(r.json));
      eq(r.json.code, "ALREADY_LEFT");
    });

    await test("Kích hoạt lại một bước: 'Đang ở' + mở lại tài khoản; kích hoạt lần nữa ⇒ 409; thành viên thường không làm được", async () => {
      ok((await regular.post(`/api/v1/members/${id}/reactivate`, {})).status >= 400, "thành viên thường bị chặn");
      const r = await head.post(`/api/v1/members/${id}/reactivate`, {});
      eq(r.status, 200, JSON.stringify(r.json));
      eq(r.json.accountEnabled, true);
      eq(r.json.roomAssigned, false);
      const m = (await sql("SELECT m.status::text AS s, m.left_on, u.status::text AS us FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1", [id])).rows[0];
      eq(m.s, "active");
      eq(m.left_on, null);
      eq(m.us, "active");
      const again = await head.post(`/api/v1/members/${id}/reactivate`, {});
      eq(again.status, 409, JSON.stringify(again.json));
    });
  } finally {
    // Dọn: đưa người thử về "đã rời" (khóa tài khoản) và hủy kế hoạch quỹ thử
    if (id) await head.post(`/api/v1/members/${id}/departure`, { status: "left", reason: "Dọn dữ liệu thử" }).catch(() => null);
    if (recordId) await sql("DELETE FROM discipline_records WHERE id = $1", [recordId]);
    for (const w of weekIds) await sql("DELETE FROM duty_weeks WHERE id = $1", [w.id]);
    if (leaveIds.length) await sql("DELETE FROM leave_requests WHERE id = ANY($1::uuid[])", [leaveIds]);
  }
}

