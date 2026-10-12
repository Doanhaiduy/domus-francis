import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { withTx, type Tx } from "../db";
import { forbidden, notFound } from "../errors";
import { getCalendar } from "./liturgy-calendar";
import { CATEGORY_LABEL, addDaysIso } from "@/lib/events-format";
import { ICS_UID_DOMAIN, buildCalendar, icsFileName, type IcsEvent } from "@/lib/ics";
import type { CalendarFeedCreatedDto, CalendarFeedListDto, CalendarFeedTokenDto } from "@/lib/types/events";

// =====================================================================
// ĐỒNG BỘ LỊCH (.ics, RFC 5545)
//   • Tải một sự kiện: GET /api/v1/events/:id/ics (người xem được sự kiện — RLS).
//   • Lịch cá nhân đăng ký theo đường dẫn bí mật: GET /api/v1/public/calendar/<mã>.ics — Google Calendar / Lịch iPhone tự tải lại định kỳ.
//     Bảng calendar_feed_tokens (db/app/1049) chỉ lưu SHA-256 của mã; tra mã bằng vai trò worker, rồi đọc dữ liệu trong giao dịch luuxa_app
//     CHỈ ĐỌC gắn app.current_user_id = tài khoản của chủ đường dẫn ⇒ RLS lọc đúng như khi người đó mở trang Lịch:
//       - sự kiện họ được xem (không gồm nháp, đã hủy, đã xóa) trong 60 ngày trước → 180 ngày tới;
//       - tuần trực vệ sinh CỦA HỌ (sự kiện cả ngày, kèm tên người trực cùng);
//       - ngày lễ buộc phải check-in đi lễ trong 60 ngày tới (sự kiện cả ngày).
//     Không có dữ liệu riêng tư của người khác (không RSVP, không điểm danh, không đơn xin phép…).
// =====================================================================

const VN = "Asia/Ho_Chi_Minh";
export const FEED_MAX_ACTIVE = 5;
const FEED_PAST_DAYS = 60;
const FEED_FUTURE_DAYS = 180;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Sự kiện của nhà ⇒ VEVENT */
function eventToIcs(r: Record<string, any>, origin: string): IcsEvent {
  const lines: string[] = [];
  if (r.description) lines.push(String(r.description));
  const who = r.organizer_text || r.lead_name;
  if (who) lines.push(`Người chủ trì: ${who}`);
  if (r.requires_attendance) lines.push("Có điểm danh: chụp ảnh tại sự kiện gửi trên ứng dụng Lưu Xá.");
  if (r.cancel_reason && r.status === "cancelled") lines.push(`Đã hủy: ${r.cancel_reason}`);
  const link = `${origin}/lich-su-kien?date=${r.d}`;
  lines.push(`Xem trên ứng dụng: ${link}`);
  return {
    uid: `event-${r.id}@${ICS_UID_DOMAIN}`,
    summary: r.status === "cancelled" ? `[ĐÃ HỦY] ${r.title}` : r.title,
    start: r.starts_at,
    end: r.ends_at,
    location: r.location || null,
    description: lines.join("\n"),
    url: link,
    status: r.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
    categories: [CATEGORY_LABEL[r.cat_code] ?? r.cat_name],
    sequence: Math.max(0, Number(r.version ?? 1) - 1),
    lastModified: r.updated_at,
  };
}

const EVENT_COLS = `e.id, e.title, e.status::text AS status, e.starts_at, e.ends_at, e.version, e.updated_at, e.description, e.organizer_text,
       e.requires_attendance, e.cancel_reason,
       to_char(e.starts_at AT TIME ZONE '${VN}', 'YYYY-MM-DD') AS d,
       COALESCE(NULLIF(e.location_text, ''), rm.name, '') AS location,
       c.code AS cat_code, c.name AS cat_name,
       (SELECT m.display_name FROM event_organizers o JOIN members m ON m.id = o.member_id
         WHERE o.event_id = e.id ORDER BY (o.role_label = 'lead') DESC, m.display_name LIMIT 1) AS lead_name`;

async function houseName(tx: Tx): Promise<string> {
  const v = (await tx.query<{ v: string | null }>("SELECT app.setting_text('org.house_name') AS v")).rows[0]?.v;
  return v?.trim() || "Lưu Xá Phanxicô";
}

