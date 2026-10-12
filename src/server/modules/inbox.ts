import "server-only";
import { batch, type Tx } from "../db";
import { addDays } from "@/lib/duty-format";
import { expenseLink, planLink } from "@/lib/types/finance";
import { INBOX_KIND_LABEL, INBOX_KIND_ORDER, INBOX_KIND_PERMISSIONS, type InboxDto, type InboxItem, type InboxKind } from "@/lib/types/inbox";

// =====================================================================
// Hộp "Việc cần xử lý" của người quản lý — GET /api/v1/inbox (thẻ ở Tổng quan, số trên thanh bên / tab con / nút "Thêm") và bước cron
// manager-digest (tin tóm tắt việc QUÁ HẠN mỗi sáng).
//   • Mỗi loại việc chỉ được đếm khi người xem có quyền xử lý loại đó (INBOX_KIND_PERMISSIONS) — điều kiện quyền nằm NGAY trong câu SQL nên
//     thành viên thường không bao giờ thấy "việc" là đơn / khoản của chính mình.
//   • Mọi câu chạy dưới RLS của người xem (ctx.db) và gửi trong MỘT vòng mạng (batch).
//   • `overdue` = số việc quá hạn / gấp trong `count` ⇒ mục tô đỏ (`urgent`) + đưa vào tin tóm tắt buổi sáng.
// Ngưỡng "quá hạn": đơn xin phép chờ > 2 ngày hoặc còn < 12 giờ là tới giờ đi; phiếu chi chờ > 3 ngày; báo đã đóng quỹ chờ > 2 ngày;
// đơn đăng ký / tìm hiểu / ủng hộ / check-in lễ chờ > 3 ngày; bảng điểm chờ > 7 ngày; giao dịch ngân hàng chưa khớp > 7 ngày; sự cố quá
// hạn SLA (maintenance_issues.sla_due_at); tuần trực kết thúc > 3 ngày chưa đánh giá; hình phạt quá ngày kết thúc; yêu cầu dữ liệu cá nhân
// còn < 24 giờ tới hạn 72 giờ. Góp ý không bao giờ "quá hạn".
// =====================================================================

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Trang xử lý từng loại việc (đường dẫn + tab). Trang đích đổi tên tab ⇒ sửa tại đây. Thu chi: tên tab của lib/types/finance (FINANCE_TABS). */
export const INBOX_HREF = {
  leave: "/xin-phep",
  expenses: "/thu-chi?tab=chi",
  financeOverview: "/thu-chi?tab=tong-quan",
  donations: "/thu-chi?tab=ung-ho",
  applications: "/thanh-vien?tab=applications",
  dataRequests: "/thanh-vien?tab=data-requests",
  inquiries: "/bai-viet?tab=inquiries",
  calendar: "/lich-su-kien",
  academic: "/hoc-tap",
  issues: "/hau-can?tab=bao-hong",
  duty: "/hau-can?tab=truc-nhat",
  discipline: "/ky-luat",
  feedback: "/gop-y?tab=all",
} as const;

// ---------------------------------------------------------------------
// Định dạng gợi ý
// ---------------------------------------------------------------------
const num = (v: unknown) => Number(v ?? 0) || 0;
const vnd = (v: unknown) => `${Math.round(num(v)).toLocaleString("vi-VN")}đ`;
/** "YYYY-MM-DD" ⇒ "dd/mm" */
const dm = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
/** Khoảng thời gian đã trôi qua: "5 phút trước", "3 giờ trước", "2 ngày trước". */
function ago(v: unknown): string | null {
  if (!v) return null;
  const t = new Date(v as string).getTime();
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 2) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}
/** Giờ + ngày theo giờ Việt Nam: "14:30 13/10". */
const at = (v: unknown) =>
  v ? new Date(v as string).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
const join = (parts: (string | false | null | undefined | 0)[]) => parts.filter(Boolean).join(" · ") || null;

// ---------------------------------------------------------------------
// Định nghĩa từng loại việc
// ---------------------------------------------------------------------
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Điều kiện quyền (có MỘT trong các quyền) — nằm trong từng câu đếm. */
const gate = (k: InboxKind) => `(${INBOX_KIND_PERMISSIONS[k].map((p) => `app.has_permission(${lit(p)})`).join(" OR ")})`;

