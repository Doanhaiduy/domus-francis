import "server-only";
import type { Tx } from "../db";
import type { Ctx } from "../http";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { FINANCE_CALLER_SQL, financeCallerFrom, getReceivingAccount, monthEnd } from "./finance";
import { postToZaloGroup } from "../integrations/zalo";
import { formatVND } from "@/lib/utils";
import type {
  ContributionClaimDto,
  FinanceStatsDto,
  FinanceStatsPeriodDto,
  PaymentMethod,
  RemindResultDto,
  StatsGranularity,
} from "@/lib/types/finance";

// =====================================================================
// Thu quỹ nâng cao (db/app/1012_finance_collection_ops.sql): báo "đã đóng" + xác nhận, nhắc nợ, thống kê theo tháng/quý/năm.
// Đọc các bảng mới trong SAVEPOINT: CSDL chưa nâng cấp ⇒ trả rỗng thay vì làm hỏng trang Thu chi.
// =====================================================================

async function guarded<T>(tx: Tx, fallback: T, fn: () => Promise<T>): Promise<T> {
  await tx.query("SAVEPOINT fin_ops");
  try {
    const r = await fn();
    await tx.query("RELEASE SAVEPOINT fin_ops");
    return r;
  } catch (e) {
    await tx.query("ROLLBACK TO SAVEPOINT fin_ops");
    await tx.query("RELEASE SAVEPOINT fin_ops");
    const code = (e as { code?: string }).code;
    if (code === "42P01" || code === "42883") return fallback; // bảng/hàm chưa có
    throw e;
  }
}