/** Tệp .ics của MỘT sự kiện (nút "Thêm vào lịch"). */
export async function eventIcs(tx: Tx, id: string, origin: string): Promise<{ body: string; filename: string }> {
  const r = (
    await tx.query(
      `SELECT ${EVENT_COLS}
         FROM events e JOIN categories c ON c.id = e.category_id LEFT JOIN rooms rm ON rm.id = e.location_room_id
        WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id]
    )
  ).rows[0];
  if (!r) throw notFound("Không tìm thấy sự kiện.");
  const name = await houseName(tx);
  return { body: buildCalendar([eventToIcs(r, origin)], { name }), filename: icsFileName(r.title, r.d) };
}

// ---------------------------------------------------------------------
// Đường dẫn lịch cá nhân (quản lý bởi chính chủ — RLS calendar_feed_tokens)
// ---------------------------------------------------------------------
const toToken = (r: Record<string, any>): CalendarFeedTokenDto => ({
  id: r.id,
  label: r.label ?? null,
  createdAt: (r.created_at as Date).toISOString(),
  lastUsedAt: r.last_used_at ? (r.last_used_at as Date).toISOString() : null,
});

export async function listFeedTokens(tx: Tx): Promise<CalendarFeedListDto> {
  const rows = (
    await tx.query(
      `SELECT id, label, created_at, last_used_at FROM calendar_feed_tokens
        WHERE member_id = app.current_member_id() AND revoked_at IS NULL ORDER BY created_at DESC`
    )
  ).rows;
  return { items: rows.map(toToken), max: FEED_MAX_ACTIVE };
}

export const feedUrl = (origin: string, token: string) => `${origin}/api/v1/public/calendar/${token}.ics`;

export async function createFeedToken(tx: Tx, label: string | null | undefined, origin: string): Promise<CalendarFeedCreatedDto> {
  const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0]?.id;
  if (!me) throw forbidden("Tài khoản chưa gắn hồ sơ thành viên — không tạo được đường dẫn lịch.");
  const token = randomBytes(32).toString("base64url");
  const r = (
    await tx.query(
      "INSERT INTO calendar_feed_tokens (member_id, token_hash, label) VALUES ($1, $2, $3) RETURNING id, label, created_at, last_used_at",
      [me, sha256(token), label?.trim() || null]
    )
  ).rows[0];
  const url = feedUrl(origin, token);
  return { item: toToken(r), url, webcalUrl: url.replace(/^https?:\/\//, "webcal://") };
}

export async function revokeFeedToken(tx: Tx, id: string) {
  const r = await tx.query("UPDATE calendar_feed_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy đường dẫn lịch (hoặc đã thu hồi).");
}

// ---------------------------------------------------------------------
// Lịch công khai theo mã bí mật
// ---------------------------------------------------------------------
export function isFeedTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token);
}

interface FeedOwner {
  tokenId: string;
  userId: string;
  memberId: string;
  name: string;
}

/** Tra chủ đường dẫn (worker); null nếu mã sai / đã thu hồi / tài khoản không còn hoạt động. Ghi lượt dùng (tối đa 1 lần/15 phút). */
export async function resolveFeedToken(token: string, requestId: string): Promise<FeedOwner | null> {
  if (!isFeedTokenFormat(token)) return null;
  return withTx({ requestId }, "luuxa_worker", async (tx) => {
    const r = (
      await tx.query<{ id: string; member_id: string; user_id: string; name: string; touch: boolean }>(
        `SELECT t.id, t.member_id, m.user_id, m.display_name AS name,
                (t.last_used_at IS NULL OR t.last_used_at < now() - interval '15 minutes') AS touch
           FROM calendar_feed_tokens t
           JOIN members m ON m.id = t.member_id
           JOIN users u ON u.id = m.user_id
          WHERE t.token_hash = $1 AND t.revoked_at IS NULL
            AND m.deleted_at IS NULL AND m.status IN ('active', 'on_leave')
            AND u.deleted_at IS NULL AND u.status = 'active'`,
        [sha256(token)]
      )
    ).rows[0];
    if (!r) return null;
    if (r.touch) await tx.query("UPDATE calendar_feed_tokens SET last_used_at = now() WHERE id = $1", [r.id]);
    return { tokenId: r.id, userId: r.user_id, memberId: r.member_id, name: r.name };
  });
}

/** Dựng lịch .ics của chủ đường dẫn — đọc dưới RLS của chính người đó (giao dịch chỉ đọc). */
export async function buildFeed(owner: FeedOwner, o: { requestId: string; ip: string | null; origin: string }): Promise<string> {
  return withTx({ userId: owner.userId, requestId: o.requestId, ip: o.ip, readOnly: true }, "luuxa_app", async (tx) => {
    const today = (await tx.query<{ d: string }>("SELECT app.local_today()::text AS d")).rows[0].d;
    const from = addDaysIso(today, -FEED_PAST_DAYS);
    const to = addDaysIso(today, FEED_FUTURE_DAYS);
    const out: IcsEvent[] = [];

    // 1) Sự kiện người này được xem (RLS events__select: event.read, không nháp của người khác) — bỏ nháp, đã hủy, đã xóa
    const events = (
      await tx.query(
        `SELECT ${EVENT_COLS}
           FROM events e JOIN categories c ON c.id = e.category_id LEFT JOIN rooms rm ON rm.id = e.location_room_id
          WHERE e.deleted_at IS NULL AND e.status NOT IN ('draft', 'cancelled')
            AND e.starts_at >= ($1::date::timestamp AT TIME ZONE '${VN}')
            AND e.starts_at < (($2::date + 1)::timestamp AT TIME ZONE '${VN}')
          ORDER BY e.starts_at
          LIMIT 1500`,
        [from, to]
      )
    ).rows;
    for (const r of events) out.push(eventToIcs(r, o.origin));

    // 2) Tuần trực vệ sinh sân nhà của chính người này
    const weeks = (
      await tx.query<{ id: string; week_start: string; note: string | null; others: string[] }>(
        `SELECT w.id, w.week_start::text AS week_start, w.note,
                COALESCE((SELECT array_agg(m.display_name ORDER BY m.display_name)
                            FROM duty_week_members x JOIN members m ON m.id = x.member_id
                           WHERE x.week_id = w.id AND x.member_id <> app.current_member_id()), '{}') AS others
           FROM duty_weeks w
           JOIN duty_week_members wm ON wm.week_id = w.id AND wm.member_id = app.current_member_id()
          WHERE w.week_start BETWEEN $1::date - 6 AND $2::date
          ORDER BY w.week_start`,
        [from, to]
      )
    ).rows;
    for (const w of weeks) {
      const desc = [
        w.others.length ? `Trực cùng: ${w.others.join(", ")}.` : null,
        w.note ? `Ghi chú: ${w.note}` : null,
        `Xem lịch trực: ${o.origin}/hau-can?tab=truc-nhat`,
      ].filter(Boolean);
      out.push({
        uid: `duty-${w.id}-${owner.memberId}@${ICS_UID_DOMAIN}`,
        summary: "🧹 Trực vệ sinh sân nhà",
        allDay: { from: w.week_start, to: addDaysIso(w.week_start, 6) },
        description: desc.join("\n"),
        url: `${o.origin}/hau-can?tab=truc-nhat`,
        transparent: true,
      });
    }

    // 3) Ngày lễ buộc phải check-in đi lễ (lịch phụng vụ của nhà) — nếu lỗi thì bỏ qua phần này, không hỏng cả lịch
    await tx.query("SAVEPOINT feed_liturgy");
    try {
      const cal = await getCalendar(tx, { from: today, to: addDaysIso(today, 59) });
      for (const d of cal.days) {
        if (!d.requirement) continue;
        out.push({
          uid: `mass-${d.date}-${owner.memberId}@${ICS_UID_DOMAIN}`,
          summary: `⛪ Lễ buộc: ${d.requirement.occasion === "sunday" ? d.title : d.requirement.label}`,
          allDay: { from: d.date, to: d.date },
          description: [
            d.title,
            `Nhớ check-in đi lễ trên ứng dụng${d.requirement.evidenceRequired ? " (cần ảnh minh chứng)" : ""} — hạn ${d.requirement.deadline.slice(8, 10)}/${d.requirement.deadline.slice(5, 7)}.`,
            `${o.origin}/lich-su-kien?date=${d.date}`,
          ].join("\n"),
          url: `${o.origin}/lich-su-kien?date=${d.date}`,
          transparent: true,
        });
      }
      await tx.query("RELEASE SAVEPOINT feed_liturgy");
    } catch (e) {
      await tx.query("ROLLBACK TO SAVEPOINT feed_liturgy");
      console.error("[calendar-feed] bỏ qua lịch lễ buộc:", (e as Error).message);
    }

    const house = await houseName(tx);
    return buildCalendar(out, {
      name: house,
      description: `Lịch sinh hoạt ${house} của ${owner.name} — tự cập nhật từ ứng dụng Lưu Xá.`,
      refreshMinutes: 120,
    });
  });
}
