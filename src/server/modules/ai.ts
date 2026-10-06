import "server-only";
import { batch, type Tx } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { providerConfigs } from "../ai/config";
import { breakerState } from "../ai/providers";
import { writeConsent } from "./consents";
import {
  AI_CONSENT_PURPOSES,
  AI_TASK_CODES,
  type AiConsentPurpose,
  type AiProviderDto,
  type AiStatusDto,
  type AiSuggestionDto,
  type AiTaskDto,
  type AiUsageDto,
} from "@/lib/types/ai";

const IMPLEMENTED = new Set<string>(AI_TASK_CODES);

export function providerList(): AiProviderDto[] {
  const cfg = providerConfigs();
  return (["groq", "gemini"] as const).map((id) => ({
    id,
    label: cfg[id].label,
    model: cfg[id].model,
    configured: !!cfg[id].apiKey,
    paused: breakerState(id).open,
  }));
}

const PERMS_SQL = "SELECT app.has_permission('ai.use') AS use, app.has_permission('ai.review') AS review, app.has_permission('ai.manage') AS manage";
type AiPerms = { use: boolean; review: boolean; manage: boolean };

async function perms(tx: Tx) {
  const r = (await tx.query<AiPerms>(PERMS_SQL)).rows[0];
  return r;
}

/** Trạng thái cổng AI cho giao diện (AIX-GATE-01): công tắc, nhà cung cấp, đồng ý, danh sách tác vụ. */
export async function getStatus(tx: Tx): Promise<AiStatusDto> {
  // Gộp 4 truy vấn độc lập (quyền, công tắc, đồng ý, danh sách tác vụ): 1 vòng mạng thay vì 4
  const [permsR, masterR, consentR, tasksR] = await batch(tx, [
    [PERMS_SQL],
    ["SELECT app.setting_bool('feature.ai.enabled') AS v"],
    [
      `SELECT COALESCE(app.has_active_consent(app.current_member_id(), 'ai_processing'), false) AS ok,
              COALESCE(app.has_active_consent(app.current_member_id(), 'ai_academic_summary'), false) AS academic`,
    ],
    [
      `SELECT code, name_vi, description, technique, data_class, is_enabled, human_review_required, required_consent_purpose, monthly_budget_vnd
         FROM ai_task_types ORDER BY code`,
    ],
  ]);
  const p = permsR.rows[0] as AiPerms;
  const master = (masterR.rows[0] as { v: boolean }).v;
  const consentRow = consentR.rows[0] as { ok: boolean; academic: boolean };
  const consented = consentRow.ok;
  const consents: Record<AiConsentPurpose, boolean> = { ai_processing: consentRow.ok, ai_academic_summary: consentRow.academic };
  const rows = tasksR.rows;
  const tasks: AiTaskDto[] = rows.map((r) => ({
    code: r.code,
    name: r.name_vi,
    description: r.description,
    technique: r.technique,
    dataClass: r.data_class,
    enabled: r.is_enabled,
    humanReview: r.human_review_required,
    requiredConsent: r.required_consent_purpose,
    monthlyBudgetVnd: r.monthly_budget_vnd === null ? null : Number(r.monthly_budget_vnd),
    implemented: IMPLEMENTED.has(r.code),
  }));
  const providers = providerList();
  const configured = providers.some((x) => x.configured);
  const available = master && configured && p.use ? tasks.filter((t) => t.implemented && t.enabled).map((t) => t.code) : [];
  return { masterEnabled: master, configured, providers, consented, consents, canUse: p.use, canReview: p.review, canManage: p.manage, available, tasks };
}

/**
 * Đồng ý / rút đồng ý một mục đích AI của chính mình (BR-AI-03, BR-AI-09):
 *  ai_processing — "Dùng AI xử lý nội dung do tôi tạo"; ai_academic_summary — "Dùng AI nhận xét điểm học tập của tôi".
 */
export async function setConsent(tx: Tx, granted: boolean, ip: string | null, purpose: AiConsentPurpose = "ai_processing") {
  if (!(AI_CONSENT_PURPOSES as readonly string[]).includes(purpose)) throw badRequest("Mục đích đồng ý không hợp lệ.");
  await writeConsent(tx, granted, ip, purpose);
  return { purpose, consented: granted };
}

/** Bật/tắt một tác vụ và đặt trần ngân sách riêng (AIX-TASK-02). */
export async function updateTask(tx: Tx, code: string, patch: { enabled?: boolean; monthlyBudgetVnd?: number | null }) {
  if (patch.enabled && !IMPLEMENTED.has(code)) {
    throw badRequest("Tác vụ này chưa có bộ xử lý trong ứng dụng nên chưa thể bật.");
  }
  const sets: string[] = [];
  const vals: unknown[] = [code];
  if (patch.enabled !== undefined) {
    vals.push(patch.enabled);
    sets.push(`is_enabled = $${vals.length}`);
  }
  if (patch.monthlyBudgetVnd !== undefined) {
    vals.push(patch.monthlyBudgetVnd);
    sets.push(`monthly_budget_vnd = $${vals.length}`);
  }
  if (!sets.length) throw badRequest("Không có thay đổi nào.");
  const r = await tx.query(`UPDATE ai_task_types SET ${sets.join(", ")} WHERE code = $1 RETURNING code`, vals);
  if (!r.rowCount) {
    const exists = (await tx.query("SELECT 1 FROM ai_task_types WHERE code = $1", [code])).rowCount;
    throw exists ? forbidden("Chỉ người có quyền quản lý AI mới được bật/tắt tác vụ.") : notFound("Không có tác vụ AI này.");
  }
  return { code, ...patch };
}