// ---------------------------------------------------------------------
// Báo "đã đóng" / xác nhận
// ---------------------------------------------------------------------
export async function listPendingClaims(tx: Tx, planId: string | null): Promise<ContributionClaimDto[]> {
  return guarded(tx, [], async () => {
    const rows = (
      await tx.query(
        `SELECT c.id, c.contribution_id, c.member_id, ct.plan_id, c.method::text AS method, c.reference_code, c.note, c.created_at
           FROM contribution_claims c JOIN contributions ct ON ct.id = c.contribution_id
          WHERE c.status = 'pending' AND ($1::uuid IS NULL OR ct.plan_id = $1::uuid)
          ORDER BY c.created_at`,
        [planId],
      )
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      contributionId: r.contribution_id,
      memberId: r.member_id,
      planId: r.plan_id,
      method: r.method as PaymentMethod,
      referenceCode: r.reference_code ?? null,
      note: r.note ?? null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });
}

export async function createClaim(tx: Tx, b: { contributionId: string; method: PaymentMethod; referenceCode?: string | null; note?: string | null }): Promise<string> {
  return (
    await tx.query<{ id: string }>("SELECT app.fn_contribution_claim($1, $2::payment_method_t, $3, $4) AS id", [
      b.contributionId,
      b.method,
      b.referenceCode ?? null,
      b.note ?? null,
    ])
  ).rows[0].id;
}

export async function cancelClaim(tx: Tx, id: string) {
  await tx.query("SELECT app.fn_contribution_claim_cancel($1)", [id]);
}

/** Xác nhận (ghi phiếu thu đủ số còn lại, túi quỹ theo hình thức: tiền mặt ⇒ quỹ tiền mặt, còn lại ⇒ ngân hàng) hoặc từ chối. */
export async function decideClaim(tx: Tx, id: string, approve: boolean, note: string | null): Promise<{ paymentId: string | null }> {
  let fundId: string | null = null;
  if (approve) {
    const c = (await tx.query<{ method: string }>("SELECT method::text AS method FROM contribution_claims WHERE id = $1", [id])).rows[0];
    if (!c) throw notFound("Không tìm thấy yêu cầu (hoặc bạn không có quyền xem).");
    const want = c.method === "cash" ? "cash" : "bank";
    const funds = (
      await tx.query<{ id: string; type: string }>(
        "SELECT id, fund_type::text AS type FROM funds WHERE is_active AND deleted_at IS NULL AND fund_type::text IN ('cash', 'bank') ORDER BY CASE fund_type::text WHEN $1 THEN 0 ELSE 1 END, code",
        [want],
      )
    ).rows;
    fundId = funds[0]?.id ?? null;
    if (!fundId) throw new ApiError(422, "NO_FUND", "Chưa có túi quỹ tiền mặt/ngân hàng để ghi thu.");
  }
  const r = await tx.query<{ id: string | null }>("SELECT app.fn_contribution_claim_decide($1, $2, $3, $4) AS id", [id, approve, fundId, note]);
  return { paymentId: r.rows[0].id };
}

// ---------------------------------------------------------------------
// Nhắc nợ
// ---------------------------------------------------------------------
const METHOD_TEXT: Record<string, string> = { cash: "tiền mặt", bank_transfer: "chuyển khoản" };
void METHOD_TEXT;

interface PlanDebtRow {
  contribution_id: string;
  member_id: string;
  name: string;
  full_name: string;
  room: string | null;
  remaining: number;
  due_date: string;
  overdue: boolean;
}

async function planDebts(tx: Tx, planId: string, only: string[] | null): Promise<{ plan: { name: string; code: string; due: string }; rows: PlanDebtRow[] }> {
  const plan = (await tx.query("SELECT name, code, due_date::text AS due FROM contribution_plans WHERE id = $1 AND status <> 'cancelled'", [planId])).rows[0];
  if (!plan) throw notFound("Không tìm thấy kế hoạch thu.");
  const rows = (
    await tx.query<PlanDebtRow>(
      `SELECT ct.id AS contribution_id, ct.member_id, m.display_name AS name, m.full_name, r.code AS room,
              (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd)::bigint AS remaining, ct.due_date::text AS due_date,
              (ct.due_date < app.local_today()) AS overdue
         FROM contributions ct
         JOIN members m ON m.id = ct.member_id AND m.deleted_at IS NULL
         LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
         LEFT JOIN rooms r ON r.id = ra.room_id
        WHERE ct.plan_id = $1 AND ct.status IN ('unpaid', 'partial') AND (ct.amount_due_vnd - ct.discount_vnd - ct.paid_vnd) > 0
          AND ($2::uuid[] IS NULL OR ct.id = ANY ($2::uuid[]))
        ORDER BY r.code NULLS LAST, m.member_no`,
      [planId, only],
    )
  ).rows.map((x) => ({ ...x, remaining: Number(x.remaining) }));
  return { plan: { name: plan.name, code: plan.code, due: plan.due }, rows };
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Tin nhắc cho nhóm (Zalo / sao chép): danh sách chưa đóng + hạn + tài khoản nhận quỹ. */
export async function buildGroupReminderText(tx: Tx, planId: string, only: string[] | null, message: string | null): Promise<{ text: string; count: number }> {
  const { plan, rows } = await planDebts(tx, planId, only);
  const house = (await tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'")).rows[0]?.v ?? null;
  const acc = await getReceivingAccount(tx).catch(() => null);
  const lines: string[] = [`💰 NHẮC ĐÓNG QUỸ${house ? ` — ${house}` : ""}`, `📌 ${plan.name} · hạn ${dmy(plan.due)}`];
  if (rows.length === 0) {
    lines.push("✅ Tất cả anh em đã hoàn tất khoản này. Cảm ơn cả nhà! 🎉");
  } else {
    lines.push(`🔴 Còn ${rows.length} bạn chưa đóng:`);
    rows.forEach((r, i) => lines.push(`${i + 1}. ${r.name}${r.room ? ` (${r.room})` : ""} — ${formatVND(r.remaining)}${r.overdue ? " ⚠ quá hạn" : ""}`));
    if (acc?.account) {
      lines.push(`💳 Chuyển khoản: ${acc.account.bankName} · ${acc.account.accountNo} · ${acc.account.accountName}`);
      lines.push(`📝 Nội dung: ${plan.code} <tên bạn>`);
    } else if (acc?.legacyText) {
      lines.push(`💳 Tài khoản nhận quỹ: ${acc.legacyText}`);
    }
    lines.push("Đóng tiền mặt cho Thủ quỹ hoặc chuyển khoản rồi bấm “Tôi đã đóng” trên web Lưu Xá nhé.");
  }
  if (message) lines.push(`📣 ${message}`);
  lines.push("Pax et Bonum! 🕊️");
  return { text: lines.join("\n"), count: rows.length };
}

export async function remindPlan(
  ctx: Ctx,
  planId: string,
  b: { contributionIds?: string[] | null; app: boolean; zalo: boolean; message?: string | null },
): Promise<RemindResultDto> {
  const msg = b.message?.trim() || null;
  const only = b.contributionIds && b.contributionIds.length ? b.contributionIds : null;
  const out = await ctx.db(async (tx) => {
    const c = financeCallerFrom(await tx.query(FINANCE_CALLER_SQL));
    if (!c.record && !c.planManage) throw forbidden("Chỉ Thủ quỹ, Trưởng nhà hoặc Admin mới nhắc đóng quỹ được.");
    const { rows } = await planDebts(tx, planId, only);
    const ids = rows.map((r) => r.contribution_id);
    let sent = 0;
    let skipped = 0;
    if (b.app && ids.length) {
      const r = (await tx.query<{ r: { sent: number; skipped: number } }>("SELECT app.fn_contribution_remind($1::uuid[], $2) AS r", [ids, msg])).rows[0].r;
      sent = r.sent;
      skipped = r.skipped;
    }
    const group = b.zalo || !b.app ? await buildGroupReminderText(tx, planId, only, msg) : null;
    return { sent, skipped, ids, group };
  });
  let zalo: RemindResultDto["zalo"] = null;
  if (b.zalo && out.group && out.ids.length) {
    zalo = await postToZaloGroup(ctx, "dues_reminder", out.group.text);
    if (zalo.sent) await ctx.db((tx) => guarded(tx, 0, async () => (await tx.query<{ n: number }>("SELECT app.fn_contribution_remind_log_group($1::uuid[]) AS n", [out.ids])).rows[0].n));
  }
  return { sent: out.sent, skipped: out.skipped, groupText: out.group?.text ?? null, zalo };
}

// ---------------------------------------------------------------------
// Thống kê thu chi theo tháng / quý / năm
// ---------------------------------------------------------------------
const FEE_LABEL: Record<string, string> = {
  periodic_dues: "Quỹ định kỳ",
  monthly_dues: "Quỹ sinh hoạt tháng",
  utility: "Tiền điện nước",
  event_fee: "Thu theo sự kiện",
  other: "Khoản thu khác",
};

interface PeriodDef {
  key: string;
  label: string;
  from: string;
  to: string;
}

function buildPeriods(g: StatsGranularity, today: string, count: number): PeriodDef[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const out: PeriodDef[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  if (g === "month") {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const yy = d.getUTCFullYear();
      const mm = d.getUTCMonth() + 1;
      out.push({ key: `${yy}-${pad(mm)}`, label: `Tháng ${pad(mm)}/${yy}`, from: `${yy}-${pad(mm)}-01`, to: monthEnd(`${yy}-${pad(mm)}-01`) });
    }
  } else if (g === "quarter") {
    const q = Math.floor((m - 1) / 3);
    for (let i = count - 1; i >= 0; i--) {
      const idx = y * 4 + q - i;
      const yy = Math.floor(idx / 4);
      const qq = idx % 4;
      const startM = qq * 3 + 1;
      out.push({ key: `${yy}-Q${qq + 1}`, label: `Quý ${qq + 1}/${yy}`, from: `${yy}-${pad(startM)}-01`, to: monthEnd(`${yy}-${pad(startM + 2)}-01`) });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const yy = y - i;
      out.push({ key: String(yy), label: `Năm ${yy}`, from: `${yy}-01-01`, to: `${yy}-12-31` });
    }
  }
  return out;
}

export async function getFinanceStats(tx: Tx, g: StatsGranularity, countIn: number | null): Promise<FinanceStatsDto> {
  const c = financeCallerFrom(await tx.query(FINANCE_CALLER_SQL));
  if (!c.summary) throw forbidden("Bạn không có quyền xem thống kê quỹ.");
  const maxCount = g === "month" ? 24 : g === "quarter" ? 12 : 6;
  const count = Math.min(maxCount, Math.max(1, countIn ?? (g === "month" ? 12 : g === "quarter" ? 8 : 4)));
  const defs = buildPeriods(g, c.today, count);
  if (!defs.length) throw badRequest("Không có kỳ nào để thống kê.");

  const sums = (
    await tx.query<{ key: string; s: Record<string, any> }>( // eslint-disable-line @typescript-eslint/no-explicit-any
      `SELECT p.key, app.fn_finance_summary(p.f::date, p.t::date) AS s
         FROM unnest($1::text[], $2::date[], $3::date[]) AS p(key, f, t) ORDER BY p.f`,
      [defs.map((d) => d.key), defs.map((d) => d.from), defs.map((d) => d.to)],
    )
  ).rows;
  const byKey = new Map(sums.map((r) => [r.key, r.s]));

  // Thu theo loại khoản (theo ngày thu thực tế) — chỉ người xem được toàn bộ khoản thu
  let incomeRows: { key: string; fee_type: string; amount: string }[] = [];
  if (c.contribAll) {
    incomeRows = (
      await tx.query(
        `SELECT p.key, cp.fee_type::text AS fee_type, COALESCE(SUM(a.amount_vnd), 0)::bigint AS amount
           FROM unnest($1::text[], $2::date[], $3::date[]) AS p(key, f, t)
           JOIN contribution_payments pay ON pay.paid_on BETWEEN p.f AND p.t AND pay.voided_at IS NULL
           JOIN contribution_payment_allocations a ON a.payment_id = pay.id
           JOIN contributions ct ON ct.id = a.contribution_id
           JOIN contribution_plans cp ON cp.id = ct.plan_id
          GROUP BY p.key, cp.fee_type`,
        [defs.map((d) => d.key), defs.map((d) => d.from), defs.map((d) => d.to)],
      )
    ).rows;
  }
  const house = (await tx.query<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'org.house_name'")).rows[0]?.v ?? null;

  const periods: FinanceStatsPeriodDto[] = defs.map((d) => {
    const s = byKey.get(d.key) ?? {};
    const income = Number(s.total_in_vnd ?? 0);
    const expense = Number(s.total_out_vnd ?? 0);
    let incomeByType: FinanceStatsPeriodDto["incomeByType"] = null;
    if (c.contribAll) {
      const mine = incomeRows.filter((r) => r.key === d.key).map((r) => ({ type: r.fee_type, label: FEE_LABEL[r.fee_type] ?? "Khoản thu khác", amountVnd: Number(r.amount) }));
      const known = mine.reduce((a, x) => a + x.amountVnd, 0);
      incomeByType = [...mine.filter((x) => x.amountVnd > 0), ...(income - known > 0 ? [{ type: "other", label: "Thu khác (quyên góp, điều chỉnh…)", amountVnd: income - known }] : [])];
    }
    return {
      key: d.key,
      label: d.label,
      from: d.from,
      to: d.to,
      openingVnd: Number(s.opening_balance_vnd ?? 0),
      incomeVnd: income,
      expenseVnd: expense,
      netVnd: income - expense,
      closingVnd: Number(s.closing_balance_vnd ?? 0),
      duesExpectedVnd: Number(s.dues_expected_vnd ?? 0),
      duesCollectedVnd: Number(s.dues_collected_vnd ?? 0),
      collectionRatePct: s.collection_rate_pct === null || s.collection_rate_pct === undefined ? null : Number(s.collection_rate_pct),
      expenseByCategory: (s.expense_by_category ?? []).map((x: Record<string, any>) => ({ code: x.code, name: x.name, color: x.color, amountVnd: Number(x.total_vnd), count: Number(x.count) })), // eslint-disable-line @typescript-eslint/no-explicit-any
      incomeByType,
    };
  });

  const catMap = new Map<string, FinanceStatsDto["expenseByCategory"][number]>();
  for (const p of periods)
    for (const x of p.expenseByCategory) {
      const cur = catMap.get(x.code);
      if (cur) {
        cur.amountVnd += x.amountVnd;
        cur.count += x.count;
      } else catMap.set(x.code, { ...x });
    }
  const typeMap = new Map<string, { type: string; label: string; amountVnd: number }>();
  if (c.contribAll)
    for (const p of periods)
      for (const x of p.incomeByType ?? []) {
        const cur = typeMap.get(x.type);
        if (cur) cur.amountVnd += x.amountVnd;
        else typeMap.set(x.type, { ...x });
      }
  const income = periods.reduce((a, p) => a + p.incomeVnd, 0);
  const expense = periods.reduce((a, p) => a + p.expenseVnd, 0);
  return {
    granularity: g,
    periods,
    totals: {
      incomeVnd: income,
      expenseVnd: expense,
      netVnd: income - expense,
      openingVnd: periods[0].openingVnd,
      closingVnd: periods[periods.length - 1].closingVnd,
      adjustmentVnd: periods[periods.length - 1].closingVnd - periods[0].openingVnd - (income - expense),
    },
    expenseByCategory: [...catMap.values()].sort((a, b) => b.amountVnd - a.amountVnd),
    incomeByType: c.contribAll ? [...typeMap.values()].sort((a, b) => b.amountVnd - a.amountVnd) : null,
    houseName: house,
    generatedAt: new Date().toISOString(),
  };
}
