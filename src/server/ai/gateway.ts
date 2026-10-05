import "server-only";
import { createHash } from "node:crypto";
import type { Ctx } from "../http";
import { batch, type Tx } from "../db";
import { ApiError, forbidden } from "../errors";
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

/** Lý do chặn từ trigger cổng AI (có mã quy tắc, tên cấu hình) ⇒ câu tiếng Việt cho người dùng; mã quy tắc trả riêng ở errors[].rule. */
function friendlyBlockReason(raw: string): string {
  if (raw.startsWith("BR-AI-03") && raw.includes("ai_academic_summary")) return "Bạn cần đồng ý cho AI nhận xét điểm học tập của mình trước khi dùng tính năng này.";
  if (raw.startsWith("BR-AI-03")) return "Bạn cần đồng ý cho AI xử lý nội dung của mình trước khi dùng tính năng này.";
  if (raw.startsWith("BR-AI-04")) return "Đã hết ngân sách AI của tháng này. Bạn vẫn làm thủ công được; liên hệ Ban điều hành nếu cần tăng hạn mức.";
  if (raw.startsWith("BR-AI-02")) return "Loại dữ liệu này không được phép gửi tới dịch vụ AI bên ngoài.";
  if (raw.includes("toàn hệ thống")) return "Tính năng AI đang tắt. Bạn vẫn làm thủ công như bình thường.";
  if (raw.includes("chưa được bật")) return "Tính năng AI này chưa được bật.";
  return raw || "Yêu cầu AI bị chặn.";
}

interface CachedRow {
  suggestion_id: string;
  job_id: string;
  payload: unknown;
  provider: string | null;
  model: string | null;
  created_at: Date;
}

/** `force`: bỏ qua cache (nút "Tạo lại") — vẫn chịu giới hạn tốc độ và ngân sách. */
export async function runAiTask<C extends AiTaskCode>(ctx: Ctx, code: C, rawInput: unknown, opts: { force?: boolean } = {}): Promise<AiResultDto<C>> {
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
    const scope = p.cacheScope ?? null;
    // Gộp 3 truy vấn độc lập (giới hạn tốc độ, cache, mã thành viên + còn đồng ý không): 1 vòng mạng thay vì 3.
    // Cache chỉ dùng khi người gọi vẫn còn đồng ý mục đích tác vụ yêu cầu (rút đồng ý ⇒ không trả lại kết quả cũ, đi qua cổng DB).
    const [rateR, cachedR, whoR] = await batch(tx, [
      ["SELECT count(*)::int AS n FROM ai_jobs WHERE requested_by = app.current_user_id() AND created_at > now() - interval '1 hour'"],
      opts.force
        ? ["SELECT NULL::uuid AS suggestion_id WHERE false"]
        : [
            `SELECT s.id AS suggestion_id, s.job_id, s.payload, j.provider, j.model, s.created_at
               FROM ai_suggestions s JOIN ai_jobs j ON j.id = s.job_id
              WHERE j.requested_by = app.current_user_id() AND j.task_code = $1 AND j.status = 'succeeded'
                AND s.status IN ('pending','accepted')
                AND (CASE WHEN $4::text IS NOT NULL
                          THEN j.input_ref ->> 'scope' = $4::text AND s.created_at > now() - make_interval(mins => $5::int)
                          ELSE j.input_hash = $2 AND s.created_at > now() - make_interval(hours => $3::int) END)
              ORDER BY s.created_at DESC LIMIT 1`,
            [code, hash, AI_LIMITS.cacheHours, scope, AI_LIMITS.insightCacheMinutes],
          ],
      [
        `SELECT app.current_member_id() AS id,
                COALESCE((SELECT t.required_consent_purpose IS NULL OR app.has_active_consent(app.current_member_id(), t.required_consent_purpose)
                            FROM ai_task_types t WHERE t.code = $1), true) AS consent_ok`,
        [code],
      ],
    ]);
    const rate = (rateR.rows[0] as { n: number }).n;
    const cached = cachedR.rows[0] as CachedRow | undefined;
    const who = whoR.rows[0] as { id: string | null; consent_ok: boolean };
    return { p, hash, rate, cached: who.consent_ok ? cached : undefined, me: who.id };
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
      [
        code,
        prep.me,
        entity?.table ?? null,
        entity?.id ?? null,
        prep.hash,
        JSON.stringify(prep.p.cacheScope ? { ...prep.p.inputRef, scope: prep.p.cacheScope } : prep.p.inputRef),
        first.id,
        first.model,
        PROMPT_VERSION,
      ],
    );
    return r.rows[0];
  });
  if (job.status === "blocked") {
    const raw = job.blocked_reason ?? "";
    const rule = /^(BR-AI-\d+)/.exec(raw)?.[1] ?? null;
    throw new ApiError(409, "AI_BLOCKED", friendlyBlockReason(raw), rule ? [{ field: "rule", message: rule }] : undefined);
  }

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