interface KindDef {
  kind: InboxKind;
  /** Một dòng: n (số việc), overdue (số việc quá hạn/gấp) + cột phụ cho gợi ý / liên kết */
  sql: string;
  href(r: Row): string;
  hint(r: Row): string | null;
  /** Một dòng của tin tóm tắt buổi sáng (chỉ dùng khi overdue > 0) */
  digest(overdue: number): string;
}

const KINDS: KindDef[] = [
  {
    kind: "leave",
    // Không đếm đơn của chính mình (không ai tự duyệt đơn của mình — BR-EVT-07)
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE l.starts_at < now() + interval '12 hours' OR l.created_at < now() - interval '2 days')::int AS overdue,
                 count(*) FILTER (WHERE l.starts_at < now() + interval '12 hours')::int AS soon,
                 count(*) FILTER (WHERE l.created_at < now() - interval '2 days')::int AS old,
                 min(l.created_at) AS oldest
            FROM leave_requests l
           WHERE ${gate("leave")} AND l.status = 'pending' AND l.member_id IS DISTINCT FROM app.current_member_id()`,
    href: () => INBOX_HREF.leave,
    hint: (r) => join([num(r.soon) > 0 && `${r.soon} đơn sắp tới giờ`, num(r.old) > 0 && `${r.old} đơn chờ quá 2 ngày`]) ?? (r.oldest ? `Đơn sớm nhất gửi ${ago(r.oldest)}` : null),
    digest: (o) => `${o} đơn xin phép chờ duyệt đã lâu hoặc sắp tới giờ`,
  },
  {
    kind: "expense_approve",
    // Chỉ phiếu NGƯỜI XEM còn ký được (cùng luật với trigger duyệt chi — db/app/1044): phiếu mình lập / mình ứng tiền / đã ký vòng này không tính
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE COALESCE(ev.submitted_at, ev.created_at) < now() - interval '3 days')::int AS overdue,
                 COALESCE(sum(ev.amount_vnd), 0)::bigint AS total_vnd,
                 CASE WHEN count(*) = 1 THEN min(ev.id::text) END AS one_id
            FROM expense_vouchers ev
           WHERE ${gate("expense_approve")} AND ev.status = 'pending_approval' AND app.fn_expense_can_sign(ev.id)`,
    href: (r) => (r.one_id ? expenseLink(r.one_id) : INBOX_HREF.expenses),
    hint: (r) => join([`Tổng ${vnd(r.total_vnd)}`, num(r.overdue) > 0 && `${r.overdue} phiếu chờ quá 3 ngày`]),
    digest: (o) => `${o} phiếu chi chờ bạn duyệt quá 3 ngày`,
  },
  {
    kind: "expense_pay",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE COALESCE(ev.approved_at, ev.created_at) < now() - interval '3 days')::int AS overdue,
                 COALESCE(sum(ev.amount_vnd), 0)::bigint AS total_vnd,
                 CASE WHEN count(*) = 1 THEN min(ev.id::text) END AS one_id
            FROM expense_vouchers ev
           WHERE ${gate("expense_pay")} AND ev.status = 'approved'`,
    href: (r) => (r.one_id ? expenseLink(r.one_id) : INBOX_HREF.expenses),
    hint: (r) => join([`Cần chi ${vnd(r.total_vnd)}`, num(r.overdue) > 0 && `${r.overdue} phiếu chờ quá 3 ngày`]),
    digest: (o) => `${o} phiếu chi đã duyệt nhưng chưa chi quá 3 ngày`,
  },
  {
    kind: "application",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE a.created_at < now() - interval '3 days')::int AS overdue,
                 min(a.created_at) AS oldest
            FROM member_applications a
           WHERE ${gate("application")} AND a.status IN ('submitted', 'under_review')`,
    href: () => INBOX_HREF.applications,
    hint: (r) => (num(r.overdue) > 0 ? `${r.overdue} đơn chờ quá 3 ngày` : r.oldest ? `Đơn sớm nhất gửi ${ago(r.oldest)}` : null),
    digest: (o) => `${o} đơn đăng ký tài khoản chờ duyệt quá 3 ngày`,
  },
  {
    kind: "inquiry",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE q.created_at < now() - interval '3 days')::int AS overdue,
                 min(q.created_at) AS oldest
            FROM admission_inquiries q
           WHERE ${gate("inquiry")} AND q.status = 'new'`,
    href: () => INBOX_HREF.inquiries,
    hint: (r) => (num(r.overdue) > 0 ? `${r.overdue} người chờ quá 3 ngày chưa được liên hệ` : r.oldest ? `Sớm nhất gửi ${ago(r.oldest)}` : null),
    digest: (o) => `${o} người đăng ký tìm hiểu chờ liên hệ quá 3 ngày`,
  },
  {
    kind: "claim",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE c.created_at < now() - interval '2 days')::int AS overdue,
                 COALESCE(sum(GREATEST(ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd, 0)), 0)::bigint AS total_vnd,
                 CASE WHEN count(DISTINCT ct.plan_id) = 1 THEN min(ct.plan_id::text) END AS plan_id
            FROM contribution_claims c
            LEFT JOIN contributions ct ON ct.id = c.contribution_id
           WHERE ${gate("claim")} AND c.status = 'pending'`,
    href: (r) => (r.plan_id ? planLink(r.plan_id) : INBOX_HREF.financeOverview),
    hint: (r) => join([num(r.total_vnd) > 0 && `Tổng ${vnd(r.total_vnd)}`, num(r.overdue) > 0 && `${r.overdue} khoản chờ quá 2 ngày`]),
    digest: (o) => `${o} khoản báo đã đóng quỹ chờ xác nhận quá 2 ngày`,
  },
  {
    kind: "donation",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE d.created_at < now() - interval '3 days')::int AS overdue,
                 COALESCE(sum(d.amount_vnd), 0)::bigint AS total_vnd
            FROM donations d
           WHERE ${gate("donation")} AND d.status = 'pending'`,
    href: () => INBOX_HREF.donations,
    hint: (r) => join([`Tổng ${vnd(r.total_vnd)}`, num(r.overdue) > 0 && `${r.overdue} khoản chờ quá 3 ngày`]),
    digest: (o) => `${o} khoản ủng hộ chờ xác nhận quá 3 ngày`,
  },
  {
    kind: "bank_line",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE b.txn_date < app.local_today() - 7)::int AS overdue,
                 count(*) FILTER (WHERE b.direction = 'in')::int AS incoming
            FROM bank_statement_lines b
           WHERE ${gate("bank_line")} AND b.match_status = 'unmatched'`,
    href: () => INBOX_HREF.financeOverview,
    hint: (r) => join([num(r.incoming) > 0 && `${r.incoming} khoản tiền vào cần ghi thu`, num(r.overdue) > 0 && `${r.overdue} giao dịch quá 7 ngày`]),
    digest: (o) => `${o} giao dịch ngân hàng chưa khớp quá 7 ngày`,
  },
  {
    kind: "mass_checkin",
    // Không ai tự duyệt check-in của mình
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE c.created_at < now() - interval '3 days')::int AS overdue,
                 min(c.day_date)::text AS oldest_day,
                 count(DISTINCT c.day_date)::int AS days
            FROM mass_checkins c
           WHERE ${gate("mass_checkin")} AND c.status = 'submitted' AND c.member_id IS DISTINCT FROM app.current_member_id()`,
    href: (r) => (r.oldest_day ? `${INBOX_HREF.calendar}?date=${r.oldest_day}` : INBOX_HREF.calendar),
    hint: (r) =>
      join([
        num(r.days) > 1 ? `${r.days} ngày lễ, sớm nhất ${dm(r.oldest_day)}` : r.oldest_day ? `Lễ ngày ${dm(r.oldest_day)}` : null,
        num(r.overdue) > 0 && `${r.overdue} chờ quá 3 ngày`,
      ]),
    digest: (o) => `${o} check-in đi lễ chờ duyệt quá 3 ngày`,
  },
  {
    kind: "transcript",
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE COALESCE(ar.submitted_at, ar.updated_at) < now() - interval '7 days')::int AS overdue
            FROM academic_records ar
           WHERE ${gate("transcript")} AND ar.status = 'submitted' AND ar.member_id IS DISTINCT FROM app.current_member_id()`,
    href: () => INBOX_HREF.academic,
    hint: (r) => (num(r.overdue) > 0 ? `${r.overdue} bảng điểm chờ quá 7 ngày` : null),
    digest: (o) => `${o} bảng điểm chờ xác minh quá 7 ngày`,
  },
  {
    kind: "issue",
    // Việc của người quản lý: sự cố MỚI (chưa tiếp nhận), CHƯA GIAO người phụ trách, hoặc QUÁ HẠN SLA. Sự cố đang có người làm, còn hạn ⇒ không tính.
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE x.late)::int AS overdue,
                 count(*) FILTER (WHERE x.status = 'new')::int AS fresh,
                 count(*) FILTER (WHERE NOT x.assigned)::int AS unassigned
            FROM (SELECT i.status::text AS status,
                         (i.sla_due_at IS NOT NULL AND i.sla_due_at < now()) AS late,
                         EXISTS (SELECT 1 FROM issue_assignments ia WHERE ia.issue_id = i.id AND ia.unassigned_at IS NULL) AS assigned
                    FROM maintenance_issues i
                   WHERE ${gate("issue")} AND i.status IN ('new', 'in_progress', 'waiting_parts')) x
           WHERE x.status = 'new' OR x.late OR NOT x.assigned`,
    href: () => INBOX_HREF.issues,
    hint: (r) => join([num(r.overdue) > 0 && `${r.overdue} quá hạn`, num(r.fresh) > 0 && `${r.fresh} chưa tiếp nhận`, num(r.unassigned) > 0 && `${r.unassigned} chưa giao người`]),
    digest: (o) => `${o} sự cố quá hạn xử lý`,
  },
  {
    kind: "duty_review",
    // Tuần đã kết thúc trong 5 tuần gần đây, có người trực, chưa đánh giá (tuần cũ hơn coi như đã qua — không nhắc mãi)
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE w.week_start + 6 < app.local_today() - 3)::int AS overdue,
                 max(w.week_start)::text AS latest
            FROM duty_weeks w
           WHERE ${gate("duty_review")} AND w.reviewed_at IS NULL
             AND w.week_start + 6 < app.local_today() AND w.week_start + 6 >= app.local_today() - 35
             AND EXISTS (SELECT 1 FROM duty_week_members wm WHERE wm.week_id = w.id)`,
    href: () => INBOX_HREF.duty,
    hint: (r) => {
      if (!r.latest) return null;
      const range = `${dm(r.latest)} – ${dm(addDays(r.latest, 6))}`;
      return num(r.n) > 1 ? `${r.n} tuần, gần nhất ${range}` : `Tuần ${range}`;
    },
    digest: (o) => `${o} tuần trực đã qua chưa đánh giá`,
  },
  {
    kind: "discipline_overdue",
    // Cùng cách tính giai đoạn "overdue" của trang Vi phạm (discipline.ts PHASE_SQL)
    sql: `SELECT count(*)::int AS n, count(*)::int AS overdue, min(r.penalty_ends_on)::text AS oldest_end
            FROM discipline_records r
            JOIN members m ON m.id = r.member_id AND m.deleted_at IS NULL
           WHERE ${gate("discipline_overdue")} AND r.status = 'open' AND r.penalty_kind <> 'none'
             AND r.penalty_ends_on IS NOT NULL AND r.penalty_ends_on < app.local_today()`,
    href: () => INBOX_HREF.discipline,
    hint: (r) => (r.oldest_end ? `Hết hạn chấp hành từ ${dm(r.oldest_end)}` : null),
    digest: (o) => `${o} hình phạt quá hạn chưa chấp hành xong`,
  },
  {
    kind: "feedback",
    sql: `SELECT count(*)::int AS n, 0 AS overdue, min(f.created_at) AS oldest
            FROM app_feedback f
           WHERE ${gate("feedback")} AND f.status = 'new'`,
    href: () => INBOX_HREF.feedback,
    hint: (r) => (r.oldest ? `Sớm nhất gửi ${ago(r.oldest)}` : null),
    digest: (o) => `${o} góp ý mới`,
  },
  {
    kind: "data_request",
    // Hạn trả lời 72 giờ (data_subject_requests.due_at)
    sql: `SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE d.due_at < now() + interval '24 hours')::int AS overdue,
                 count(*) FILTER (WHERE d.due_at < now())::int AS late,
                 min(d.due_at) AS next_due
            FROM data_subject_requests d
           WHERE ${gate("data_request")} AND d.status IN ('received', 'in_progress')`,
    href: () => INBOX_HREF.dataRequests,
    hint: (r) =>
      num(r.late) > 0
        ? `${r.late} yêu cầu đã quá hạn 72 giờ`
        : num(r.overdue) > 0
          ? `${r.overdue} yêu cầu sắp hết hạn trả lời`
          : r.next_due
            ? `Hạn trả lời ${at(r.next_due)}`
            : null,
    digest: (o) => `${o} yêu cầu về dữ liệu cá nhân sắp hoặc đã quá hạn 72 giờ`,
  },
];