/** Chi phí tháng này, ngân sách, tỷ lệ chấp nhận và các job gần đây (AIX-USE-01, AIX-BUD-01). Cần ai.manage (RLS). */
export async function getUsage(tx: Tx): Promise<AiUsageDto> {
  // Pha 1 — quyền + tháng hiện tại: 1 vòng mạng thay vì 2
  const [permsR, monthR] = await batch(tx, [[PERMS_SQL], ["SELECT date_trunc('month', app.local_today())::date::text AS m"]]);
  if (!(permsR.rows[0] as AiPerms).manage) throw forbidden("Chỉ người có quyền quản lý AI mới xem được chi phí và nhật ký AI.");
  const month = (monthR.rows[0] as { m: string }).m;
  // Pha 2 — gộp các truy vấn số liệu (chỉ chạy khi có quyền ai.manage, như cũ): 1 vòng mạng thay vì 4
  const [budgetR, byTaskR, accR, jobsR] = await batch(tx, [
    ["SELECT limit_vnd, used_vnd, alert_threshold_pct, hard_stop FROM ai_budgets WHERE month = $1", [month]],
    [
      `SELECT task_code, sum(jobs)::int AS jobs, sum(failed_jobs)::int AS failed, sum(tokens_in) AS tin, sum(tokens_out) AS tout, sum(cost_vnd) AS cost
         FROM ai_usage_daily WHERE usage_date >= $1 GROUP BY task_code ORDER BY task_code`,
      [month],
    ],
    ["SELECT task_code, accepted, rejected, pending FROM v_ai_acceptance ORDER BY task_code"],
    [
      `SELECT id, task_code, status::text AS status, provider, model, cost_vnd, latency_ms, blocked_reason, error_message, created_at
         FROM ai_jobs ORDER BY created_at DESC LIMIT 20`,
    ],
  ]);
  const b = budgetR.rows[0];
  const byTask = byTaskR.rows;
  const acc = accR.rows;
  const jobs = jobsR.rows;
  return {
    month,
    budget: b ? { limitVnd: Number(b.limit_vnd), usedVnd: Number(b.used_vnd), alertThresholdPct: b.alert_threshold_pct, hardStop: b.hard_stop } : null,
    byTask: byTask.map((r) => ({ taskCode: r.task_code, jobs: r.jobs, failedJobs: r.failed, tokensIn: Number(r.tin), tokensOut: Number(r.tout), costVnd: Number(r.cost) })),
    acceptance: acc.map((r) => ({ taskCode: r.task_code, accepted: Number(r.accepted), rejected: Number(r.rejected), pending: Number(r.pending) })),
    recentJobs: jobs.map((r) => ({
      id: r.id,
      taskCode: r.task_code,
      status: r.status,
      provider: r.provider,
      model: r.model,
      costVnd: Number(r.cost_vnd),
      latencyMs: r.latency_ms,
      blockedReason: r.blocked_reason,
      errorMessage: r.error_message,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}

export async function updateBudget(tx: Tx, patch: { limitVnd?: number; alertThresholdPct?: number; hardStop?: boolean }) {
  const month = (await tx.query<{ m: string }>("SELECT date_trunc('month', app.local_today())::date::text AS m")).rows[0].m;
  await tx.query(
    `INSERT INTO ai_budgets (month, limit_vnd, alert_threshold_pct, hard_stop)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (month) DO UPDATE
        SET limit_vnd = COALESCE($5, ai_budgets.limit_vnd),
            alert_threshold_pct = COALESCE($6, ai_budgets.alert_threshold_pct),
            hard_stop = COALESCE($7, ai_budgets.hard_stop)`,
    [month, patch.limitVnd ?? 200000, patch.alertThresholdPct ?? 80, patch.hardStop ?? true, patch.limitVnd ?? null, patch.alertThresholdPct ?? null, patch.hardStop ?? null],
  );
  return getUsage(tx);
}

/** Hàng chờ gợi ý (AIX-SUG-01): người có ai.review thấy mọi gợi ý; người khác chỉ thấy của mình (RLS). */
export async function listSuggestions(tx: Tx, status: string | null): Promise<AiSuggestionDto[]> {
  const rows = (
    await tx.query(
      `SELECT s.id, s.task_code, t.name_vi, s.suggestion_type, s.payload, s.status::text AS status, s.created_at, s.expires_at
         FROM ai_suggestions s JOIN ai_task_types t ON t.code = s.task_code
        WHERE ($1::text IS NULL OR s.status::text = $1)
        ORDER BY s.created_at DESC LIMIT 50`,
      [status],
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    taskCode: r.task_code,
    taskName: r.name_vi,
    suggestionType: r.suggestion_type,
    payload: r.payload,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
  }));
}

/** Người duyệt chấp nhận/từ chối gợi ý (AIX-SUG-02, BR-AI-01) — hàm DB kiểm quyền ai.review. */
export async function decideSuggestion(tx: Tx, id: string, accept: boolean, note: string | null) {
  try {
    await tx.query("SELECT app.fn_decide_ai_suggestion($1, $2, $3)", [id, accept, note]);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42501") throw forbidden("Chỉ người có quyền duyệt gợi ý AI mới được thực hiện thao tác này.");
    if (err.code === "P0002") throw notFound("Không tìm thấy gợi ý AI.");
    if (err.code === "55000" || err.code === "23514") throw conflict(err.message ?? "Gợi ý đã được xử lý.");
    throw e;
  }
  return { id, status: accept ? "accepted" : "rejected" };
}
