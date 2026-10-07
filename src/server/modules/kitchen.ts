import "server-only";
import type { Tx } from "../db";
import type { Ctx } from "../http";
import { liturgicalRange } from "@/lib/liturgy/engine";
import { ApiError, forbidden, notFound } from "../errors";
import type {
  MealCookDto,
  MealDayDto,
  MealFeedbackDto,
  MealRosterRowDto,
  MealSlotDto,
  MealSurveyDto,
  MealsSummaryDto,
  MealsWeekDto,
  MealType,
  RegStateDto,
} from "@/lib/types/kitchen";

// ---------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_LONG = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const hhmm = (v: string | null | undefined, d: string) => (v && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : d);

/**
 * Thông điệp của trigger thiết kế (vd "Phân hệ Bếp & Cơm đang tạm hoãn…", "Bữa ăn không mở đăng ký.") mang mã
 * check_violation nhưng không có tiền tố BR- ⇒ bảng ánh xạ chung sẽ thay bằng câu chung chung. Ở đây giữ nguyên câu chữ DB.
 */
export function kitchenError(e: unknown): unknown {
  if (!e || typeof e !== "object" || !("code" in e)) return e;
  const pe = e as { code?: string; message?: string; constraint?: string };
  if (pe.code === "23514" && pe.message && !pe.constraint && !/^BR-/.test(pe.message)) return new ApiError(422, "MEAL_RULE", pe.message);
  if (pe.code === "23505") {
    if (pe.constraint === "ux_meal_survey_options__label") return new ApiError(409, "DUPLICATE", "Món này đã có trong khảo sát.");
    if (pe.constraint === "ux_pantry_restock_requests__open_item")
      return new ApiError(409, "DUPLICATE", "Mặt hàng này đã có yêu cầu mua thêm đang chờ xử lý.");
    if (pe.constraint === "meal_survey_votes_pkey") return new ApiError(409, "DUPLICATE", "Bạn đã chọn món này rồi.");
  }
  return e;
}

/** ctx.db + giữ thông điệp nghiệp vụ tiếng Việt của DB. */
export const kdb = <T,>(ctx: Ctx, fn: (tx: Tx) => Promise<T>) =>
  ctx.db(async (tx) => {
    try {
      return await fn(tx);
    } catch (e) {
      throw kitchenError(e);
    }
  });

async function perms(tx: Tx) {
  return (
    await tx.query<{ manage: boolean; register: boolean; setting_write: boolean; me: string | null; enabled: boolean; today: string }>(
      `SELECT app.has_permission('meal.manage') AS manage, app.has_permission('meal.register') AS register,
              app.has_permission('setting.write') AS setting_write, app.current_member_id() AS me,
              app.setting_bool('feature.meals.enabled') AS enabled, app.local_today()::text AS today`
    )
  ).rows[0];
}

async function requireManage(tx: Tx, what: string) {
  const p = await perms(tx);
  if (!p.manage) throw forbidden(`Chỉ Ban Ẩm thực (quyền quản lý bếp) mới ${what}.`);
  return p;
}

async function readSettings(tx: Tx) {
  const r = (
    await tx.query<{ lunch: string; dinner: string }>(
      `SELECT app.setting_text('meal.lunch_cutoff_time') AS lunch, app.setting_text('meal.dinner_cutoff_time') AS dinner`
    )
  ).rows[0];
  return { lunchCutoff: hhmm(r.lunch, "09:00"), dinnerCutoff: hhmm(r.dinner, "15:00") };
}

const regState = (eat: boolean | null, guests: number | null, note: string | null, by: string | null): RegStateDto | null =>
  eat === null || eat === undefined ? null : { willEat: eat, guests: guests ?? 0, note: note ?? null, registeredBy: by ?? null };

