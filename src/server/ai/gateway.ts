import "server-only";
import { createHash } from "node:crypto";
import type { Ctx } from "../http";
import type { Tx } from "../db";
import { ApiError, conflict, forbidden } from "../errors";
import type { AiOutputMap, AiResultDto, AiTaskCode } from "@/lib/types/ai";
import { AI_LIMITS, providerOrder } from "./config";
import { NoProviderError, ProviderError, generate } from "./providers";
import { PROMPT_VERSION, TASKS, extractJson, parseInput, type Prepared } from "./tasks";

// ---------------------------------------------------------------------
// Cổng AI tập trung (Phần 8.2). Một yêu cầu đi qua:
//   1. kiểm đầu vào + ẩn danh hóa + dựng prompt (chạy dưới quyền người gọi ⇒ RLS)
//   2. giới hạn tốc độ (20/giờ/người) và cache 24 giờ theo băm nội dung
//   3. INSERT ai_jobs ⇒ trigger trg_ai_jobs__gate quyết định: tắt tính năng / chưa đồng ý / vượt ngân sách ⇒ blocked
//   4. gọi Groq (mặc định) → Gemini (dự phòng); kiểm lược đồ đầu ra
//   5. ghi ai_suggestions (chờ người duyệt) + cập nhật ai_jobs (token, chi phí) — bằng vai trò worker
// Không lưu prompt/đầu ra thô (BR-AI-10); lỗi nhà cung cấp chỉ ghi mã trạng thái.
// ---------------------------------------------------------------------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let budgetMonth = "";
/** Bảo đảm có dòng ngân sách của tháng hiện tại (kế thừa hạn mức tháng trước); gate chỉ chặn khi dòng này tồn tại. */
export async function ensureBudgetRow(ctx: Pick<Ctx, "dbAs">) {
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(new Date());
  if (budgetMonth === month) return;
  await ctx.dbAs("luuxa_worker", async (tx) => {
    await tx.query(
      `INSERT INTO ai_budgets (month, limit_vnd, alert_threshold_pct, hard_stop)
       SELECT date_trunc('month', app.local_today())::date,
              COALESCE((SELECT limit_vnd FROM ai_budgets ORDER BY month DESC LIMIT 1), 200000),
              COALESCE((SELECT alert_threshold_pct FROM ai_budgets ORDER BY month DESC LIMIT 1), 80),
              COALESCE((SELECT hard_stop FROM ai_budgets ORDER BY month DESC LIMIT 1), true)
       ON CONFLICT (month) DO NOTHING`,
    );
  });
  budgetMonth = month;
}

interface CachedRow {
  suggestion_id: string;
  job_id: string;
  payload: unknown;
  provider: string | null;
  model: string | null;
  created_at: Date;
}

