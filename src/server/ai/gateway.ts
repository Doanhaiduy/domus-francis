import "server-only";
import { createHash } from "node:crypto";
import type { Ctx } from "../http";
import { batch, type Tx } from "../db";
import { ApiError, forbidden } from "../errors";
import { inBackground, notifyAdminsOnce } from "../ops";
import { AI_TASK_NEEDS, type AiOutputMap, type AiResultDto, type AiTaskCode } from "@/lib/types/ai";
import { AI_LIMITS, cloudflareAccess, providerOrder } from "./config";
import { IMAGE_QUOTA_MESSAGE, NoProviderError, ProviderError, QuotaError, generate, imageQuotaPausedUntil } from "./providers";
import type { ExecResult } from "./shared";
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

interface BudgetRow {
  month: string;
  limit_vnd: number;
  used_vnd: number;
  alert_threshold_pct: number;
  hard_stop: boolean;
}

const BUDGET_SQL =
  "SELECT month::text AS month, limit_vnd, used_vnd, alert_threshold_pct, hard_stop FROM ai_budgets WHERE month = date_trunc('month', app.local_today())::date";

/**
 * Chi phí tháng (sau khi cộng job vừa xong) chạm ngưỡng cảnh báo alert_threshold_pct hoặc hết ngân sách ⇒ báo Admin MỘT lần cho mỗi mức
 * mỗi tháng (khóa "ai-budget:<YYYY-MM>:<mức %>" ở system_post_log — đúng cả khi nhiều instance). Không bao giờ ném lỗi.
 */
async function budgetAlert(b: BudgetRow | undefined) {
  if (!b) return;
  const limit = Number(b.limit_vnd);
  const used = Number(b.used_vnd);
  if (!(limit > 0)) return;
  const pct = (used * 100) / limit;
  const level = pct >= 100 ? 100 : pct >= b.alert_threshold_pct ? b.alert_threshold_pct : null;
  if (level === null) return;
  const ym = b.month.slice(0, 7);
  const mmYyyy = `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
  const money = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
  const after = b.hard_stop ? "tác vụ AI mới sẽ bị chặn tới tháng sau" : "AI vẫn chạy tiếp (không dừng cứng) nhưng chi phí vượt hạn mức";
  await notifyAdminsOnce(
    `ai-budget:${ym}:${level}`,
    level === 100 ? `Đã dùng hết ngân sách AI tháng ${mmYyyy}` : `Chi phí AI tháng ${mmYyyy} đã đạt ${Math.floor(pct)}% ngân sách`,
    level === 100
      ? `Đã dùng ${money(used)} / ${money(limit)}: ${after}. Người dùng vẫn làm thủ công được. Tăng hạn mức ở Cài đặt → Trợ lý AI nếu cần.`
      : `Đã dùng ${money(used)} / ${money(limit)} (ngưỡng cảnh báo ${b.alert_threshold_pct}%). Khi hết ngân sách, ${after}. Xem chi phí / tăng hạn mức ở Cài đặt → Trợ lý AI.`,
    { link: "/cai-dat?tab=ai" },
  );
}

/** Lý do chặn từ trigger cổng AI (có mã quy tắc, tên cấu hình) ⇒ câu tiếng Việt cho người dùng; mã quy tắc trả riêng ở errors[].rule. */
function friendlyBlockReason(raw: string): string {
  if (raw.startsWith("BR-AI-03") && raw.includes("ai_academic_summary")) return "Bạn cần đồng ý cho AI nhận xét điểm học tập của mình trước khi dùng tính năng này.";
  if (raw.startsWith("BR-AI-03")) return "Bạn cần đồng ý cho AI xử lý nội dung của mình trước khi dùng tính năng này.";
  if (raw.startsWith("BR-AI-04")) return "Đã hết ngân sách AI của tháng này. Bạn vẫn làm thủ công được; liên hệ người quản lý nếu cần tăng hạn mức.";
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

/**
 * Hạn mức theo GIỜ cho từng người, tính riêng theo nhóm tác vụ: Trợ lý hỏi đáp (chat nhiều lượt), tạo ảnh (tốn hạn mức neuron Cloudflare),
 * chú thích ảnh, tra cứu; mọi tác vụ còn lại dùng chung hạn mức mặc định. Nhóm này không chiếm phần của nhóm kia.
 */
const RATE_GROUPS: { codes: AiTaskCode[]; limit: number }[] = [
  { codes: ["community.policy_rag"], limit: AI_LIMITS.assistantPerHour },
  { codes: ["content.article_image"], limit: AI_LIMITS.imagePerHour },
  { codes: ["content.image_caption"], limit: AI_LIMITS.captionPerHour },
  { codes: ["content.article_research"], limit: AI_LIMITS.researchPerHour },
];
const RATE_SPECIAL: string[] = RATE_GROUPS.flatMap((g) => g.codes);
function rateScope(code: AiTaskCode): { codes: string[]; inGroup: boolean; limit: number } {
  const g = RATE_GROUPS.find((x) => x.codes.includes(code));
  return g ? { codes: g.codes, inGroup: true, limit: g.limit } : { codes: RATE_SPECIAL, inGroup: false, limit: AI_LIMITS.perUserPerHour };
}

/** Số ảnh AI cả nhà đã tạo từ 00:00 UTC (= 07:00 giờ VN, lúc Cloudflare làm mới 10.000 neuron/ngày). Chạy bằng vai trò worker (RLS ai_jobs chỉ cho xem việc của mình). */
async function imagesToday(ctx: Ctx): Promise<number> {
  return ctx.dbAs("luuxa_worker", async (tx) =>
    (
      await tx.query<{ n: number }>(
        `SELECT COALESCE(sum(COALESCE((input_ref->>'images')::int, 1)), 0)::int AS n FROM ai_jobs
          WHERE task_code = 'content.article_image' AND status IN ('running', 'succeeded')
            AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
      )
    ).rows[0].n,
  );
}