// ---------------------------------------------------------------------
// Tuần bữa ăn (thực đơn + số suất + đăng ký của tôi) và bảng điểm danh của ngày đang chọn
// ---------------------------------------------------------------------
export async function getMealsWeek(tx: Tx, date: string | null): Promise<MealsWeekDto> {
  const p = await perms(tx);
  const base = (
    await tx.query(
      `SELECT now() AS now, COALESCE($1::date, app.local_today())::text AS sel,
              date_trunc('week', COALESCE($1::date, app.local_today()))::date::text AS wk,
              (date_trunc('week', COALESCE($1::date, app.local_today()))::date + 6)::text AS wk_end,
              extract(week FROM COALESCE($1::date, app.local_today()))::int AS wn,
              (SELECT name FROM academic_years WHERE is_current LIMIT 1) AS ay,
              (SELECT count(*)::int FROM members WHERE status = 'active' AND deleted_at IS NULL) AS active`,
      [date]
    )
  ).rows[0];
  const settings = await readSettings(tx);
  const { wk, wk_end: wkEnd, sel } = base as { wk: string; wk_end: string; sel: string };

  const slots = (
    await tx.query(
      `WITH slots AS (
         SELECT d::date AS date, mt.meal
           FROM generate_series($1::date::timestamp, $1::date::timestamp + interval '6 days', interval '1 day') d
          CROSS JOIN (VALUES ('lunch'::meal_type_t), ('dinner'::meal_type_t)) AS mt(meal))
       SELECT s.date::text AS date, s.meal::text AS meal, m.id, m.title, m.dishes, m.status, m.cost_per_serving_vnd,
              COALESCE(m.cutoff_at, app.fn_meal_default_cutoff(s.date, s.meal)) AS cutoff_at,
              now() > COALESCE(m.cutoff_at, app.fn_meal_default_cutoff(s.date, s.meal)) AS past_cutoff,
              COALESCE((SELECT json_agg(json_build_object('memberId', c.member_id, 'name', mb.display_name, 'role', c.role_label)
                                        ORDER BY CASE c.role_label WHEN 'lead' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END, mb.display_name)
                          FROM meal_menu_cooks c JOIN members mb ON mb.id = c.member_id WHERE c.menu_id = m.id), '[]') AS cooks,
              mr.will_eat, mr.guests, mr.note, rb.display_name AS reg_by,
              mf.rating AS my_rating, mf.comment AS my_comment
         FROM slots s
         LEFT JOIN meal_menus m ON m.menu_date = s.date AND m.meal_type = s.meal
         LEFT JOIN meal_registrations mr ON mr.menu_id = m.id AND mr.member_id = app.current_member_id()
         LEFT JOIN members rb ON rb.user_id = mr.registered_by AND rb.id <> mr.member_id
         LEFT JOIN meal_feedback mf ON mf.menu_id = m.id AND mf.member_id = app.current_member_id()
        ORDER BY s.date, s.meal`,
      [wk]
    )
  ).rows;

  const counts = new Map<string, { eaters: number; guests: number }>();
  if (p.manage || p.register) {
    for (const c of (await tx.query("SELECT menu_id, eaters, guests FROM app.fn_meal_counts($1::date, $2::date)", [wk, wkEnd])).rows)
      counts.set(c.menu_id, { eaters: Number(c.eaters), guests: Number(c.guests) });
  }
  const ratings = new Map<string, { avg: number; count: number }>();
  for (const r of (await tx.query("SELECT menu_id, avg_rating, ratings FROM app.fn_meal_feedback_summary($1::date, $2::date)", [wk, wkEnd])).rows)
    ratings.set(r.menu_id, { avg: Number(r.avg_rating), count: Number(r.ratings) });
  // Tên lễ trong tuần (bộ tính lịch phụng vụ) — chỉ ngày có lễ, không ghi "Thứ Hai tuần … Thường Niên"
  const liturgy = new Map<string, string>();
  for (const l of liturgicalRange(wk, wkEnd)) if (l.rank !== "weekday" && l.rank !== "privileged") liturgy.set(l.date, l.title);

  const slotOf = (r: Record<string, any>): MealSlotDto => {
    const c = r.id ? counts.get(r.id) : undefined;
    const locked = !p.enabled || r.past_cutoff || (r.status !== null && r.status !== "open");
    return {
      menuId: r.id ?? null,
      date: r.date,
      meal: r.meal,
      title: r.title ?? null,
      dishes: r.dishes ?? [],
      status: r.status ?? null,
      cutoffAt: iso(r.cutoff_at)!,
      pastCutoff: !!r.past_cutoff,
      locked,
      costPerServing: r.cost_per_serving_vnd ?? null,
      cooks: (r.cooks ?? []) as MealCookDto[],
      eaters: c?.eaters ?? 0,
      guests: c?.guests ?? 0,
      mine: regState(r.will_eat, r.guests, r.note, r.reg_by),
      rating: r.id ? ratings.get(r.id) ?? null : null,
      myFeedback: r.my_rating ? { rating: r.my_rating, comment: r.my_comment ?? null } : null,
    };
  };
  const days: MealDayDto[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const lunch = slotOf(slots[i]);
    const dinner = slotOf(slots[i + 1]);
    const d = lunch.date;
    days.push({
      date: d,
      weekday: WEEKDAY_SHORT[dow(d)],
      weekdayLong: WEEKDAY_LONG[dow(d)],
      isToday: d === p.today,
      isPast: d < p.today,
      liturgy: liturgy.get(d) ?? null,
      lunch,
      dinner,
    });
  }

  const roster = (
    await tx.query(
      `SELECT m.id, m.display_name, m.full_name, m.status::text AS status, m.avatar_file_id, r.code AS room_code,
              rl.will_eat AS l_eat, rl.guests AS l_guests, rl.note AS l_note, bl.display_name AS l_by,
              rd.will_eat AS d_eat, rd.guests AS d_guests, rd.note AS d_note, bd.display_name AS d_by
         FROM members m
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                       AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
         LEFT JOIN meal_menus ml ON ml.menu_date = $1::date AND ml.meal_type = 'lunch'
         LEFT JOIN meal_registrations rl ON rl.menu_id = ml.id AND rl.member_id = m.id
         LEFT JOIN members bl ON bl.user_id = rl.registered_by AND bl.id <> m.id
         LEFT JOIN meal_menus md ON md.menu_date = $1::date AND md.meal_type = 'dinner'
         LEFT JOIN meal_registrations rd ON rd.menu_id = md.id AND rd.member_id = m.id
         LEFT JOIN members bd ON bd.user_id = rd.registered_by AND bd.id <> m.id
        WHERE m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
          AND ($2::boolean OR m.id = app.current_member_id())
        ORDER BY m.member_no`,
      [sel, p.manage]
    )
  ).rows.map(
    (r): MealRosterRowDto => ({
      memberId: r.id,
      name: r.display_name,
      fullName: r.full_name,
      room: r.room_code ?? "Chưa xếp phòng",
      avatarText: initials(r.display_name),
      avatarFileId: r.avatar_file_id ?? null,
      onLeave: r.status === "on_leave",
      lunch: regState(r.l_eat, r.l_guests, r.l_note, r.l_by),
      dinner: regState(r.d_eat, r.d_guests, r.d_note, r.d_by),
    })
  );

  return {
    enabled: p.enabled,
    today: p.today,
    now: iso(base.now)!,
    selectedDate: sel,
    weekStart: wk,
    weekEnd: wkEnd,
    weekNo: base.wn,
    academicYear: base.ay ?? null,
    settings,
    days,
    roster,
    activeMembers: base.active,
    meId: p.me,
    canManage: p.manage,
    canRegister: p.register || p.manage,
    canToggleFeature: p.setting_write,
  };
}