const KIND_DEF = new Map(KINDS.map((k) => [k.kind, k]));
/** Quyền của người xem cho từng loại việc — một dòng, mỗi cột một loại. */
const PERMS_SQL = `SELECT ${KINDS.map((k) => `${gate(k.kind)} AS "${k.kind}"`).join(",\n       ")}`;
const ORDER = new Map(INBOX_KIND_ORDER.map((k, i) => [k, i]));

/** Hộp việc của người đang đăng nhập (tx là transaction luuxa_app có người dùng — RLS áp dụng). MỘT vòng mạng. */
export async function getInbox(tx: Tx): Promise<InboxDto> {
  const [permR, ...counts] = await batch(tx, [[PERMS_SQL], ...KINDS.map((k) => [k.sql] as const)]);
  const perms = (permR.rows[0] ?? {}) as Record<string, boolean>;
  const items: InboxItem[] = [];
  KINDS.forEach((k, i) => {
    if (perms[k.kind] !== true) return;
    const r = (counts[i]?.rows[0] ?? {}) as Row;
    const count = num(r.n);
    if (count <= 0) return;
    const overdue = Math.min(count, num(r.overdue));
    items.push({ kind: k.kind, label: INBOX_KIND_LABEL[k.kind], count, href: k.href(r), urgent: overdue > 0, overdue, hint: k.hint(r) });
  });
  items.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || (ORDER.get(a.kind) ?? 99) - (ORDER.get(b.kind) ?? 99));
  return {
    total: items.reduce((s, i) => s + i.count, 0),
    eligible: KINDS.some((k) => perms[k.kind] === true),
    items,
    generatedAt: new Date().toISOString(),
  };
}

export interface InboxDigest {
  title: string;
  body: string;
  /** Tổng số việc quá hạn */
  overdue: number;
}

/** Tin tóm tắt buổi sáng: chỉ khi có việc QUÁ HẠN (null = không gửi). */
export function inboxDigest(dto: InboxDto): InboxDigest | null {
  const late = dto.items.filter((i) => (i.overdue ?? 0) > 0);
  if (!late.length) return null;
  const overdue = late.reduce((s, i) => s + (i.overdue ?? 0), 0);
  const others = dto.total - overdue;
  const lines = late.map((i) => `• ${KIND_DEF.get(i.kind)?.digest(i.overdue ?? 0) ?? `${i.overdue} ${i.label.toLowerCase()}`}`);
  if (others > 0) lines.push(`Ngoài ra còn ${others} việc khác đang chờ.`);
  lines.push("Mở Tổng quan → “Việc cần xử lý” để xử lý.");
  return { title: `Bạn có ${overdue} việc quá hạn cần xử lý`, body: lines.join("\n"), overdue };
}