/** `force`: bỏ qua cache (nút "Tạo lại") — vẫn chịu giới hạn tốc độ và ngân sách. */
export async function runAiTask<C extends AiTaskCode>(ctx: Ctx, code: C, rawInput: unknown, opts: { force?: boolean } = {}): Promise<AiResultDto<C>> {
  const def = TASKS[code];
  const input = parseInput(code, rawInput);

  const need = AI_TASK_NEEDS[code] ?? "text";
  if (need === "text" && !providerOrder().length) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "Chưa cấu hình khóa API cho AI (GROQ_API_KEY, CLOUDFLARE_API_TOKEN hoặc GEMINI_API_KEY). Bạn vẫn có thể làm thủ công như bình thường.");
  }
  if (need === "cloudflare" && !cloudflareAccess()) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "Chưa cấu hình Cloudflare Workers AI (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN). Bạn vẫn tải ảnh lên như bình thường.");
  }
  const rscope = rateScope(code);

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
      // Hạn mức giờ tính riêng theo nhóm tác vụ (xem RATE_GROUPS) — nhóm này không chiếm phần của nhóm kia
      [
        "SELECT count(*)::int AS n FROM ai_jobs WHERE requested_by = app.current_user_id() AND created_at > now() - interval '1 hour' AND (task_code = ANY($1::text[])) = $2::boolean",
        [rscope.codes, rscope.inGroup],
      ],
      // Ảnh AI KHÔNG dùng lại kết quả cũ: ảnh chưa được chọn bị dọn sau 24 giờ (tệp mồ côi) nên bản cache có thể trỏ tới ảnh đã mất
      opts.force || code === "content.article_image"
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
  const rateLimit = rscope.limit;
  if (prep.rate >= rateLimit) {
    throw new ApiError(429, "RATE_LIMITED", `Bạn đã dùng AI ${rateLimit} lần trong giờ qua — thử lại sau ít phút hoặc làm thủ công.`);
  }
  // Tạo ảnh: trần cả nhà theo ngày (giữ phần neuron cho văn bản dự phòng/chú thích) + đang tạm dừng vì Cloudflare báo hết hạn mức
  if (code === "content.article_image") {
    const wanted = Number((prep.p.inputRef as { images?: number }).images ?? 1);
    const used = await imagesToday(ctx);
    if (used + wanted > AI_LIMITS.imageDailyCap || (await imageQuotaPausedUntil())) throw new ApiError(429, "AI_QUOTA", IMAGE_QUOTA_MESSAGE);
  }

  await ensureBudgetRow(ctx);

  // 3. Tạo job: trigger cổng AI có thể chuyển sang 'blocked' kèm lý do tiếng Việt (commit trước rồi mới báo lỗi).
  const firstText = providerOrder()[0];
  const first = { id: prep.p.job?.provider ?? firstText?.id ?? null, model: prep.p.job?.model ?? firstText?.model ?? null };
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
  //    Tác vụ tự chạy (tra cứu, tạo ảnh, chú thích) có `execute` riêng — vẫn nằm sau cổng DB, hạn mức và nhật ký ở trên.
  let llm: ExecResult<C>;
  try {
    llm = prep.p.execute
      ? await prep.p.execute(ctx)
      : await generate({ system: prep.p.system, user: prep.p.user, temperature: prep.p.temperature, maxOutputTokens: prep.p.maxOutputTokens, timeoutMs: prep.p.timeoutMs }, (text) => prep.p.parse(extractJson(text)));
  } catch (e) {
    const known = e instanceof ApiError || e instanceof NoProviderError || e instanceof ProviderError || e instanceof QuotaError;
    const msg = known ? e.message : "Lỗi không xác định khi gọi AI";
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query("UPDATE ai_jobs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1", [job.id, msg.slice(0, 300)]),
    );
    if (e instanceof ApiError) throw e; // thông báo tiếng Việt do tác vụ đặt (vd. hết lượt tạo ảnh trong ngày)
    if (e instanceof QuotaError) throw new ApiError(429, "AI_QUOTA", IMAGE_QUOTA_MESSAGE);
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
    // Hoàn tất job + đọc ngân sách tháng SAU KHI trigger cộng chi phí (cùng giao dịch, một vòng mạng)
    const [, budgetR] = await batch(tx, [
      [
        `UPDATE ai_jobs
            SET status = 'succeeded', provider = $2, model = $3, tokens_in = $4, tokens_out = $5, cost_vnd = $6, latency_ms = $7,
                input_ref = input_ref || $8::jsonb, finished_at = now()
          WHERE id = $1`,
        [
          job.id,
          llm.provider,
          llm.model,
          llm.tokensIn,
          llm.tokensOut,
          llm.costVnd,
          llm.latencyMs,
          JSON.stringify({ ...(llm.failedBefore.length ? { fallbackFrom: llm.failedBefore } : {}), ...(llm.extra ?? {}) }),
        ],
      ],
      [BUDGET_SQL],
    ]);
    return { ...s, budget: budgetR.rows[0] as BudgetRow | undefined };
  });
  // Chạm ngưỡng cảnh báo / hết ngân sách ⇒ báo Admin (nền, không làm chậm phản hồi)
  if (llm.costVnd > 0) void inBackground(budgetAlert(saved.budget));

  return { suggestionId: saved.id, jobId: job.id, taskCode: code, output, provider: llm.provider, model: llm.model, cached: false, createdAt: saved.created_at.toISOString() };
}