// ---------------------------------------------------------------------
// Đăng ký suất
// ---------------------------------------------------------------------
async function ensureMenu(tx: Tx, date: string, meal: MealType): Promise<string> {
  return (await tx.query<{ id: string }>("SELECT app.fn_meal_ensure_menu($1::date, $2::meal_type_t) AS id", [date, meal])).rows[0].id;
}

export async function setRegistration(
  tx: Tx,
  b: { date: string; meal: MealType; memberId?: string; willEat: boolean; guests?: number; note?: string | null }
) {
  const p = await perms(tx);
  const memberId = b.memberId ?? p.me;
  if (!memberId) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên nên không đăng ký suất ăn được.");
  if (memberId !== p.me && !p.manage) throw forbidden("Chỉ được đăng ký suất của chính mình — đăng ký hộ cần quyền của Ban Ẩm thực.");
  const menuId = await ensureMenu(tx, b.date, b.meal);
  const guests = b.willEat ? b.guests ?? null : 0;
  const note = b.note === undefined ? null : b.note || null;
  await tx.query(
    `INSERT INTO meal_registrations (menu_id, member_id, will_eat, guests, note)
     VALUES ($1, $2, $3, COALESCE($4::smallint, 0), $5)
     ON CONFLICT (menu_id, member_id) DO UPDATE
        SET will_eat = EXCLUDED.will_eat,
            guests = CASE WHEN $4::smallint IS NULL THEN meal_registrations.guests ELSE EXCLUDED.guests END,
            note = CASE WHEN $6::boolean THEN EXCLUDED.note ELSE meal_registrations.note END`,
    [menuId, memberId, b.willEat, guests, note, b.note !== undefined]
  );
  return { menuId };
}