export async function runAiTask<C extends AiTaskCode>(ctx: Ctx, code: C, rawInput: unknown): Promise<AiResultDto<C>> {
  const def = TASKS[code];
  const input = parseInput(code, rawInput);

  if (!providerOrder().length) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "Chưa cấu hình khóa API cho AI (GROQ_API_KEY hoặc GEMINI_API_KEY trong .env.local). Bạn vẫn có thể làm thủ công như bình thường.");
  }

  // 1–2. Chuẩn bị, giới hạn tốc độ, cache — một transaction đọc dưới quyền người gọi.
  const prep = await ctx.db(async (tx) => {
    const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('ai.use') AS ok")).rows[0]?.ok;
    if (!ok) throw forbidden("Bạn không có quyền dùng tính năng AI.");

    const p = await (def.prepare as (t: Tx, i: unknown) => Promise<Prepared<C>>)(tx, input);

    const hash = sha256(`${code}|${PROMPT_VERSION}|${p.hashInput}`);
    const rate = (
      await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM ai_jobs WHERE requested_by = app.current_user_id() AND created_at > now() - interval '1 hour'")
    ).rows[0].n;
    const cached = (
      await tx.query<CachedRow>(
        `SELECT s.id AS suggestion_id, s.job_id, s.payload, j.provider, j.model, s.created_at
           FROM ai_suggestions s JOIN ai_jobs j ON j.id = s.job_id
          WHERE j.requested_by = app.current_user_id() AND j.task_code = $1 AND j.input_hash = $2 AND j.status = 'succeeded'
            AND s.status IN ('pending','accepted') AND s.created_at > now() - make_interval(hours => $3)
          ORDER BY s.created_at DESC LIMIT 1`,
        [code, hash, AI_LIMITS.cacheHours],
      )
    ).rows[0];
    const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
    return { p, hash, rate, cached, me };
  });

  // Trả lời bằng luật nội bộ (không có ngữ cảnh liên quan): không tạo job, không gọi dịch vụ ngoài.
  if (prep.p.shortCircuit) {
    return { suggestionId: null, jobId: null, taskCode: code, output: prep.p.shortCircuit, provider: null, model: null, cached: false, createdAt: new Date().toISOString() };
  }
  if (prep.cached) {
    return {
      suggestionId: prep.cached.suggestion_id,
      jobId: prep.cached.job_id,
      taskCode: code,
      output: prep.cached.payload as AiOutputMap[C],
      provider: (prep.cached.provider as AiResultDto["provider"]) ?? null,
      model: prep.cached.model,
      cached: true,
      createdAt: prep.cached.created_at.toISOString(),
    };
  }
  if (prep.rate >= AI_LIMITS.perUserPerHour) {
    throw new ApiError(429, "RATE_LIMITED", `Bạn đã dùng AI ${AI_LIMITS.perUserPerHour} lần trong giờ qua — thử lại sau ít phút hoặc làm thủ công.`);
  }

  await ensureBudgetRow(ctx);

  // 3. Tạo job: trigger cổng AI có thể chuyển sang 'blocked' kèm lý do tiếng Việt (commit trước rồi mới báo lỗi).
  const first = providerOrder()[0];
  const entity = prep.p.entity;
  const job = await ctx.db(async (tx) => {
    const r = await tx.query<{ id: string; status: string; blocked_reason: string | null }>(
      `INSERT INTO ai_jobs (task_code, requested_by, subject_member_id, entity_table, entity_id, input_hash, input_ref, provider, model, prompt_version)
       VALUES ($1, app.current_user_id(), $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING id, status, blocked_reason`,
      [code, prep.me, entity?.table ?? null, entity?.id ?? null, prep.hash, JSON.stringify(prep.p.inputRef), first.id, first.model, PROMPT_VERSION],
    );
    return r.rows[0];
  });
  if (job.status === "blocked") throw conflict(job.blocked_reason ?? "Tác vụ AI bị chặn.", "AI_BLOCKED");

  await ctx.dbAs("luuxa_worker", (tx) => tx.query("UPDATE ai_jobs SET status = 'running', started_at = now() WHERE id = $1", [job.id]));

  // 4. Gọi nhà cung cấp; đầu ra sai lược đồ ⇒ thử nhà cung cấp kế (hoặc báo lỗi, người dùng làm thủ công).
  let llm: Awaited<ReturnType<typeof generate<AiOutputMap[C]>>>;
  try {
    llm = await generate({ system: prep.p.system, user: prep.p.user }, (text) => prep.p.parse(extractJson(text)));
  } catch (e) {
    const msg = e instanceof NoProviderError || e instanceof ProviderError ? e.message : "Lỗi không xác định khi gọi AI";
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query("UPDATE ai_jobs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1", [job.id, msg.slice(0, 300)]),
    );
    throw new ApiError(503, "AI_UNAVAILABLE", "Dịch vụ AI đang không phản hồi hoặc trả kết quả không hợp lệ. Bạn hãy làm thủ công như bình thường.");
  }
  const output = llm.value;

  // 5. Ghi gợi ý chờ duyệt + hoàn tất job (trigger cộng chi phí vào ai_usage_daily / ai_budgets).
  const saved = await ctx.dbAs("luuxa_worker", async (tx) => {
    const s = (
      await tx.query<{ id: string; created_at: Date }>(
        `INSERT INTO ai_suggestions (job_id, task_code, entity_table, entity_id, suggestion_type, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id, created_at`,
        [job.id, code, entity?.table ?? "ai_jobs", entity?.id ?? job.id, def.suggestionType, JSON.stringify(output)],
      )
    ).rows[0];
    await tx.query(
      `UPDATE ai_jobs
          SET status = 'succeeded', provider = $2, model = $3, tokens_in = $4, tokens_out = $5, cost_vnd = $6, latency_ms = $7,
              input_ref = input_ref || $8::jsonb, finished_at = now()
        WHERE id = $1`,
      [job.id, llm.provider, llm.model, llm.tokensIn, llm.tokensOut, llm.costVnd, llm.latencyMs, JSON.stringify(llm.failedBefore.length ? { fallbackFrom: llm.failedBefore } : {})],
    );
    return s;
  });

  return { suggestionId: saved.id, jobId: job.id, taskCode: code, output, provider: llm.provider, model: llm.model, cached: false, createdAt: saved.created_at.toISOString() };
}