/** "Đăng ký ăn cả tuần" (bản thân, các bữa còn mở từ hôm nay đến hết tuần) hoặc "Đăng ký cả nhà" (Ban Ẩm thực, một ngày). */
export async function bulkRegister(
  tx: Tx,
  b: { scope: "self-week"; date: string } | { scope: "all-members"; date: string; meals?: MealType[] }
): Promise<{ registered: number; skipped: number; message: string }> {
  const p = await perms(tx);
  if (!p.enabled) throw new ApiError(422, "MEAL_DISABLED", "Phân hệ Bếp & Cơm đang tạm hoãn theo quyết định người quản lý.");
  if (b.scope === "all-members") {
    if (!p.manage) throw forbidden("Chỉ Ban Ẩm thực mới đăng ký hộ cả nhà.");
    let registered = 0;
    let skipped = 0;
    for (const meal of b.meals ?? (["lunch", "dinner"] as MealType[])) {
      const menuId = await ensureMenu(tx, b.date, meal);
      const st = (await tx.query<{ status: string }>("SELECT status FROM meal_menus WHERE id = $1", [menuId])).rows[0]?.status;
      if (st === "cancelled") {
        skipped++;
        continue;
      }
      const r = await tx.query(
        `INSERT INTO meal_registrations (menu_id, member_id, will_eat)
         SELECT $1, m.id, true FROM members m WHERE m.status = 'active' AND m.deleted_at IS NULL
         ON CONFLICT (menu_id, member_id) DO NOTHING`,
        [menuId]
      );
      registered += r.rowCount ?? 0;
    }
    return {
      registered,
      skipped,
      message: registered
        ? `Đã đăng ký thêm ${registered} suất cho những anh em chưa đăng ký (giữ nguyên người đã báo vắng).`
        : "Mọi thành viên đã có đăng ký cho ngày này — không có suất nào cần thêm.",
    };
  }

  if (!p.me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  if (!p.register && !p.manage) throw forbidden("Bạn không có quyền đăng ký suất ăn.");
  const slots = (
    await tx.query<{ date: string; meal: MealType; status: string | null; open: boolean }>(
      `SELECT d::date::text AS date, mt.meal::text AS meal, m.status,
              COALESCE(m.cutoff_at, app.fn_meal_default_cutoff(d::date, mt.meal)) > now() AS open
         FROM generate_series(GREATEST(app.local_today(), date_trunc('week', $1::date)::date)::timestamp,
                              (date_trunc('week', $1::date)::date + 6)::timestamp, interval '1 day') d
        CROSS JOIN (VALUES ('lunch'::meal_type_t), ('dinner'::meal_type_t)) AS mt(meal)
         LEFT JOIN meal_menus m ON m.menu_date = d::date AND m.meal_type = mt.meal
        ORDER BY 1, 2`,
      [b.date]
    )
  ).rows;
  let registered = 0;
  let skipped = 0;
  for (const s of slots) {
    const usable = p.manage ? s.status !== "cancelled" : s.open && (s.status === null || s.status === "open");
    if (!usable) {
      skipped++;
      continue;
    }
    await tx.query("SAVEPOINT meal_slot");
    try {
      const menuId = await ensureMenu(tx, s.date, s.meal);
      await tx.query(
        `INSERT INTO meal_registrations (menu_id, member_id, will_eat) VALUES ($1, $2, true)
         ON CONFLICT (menu_id, member_id) DO UPDATE SET will_eat = true`,
        [menuId, p.me]
      );
      await tx.query("RELEASE SAVEPOINT meal_slot");
      registered++;
    } catch {
      await tx.query("ROLLBACK TO SAVEPOINT meal_slot");
      skipped++;
    }
  }
  if (!registered && !slots.length) throw new ApiError(422, "MEAL_WEEK_OVER", "Tuần này đã qua — chọn tuần hiện tại hoặc tuần sau để đăng ký.");
  return {
    registered,
    skipped,
    message: registered
      ? `Đã đăng ký ${registered} bữa trong tuần${skipped ? ` (bỏ qua ${skipped} bữa đã chốt sổ / không nấu)` : ""}.`
      : "Không còn bữa nào mở đăng ký trong tuần này (đã quá giờ chốt hoặc không nấu).",
  };
}

// ---------------------------------------------------------------------
// Thực đơn (Ban Ẩm thực)
// ---------------------------------------------------------------------
interface MenuMealInput {
  title?: string | null;
  dishes: string[];
  status?: "draft" | "open" | "closed" | "served" | "cancelled";
  costPerServing?: number | null;
  cutoffTime?: string | null;
}

async function upsertMenu(tx: Tx, date: string, meal: MealType, m: MenuMealInput): Promise<string> {
  const dishes = m.dishes.map((d) => d.trim()).filter(Boolean);
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO meal_menus (menu_date, meal_type, title, dishes, cost_per_serving_vnd, cutoff_at, status, created_by, approved_by)
       VALUES ($1::date, $2::meal_type_t, $3, $4::text[], $5,
               COALESCE((($1::date + $6::time) AT TIME ZONE 'Asia/Ho_Chi_Minh'), app.fn_meal_default_cutoff($1::date, $2::meal_type_t)),
               COALESCE($7, 'open'), app.current_user_id(), app.current_user_id())
       ON CONFLICT (menu_date, meal_type) DO UPDATE
          SET title = EXCLUDED.title, dishes = EXCLUDED.dishes, cost_per_serving_vnd = EXCLUDED.cost_per_serving_vnd,
              cutoff_at = CASE WHEN $6::time IS NULL THEN meal_menus.cutoff_at ELSE EXCLUDED.cutoff_at END,
              status = COALESCE($7, meal_menus.status), approved_by = app.current_user_id()
       RETURNING id`,
      [date, meal, m.title?.trim() || null, dishes, m.costPerServing ?? null, m.cutoffTime ?? null, m.status ?? null]
    )
  ).rows[0].id;
}

export async function saveMenuDay(
  tx: Tx,
  b: { date: string; lunch?: MenuMealInput; dinner?: MenuMealInput; cooks?: { memberId: string; role: "lead" | "assistant" | "shopper" }[] }
) {
  await requireManage(tx, "lập / sửa thực đơn");
  const ids: Partial<Record<MealType, string>> = {};
  for (const meal of ["lunch", "dinner"] as MealType[]) {
    const m = b[meal];
    if (m) ids[meal] = await upsertMenu(tx, b.date, meal, m);
  }
  if (b.cooks) {
    for (const meal of ["lunch", "dinner"] as MealType[]) {
      ids[meal] ??=
        (await tx.query<{ id: string }>("SELECT id FROM meal_menus WHERE menu_date = $1::date AND meal_type = $2::meal_type_t", [b.date, meal])).rows[0]?.id ??
        (await upsertMenu(tx, b.date, meal, { dishes: [] }));
      await tx.query("DELETE FROM meal_menu_cooks WHERE menu_id = $1", [ids[meal]]);
      const seen = new Set<string>();
      for (const c of b.cooks) {
        if (seen.has(c.memberId)) continue;
        seen.add(c.memberId);
        await tx.query("INSERT INTO meal_menu_cooks (menu_id, member_id, role_label) VALUES ($1, $2, $3)", [ids[meal], c.memberId, c.role]);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------
// Góp ý bữa ăn
// ---------------------------------------------------------------------
export async function getFeedback(tx: Tx, menuId: string): Promise<MealFeedbackDto> {
  const m = (await tx.query("SELECT menu_date::text AS date, meal_type::text AS meal FROM meal_menus WHERE id = $1", [menuId])).rows[0];
  if (!m) throw notFound("Không tìm thấy bữa ăn.");
  const s = (await tx.query("SELECT avg_rating, ratings FROM app.fn_meal_feedback_summary($1::date, $1::date) WHERE menu_id = $2", [m.date, menuId])).rows[0];
  const items = (
    await tx.query(
      `SELECT f.id, f.member_id, mb.display_name, f.rating, f.comment, f.updated_at, app.is_self(f.member_id) AS mine
         FROM meal_feedback f JOIN members mb ON mb.id = f.member_id
        WHERE f.menu_id = $1 ORDER BY f.updated_at DESC`,
      [menuId]
    )
  ).rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberName: r.display_name,
    rating: r.rating,
    comment: r.comment ?? null,
    updatedAt: iso(r.updated_at)!,
    mine: !!r.mine,
  }));
  return { menuId, date: m.date, meal: m.meal, summary: s ? { avg: Number(s.avg_rating), count: Number(s.ratings) } : null, items };
}

export async function putFeedback(tx: Tx, menuId: string, b: { rating: number; comment?: string | null }) {
  const p = await perms(tx);
  if (!p.me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  const exists = (await tx.query("SELECT 1 FROM meal_menus WHERE id = $1", [menuId])).rowCount;
  if (!exists) throw notFound("Không tìm thấy bữa ăn.");
  await tx.query(
    `INSERT INTO meal_feedback (menu_id, member_id, rating, comment) VALUES ($1, $2, $3, $4)
     ON CONFLICT (menu_id, member_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
    [menuId, p.me, b.rating, b.comment ?? null]
  );
}

export async function deleteFeedback(tx: Tx, menuId: string, feedbackId?: string | null) {
  const r = feedbackId
    ? await tx.query("DELETE FROM meal_feedback WHERE id = $1 AND menu_id = $2", [feedbackId, menuId])
    : await tx.query("DELETE FROM meal_feedback WHERE menu_id = $1 AND member_id = app.current_member_id()", [menuId]);
  if (!r.rowCount) throw notFound("Không có góp ý nào để xóa (hoặc bạn không có quyền xóa).");
}

// ---------------------------------------------------------------------
// Khảo sát món ăn
// ---------------------------------------------------------------------
export async function listSurveys(tx: Tx): Promise<MealSurveyDto[]> {
  const surveys = (
    await tx.query(
      `SELECT s.id, s.title, s.description, s.max_choices, s.allow_suggestions, s.target_week::text AS target_week, s.closes_at, s.created_at,
              (s.status = 'open' AND (s.closes_at IS NULL OR s.closes_at > now())) AS is_open, cb.display_name AS created_by_name
         FROM meal_surveys s LEFT JOIN members cb ON cb.user_id = s.created_by
        ORDER BY (s.status = 'open' AND (s.closes_at IS NULL OR s.closes_at > now())) DESC, s.created_at DESC
        LIMIT 10`
    )
  ).rows;
  if (!surveys.length) return [];
  const ids = surveys.map((s) => s.id);
  const options = (
    await tx.query(
      `SELECT o.id, o.survey_id, o.label, sb.display_name AS suggested_by
         FROM meal_survey_options o LEFT JOIN members sb ON sb.id = o.suggested_by
        WHERE o.survey_id = ANY($1::uuid[]) ORDER BY o.sort_order, o.created_at`,
      [ids]
    )
  ).rows;
  const tally = new Map<string, number>();
  const voters = new Map<string, number>();
  for (const t of (await tx.query("SELECT survey_id, option_id, votes, voters FROM app.fn_meal_survey_tally($1::uuid[])", [ids])).rows) {
    tally.set(t.option_id, Number(t.votes));
    voters.set(t.survey_id, Number(t.voters));
  }
  const mine = new Set(
    (await tx.query("SELECT option_id FROM meal_survey_votes WHERE survey_id = ANY($1::uuid[]) AND member_id = app.current_member_id()", [ids])).rows.map(
      (r) => r.option_id as string
    )
  );
  return surveys.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    maxChoices: s.max_choices,
    allowSuggestions: s.allow_suggestions,
    targetWeek: s.target_week ?? null,
    status: s.is_open ? "open" : "closed",
    closesAt: iso(s.closes_at),
    createdBy: s.created_by_name ?? null,
    createdAt: iso(s.created_at)!,
    voters: voters.get(s.id) ?? 0,
    options: options
      .filter((o) => o.survey_id === s.id)
      .map((o) => ({ id: o.id, label: o.label, votes: tally.get(o.id) ?? 0, suggestedBy: o.suggested_by ?? null, mine: mine.has(o.id) })),
  }));
}

export async function createSurvey(
  tx: Tx,
  b: { title: string; description?: string | null; maxChoices: number; allowSuggestions: boolean; targetWeek?: string | null; closesOn?: string | null; options: string[] }
) {
  await requireManage(tx, "tạo phiếu khảo sát món");
  const labels = [...new Map(b.options.map((o) => [o.trim().toLowerCase(), o.trim()])).values()].filter((o) => o.length >= 2);
  if (labels.length < 2) throw new ApiError(400, "VALIDATION_FAILED", "Cần ít nhất 2 món khác nhau để bình chọn.");
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO meal_surveys (title, description, max_choices, allow_suggestions, target_week, closes_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::date IS NULL THEN NULL ELSE date_trunc('week', $5::date)::date END,
               CASE WHEN $6::date IS NULL THEN NULL ELSE (($6::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') END)
       RETURNING id`,
      [b.title.trim(), b.description?.trim() || null, Math.min(b.maxChoices, labels.length), b.allowSuggestions, b.targetWeek ?? null, b.closesOn ?? null]
    )
  ).rows[0].id;
  let i = 0;
  for (const label of labels) await tx.query("INSERT INTO meal_survey_options (survey_id, label, sort_order) VALUES ($1, $2, $3)", [id, label, i++]);
  return { id };
}

export async function setSurveyStatus(tx: Tx, id: string, status: "open" | "closed") {
  await requireManage(tx, "đóng / mở khảo sát");
  const r = await tx.query(
    `UPDATE meal_surveys
        SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() END,
            closes_at = CASE WHEN $2 = 'open' AND closes_at <= now() THEN NULL ELSE closes_at END
      WHERE id = $1`,
    [id, status]
  );
  if (!r.rowCount) throw notFound("Không tìm thấy phiếu khảo sát.");
}

export async function deleteSurvey(tx: Tx, id: string) {
  await requireManage(tx, "xóa khảo sát");
  const r = await tx.query("DELETE FROM meal_surveys WHERE id = $1", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy phiếu khảo sát.");
}

export async function voteSurvey(tx: Tx, id: string, optionIds: string[]) {
  const p = await perms(tx);
  if (!p.me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  if (!p.register) throw forbidden("Bạn không có quyền bình chọn món.");
  const s = (await tx.query("SELECT max_choices FROM meal_surveys WHERE id = $1", [id])).rows[0];
  if (!s) throw notFound("Không tìm thấy phiếu khảo sát.");
  const uniq = [...new Set(optionIds)];
  if (uniq.length > s.max_choices) throw new ApiError(422, "BR-MEAL-22", `Khảo sát chỉ cho chọn tối đa ${s.max_choices} món.`);
  await tx.query("DELETE FROM meal_survey_votes WHERE survey_id = $1 AND member_id = $2", [id, p.me]);
  for (const o of uniq) await tx.query("INSERT INTO meal_survey_votes (survey_id, option_id, member_id) VALUES ($1, $2, $3)", [id, o, p.me]);
}

export async function suggestOption(tx: Tx, id: string, label: string) {
  const p = await perms(tx);
  if (!p.manage && !p.register) throw forbidden("Bạn không có quyền đề xuất món.");
  const exists = (await tx.query("SELECT 1 FROM meal_surveys WHERE id = $1", [id])).rowCount;
  if (!exists) throw notFound("Không tìm thấy phiếu khảo sát.");
  await tx.query(
    `INSERT INTO meal_survey_options (survey_id, label, sort_order, suggested_by)
     VALUES ($1, $2, COALESCE((SELECT max(sort_order) + 1 FROM meal_survey_options WHERE survey_id = $1), 0), $3)`,
    [id, label.trim(), p.manage ? null : p.me]
  );
}

// ---------------------------------------------------------------------
// Cấu hình bếp (khóa meal.* do Ban Ẩm thực sửa; bật/tắt phân hệ cần setting.write)
// ---------------------------------------------------------------------
export async function updateMealSettings(
  tx: Tx,
  b: { enabled?: boolean; lunchCutoff?: string; dinnerCutoff?: string }
) {
  const set = async (key: string, value: unknown, label: string) => {
    const r = await tx.query("UPDATE settings SET value = $2::jsonb, updated_by = app.current_user_id() WHERE key = $1", [key, JSON.stringify(value)]);
    if (!r.rowCount) throw forbidden(`Bạn không có quyền đổi ${label}.`);
  };
  if (b.enabled !== undefined) await set("feature.meals.enabled", b.enabled, "trạng thái bật/tắt phân hệ Bếp & Cơm (cần quyền Cài đặt hệ thống)");
  for (const [meal, v] of [["lunch", b.lunchCutoff], ["dinner", b.dinnerCutoff]] as const) {
    if (v === undefined) continue;
    await set(`meal.${meal}_cutoff_time`, v, `giờ chốt suất ${meal === "lunch" ? "trưa" : "tối"}`);
    // Các bữa từ ngày mai còn mở đăng ký theo giờ chốt mới (bữa hôm nay giữ nguyên để không bất ngờ khóa / mở sổ)
    await tx.query(
      `UPDATE meal_menus SET cutoff_at = app.fn_meal_default_cutoff(menu_date, meal_type)
        WHERE menu_date > app.local_today() AND meal_type = $1::meal_type_t AND status IN ('draft', 'open')`,
      [meal]
    );
  }
  return readSettings(tx);
}

// ---------------------------------------------------------------------
// Tóm tắt hôm nay (cho trang Tổng quan)
// ---------------------------------------------------------------------
export async function getMealsSummary(tx: Tx): Promise<MealsSummaryDto> {
  const p = await perms(tx);
  const rows = (
    await tx.query(
      `SELECT mt.meal::text AS meal, m.id, m.dishes,
              COALESCE(m.cutoff_at, app.fn_meal_default_cutoff(app.local_today(), mt.meal)) AS cutoff_at,
              now() > COALESCE(m.cutoff_at, app.fn_meal_default_cutoff(app.local_today(), mt.meal)) AS past,
              COALESCE((SELECT array_agg(mb.display_name ORDER BY CASE c.role_label WHEN 'lead' THEN 0 ELSE 1 END)
                          FROM meal_menu_cooks c JOIN members mb ON mb.id = c.member_id WHERE c.menu_id = m.id), '{}') AS cooks,
              mr.will_eat
         FROM (VALUES ('lunch'::meal_type_t), ('dinner'::meal_type_t)) AS mt(meal)
         LEFT JOIN meal_menus m ON m.menu_date = app.local_today() AND m.meal_type = mt.meal
         LEFT JOIN meal_registrations mr ON mr.menu_id = m.id AND mr.member_id = app.current_member_id()
        ORDER BY 1 DESC`
    )
  ).rows;
  const counts = new Map<string, { eaters: number; guests: number }>();
  if (p.manage || p.register)
    for (const c of (await tx.query("SELECT menu_id, eaters, guests FROM app.fn_meal_counts(app.local_today(), app.local_today())")).rows)
      counts.set(c.menu_id, { eaters: Number(c.eaters), guests: Number(c.guests) });
  const extra = (
    await tx.query(
      `SELECT (SELECT count(*)::int FROM members WHERE status = 'active' AND deleted_at IS NULL) AS active,
              (SELECT count(*)::int FROM pantry_items p WHERE p.is_active AND p.par_level > 0 AND p.qty_on_hand < p.par_level * 0.4) AS urgent,
              (SELECT count(*)::int FROM pantry_items p WHERE p.is_active AND p.par_level > 0 AND p.qty_on_hand < p.par_level
                                                         AND p.qty_on_hand >= p.par_level * 0.4) AS low,
              (SELECT count(*)::int FROM pantry_restock_requests WHERE status = 'open') AS req,
              (SELECT count(*)::int FROM shopping_list_items WHERE NOT is_purchased) AS shop,
              (SELECT json_build_object('id', s.id, 'title', s.title) FROM meal_surveys s
                WHERE s.status = 'open' AND (s.closes_at IS NULL OR s.closes_at > now()) ORDER BY s.created_at DESC LIMIT 1) AS survey`
    )
  ).rows[0];
  const slot = (meal: MealType) => {
    const r = rows.find((x) => x.meal === meal)!;
    const c = r.id ? counts.get(r.id) : undefined;
    return {
      eaters: c?.eaters ?? 0,
      guests: c?.guests ?? 0,
      cutoffAt: iso(r.cutoff_at)!,
      pastCutoff: !!r.past,
      dishes: (r.dishes ?? []) as string[],
      cooks: (r.cooks ?? []) as string[],
    };
  };
  const mine = (meal: MealType) => {
    const v = rows.find((x) => x.meal === meal)?.will_eat;
    return v === null || v === undefined ? null : !!v;
  };
  return {
    enabled: p.enabled,
    date: p.today,
    activeMembers: extra.active,
    lunch: slot("lunch"),
    dinner: slot("dinner"),
    mine: { lunch: mine("lunch"), dinner: mine("dinner") },
    pantryUrgent: extra.urgent,
    pantryLow: extra.low,
    openRestockRequests: extra.req,
    shoppingPending: extra.shop,
    openSurvey: extra.survey ?? null,
  };
}
