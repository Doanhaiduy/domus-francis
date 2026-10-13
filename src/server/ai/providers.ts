import "server-only";
import sharp from "sharp";
import { withTx } from "../db";
import { AI_LIMITS, CF_MODELS, cloudflareAccess, providerConfigs, providerOrder, searchModel, testBaseUrl, usdToVnd, type ProviderConfig, type ProviderId } from "./config";

// ---------------------------------------------------------------------
// Adapter nhà cung cấp: Groq (API tương thích OpenAI), Cloudflare Workers AI (văn bản dự phòng + tạo ảnh + đọc ảnh) và Gemini (generateContent).
// Địa chỉ gọi ra được cố định trong mã (allow-list) — không nhận URL từ người dùng hay từ cấu hình DB.
// Khóa gửi trong header (không đưa vào URL để khỏi lọt vào log). Không log prompt/đầu ra (BR-AI-10).
// ---------------------------------------------------------------------

const groqUrl = () => `${testBaseUrl() ? testBaseUrl() + "/groq" : "https://api.groq.com"}/openai/v1/chat/completions`;
const geminiUrl = (model: string) =>
  `${testBaseUrl() ? testBaseUrl() + "/gemini" : "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const cfBase = () => `${testBaseUrl() ? testBaseUrl() + "/cloudflare" : "https://api.cloudflare.com"}/client/v4`;
const cfAccountUrl = (accountId: string, path: string) => `${cfBase()}/accounts/${encodeURIComponent(accountId)}${path}`;

export interface LlmRequest {
  system: string;
  user: string;
  temperature?: number;
  /** Ghi đè giới hạn token đầu ra / thời gian chờ cho tác vụ sinh văn bản dài (mặc định AI_LIMITS). */
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface LlmResult {
  text: string;
  provider: ProviderId;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costVnd: number;
  latencyMs: number;
  /** Các nhà cung cấp đã thất bại/bị bỏ qua trước khi nhà cung cấp này trả lời (job ghi nhận dự phòng). */
  failedBefore: ProviderId[];
}

/** Lỗi tạm thời (đáng thử lại) hay vĩnh viễn (đổi nhà cung cấp luôn). */
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: ProviderId,
    public transient: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

export class NoProviderError extends Error {}

// --- Ngắt mạch ------------------------------------------------------------------
// Sau AI_LIMITS.breakerThreshold lỗi LIÊN TIẾP, nhà cung cấp bị tạm dừng breakerPauseMs. Trạng thái lưu ở CSDL (ai_provider_state,
// db/app/1043) để mọi instance serverless cùng biết (trước đây chỉ nằm trong bộ nhớ từng instance: instance mới lại gọi vào nhà cung
// cấp đang hỏng, người dùng chờ lâu). Bộ nhớ là bản đệm, đồng bộ từ CSDL tối đa 15 giây một lần; CSDL lỗi ⇒ chạy theo bộ nhớ như cũ.
interface Breaker {
  failures: number;
  openUntil: number;
}
const g = globalThis as unknown as { __luuxaAiBreaker?: Map<ProviderId, Breaker>; __luuxaAiBreakerSyncAt?: number };
const breakers = (g.__luuxaAiBreaker ??= new Map<ProviderId, Breaker>());
const BREAKER_SYNC_MS = 15_000;

export function breakerState(id: ProviderId): { open: boolean; retryAt: number | null } {
  const b = breakers.get(id);
  const open = !!b && b.openUntil > Date.now();
  return { open, retryAt: open ? b!.openUntil : null };
}

const noteFailureInMemory = (id: ProviderId) => {
  const b = breakers.get(id) ?? { failures: 0, openUntil: 0 };
  b.failures += 1;
  if (b.failures >= AI_LIMITS.breakerThreshold) {
    b.openUntil = Date.now() + AI_LIMITS.breakerPauseMs;
    b.failures = 0;
  }
  breakers.set(id, b);
};

type BreakerRow = { provider: string; failures: number; open_ms: number | null };

/** Nạp trạng thái ngắt mạch từ CSDL vào bộ nhớ (tối đa 15 giây một lần mỗi instance). */
async function syncBreakers(): Promise<void> {
  const now = Date.now();
  if (now - (g.__luuxaAiBreakerSyncAt ?? 0) < BREAKER_SYNC_MS) return;
  g.__luuxaAiBreakerSyncAt = now;
  try {
    const rows = await withTx({}, "luuxa_worker", async (tx) =>
      (await tx.query<BreakerRow>("SELECT provider, failures, (extract(epoch FROM open_until) * 1000)::float8 AS open_ms FROM ai_provider_state")).rows,
    );
    for (const id of ["groq", "gemini", "cloudflare"] as ProviderId[]) {
      const r = rows.find((x) => x.provider === id);
      if (r && (r.failures > 0 || (r.open_ms ?? 0) > now)) breakers.set(id, { failures: r.failures, openUntil: r.open_ms ?? 0 });
      else breakers.delete(id);
    }
  } catch (e) {
    console.error("[ai] không đọc được trạng thái ngắt mạch:", (e as Error).message);
  }
}

/** Ghi một lỗi (tăng nguyên tử trong CSDL — nhiều instance cùng đếm); đủ ngưỡng ⇒ tạm dừng. CSDL lỗi ⇒ đếm trong bộ nhớ. */
async function noteFailure(id: ProviderId, err: ProviderError | null): Promise<void> {
  try {
    const r = await withTx({}, "luuxa_worker", (tx) =>
      tx.query<BreakerRow>(
        `INSERT INTO ai_provider_state AS s (provider, failures, open_until, last_error, last_failure_at, updated_at)
         VALUES ($1, CASE WHEN 1 >= $2 THEN 0 ELSE 1 END, CASE WHEN 1 >= $2 THEN now() + make_interval(secs => $3) END, $4, now(), now())
         ON CONFLICT (provider) DO UPDATE
            SET failures   = CASE WHEN s.failures + 1 >= $2 THEN 0 ELSE s.failures + 1 END,
                open_until = CASE WHEN s.failures + 1 >= $2 THEN now() + make_interval(secs => $3) ELSE s.open_until END,
                last_error = EXCLUDED.last_error, last_failure_at = now(), updated_at = now()
         RETURNING provider, failures, (extract(epoch FROM open_until) * 1000)::float8 AS open_ms`,
        [id, AI_LIMITS.breakerThreshold, Math.round(AI_LIMITS.breakerPauseMs / 1000), (err?.message ?? "lỗi không xác định").slice(0, 300)],
      ),
    );
    const row = r.rows[0];
    breakers.set(id, { failures: row.failures, openUntil: row.open_ms ?? 0 });
  } catch (e) {
    console.error("[ai] không ghi được trạng thái ngắt mạch:", (e as Error).message);
    noteFailureInMemory(id);
  }
}

/** Thành công ⇒ xóa đếm lỗi (chỉ ghi CSDL khi trước đó có lỗi / đang tạm dừng). */
async function noteSuccess(id: ProviderId): Promise<void> {
  const had = breakers.get(id);
  breakers.delete(id);
  if (!had) return;
  try {
    await withTx({}, "luuxa_worker", (tx) =>
      tx.query("UPDATE ai_provider_state SET failures = 0, open_until = NULL, updated_at = now() WHERE provider = $1 AND (failures > 0 OR open_until IS NOT NULL)", [id]),
    );
  } catch (e) {
    console.error("[ai] không xóa được trạng thái ngắt mạch:", (e as Error).message);
  }
}

// --- Gọi HTTP -------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, headers: Record<string, string>, body: unknown, provider: ProviderId, timeoutMs: number = AI_LIMITS.timeoutMs): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // Không đưa nội dung phản hồi (có thể phản chiếu prompt) vào thông báo lỗi — chỉ mã trạng thái.
      const transient = res.status === 408 || res.status === 429 || res.status >= 500;
      throw new ProviderError(`${provider} trả về HTTP ${res.status}`, provider, transient, res.status);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const aborted = (e as Error)?.name === "AbortError";
    throw new ProviderError(aborted ? `${provider} quá thời gian chờ` : `${provider} lỗi kết nối`, provider, true);
  } finally {
    clearTimeout(timer);
  }
}

interface RawOut {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

async function callGroq(p: ProviderConfig, req: LlmRequest): Promise<RawOut> {
  const data = (await post(
    groqUrl(),
    { authorization: `Bearer ${p.apiKey}` },
    {
      model: p.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxOutputTokens ?? AI_LIMITS.maxOutputTokens,
      response_format: { type: "json_object" },
    },
    "groq",
    req.timeoutMs,
  )) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ProviderError("groq trả về nội dung rỗng", "groq", false);
  return { text, tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: data.usage?.completion_tokens ?? 0 };
}

async function callGemini(p: ProviderConfig, req: LlmRequest): Promise<RawOut> {
  const data = (await post(
    geminiUrl(p.model),
    { "x-goog-api-key": p.apiKey! },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxOutputTokens ?? AI_LIMITS.maxOutputTokens,
        responseMimeType: "application/json",
        // Gemini 2.5 "suy nghĩ" tốn token đầu ra: với văn bản dài dễ cắt cụt JSON ⇒ tắt (mô hình đời khác không nhận tham số này)
        ...(/gemini-2\.5/.test(p.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    },
    "gemini",
    req.timeoutMs,
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("");
  if (!text?.trim()) throw new ProviderError("gemini trả về nội dung rỗng (có thể bị bộ lọc an toàn chặn)", "gemini", false);
  return { text, tokensIn: data.usageMetadata?.promptTokenCount ?? 0, tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0 };
}

/** Cloudflare Workers AI, điểm cuối tương thích OpenAI (chat/completions) — dự phòng văn bản, cùng họ mô hình với Groq. */
async function callCloudflare(p: ProviderConfig, req: LlmRequest): Promise<RawOut> {
  const data = (await post(
    cfAccountUrl(p.accountId!, "/ai/v1/chat/completions"),
    { authorization: `Bearer ${p.apiKey}` },
    {
      model: p.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxOutputTokens ?? AI_LIMITS.maxOutputTokens,
      response_format: { type: "json_object" },
    },
    "cloudflare",
    req.timeoutMs,
  )) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ProviderError("cloudflare trả về nội dung rỗng", "cloudflare", false);
  return { text, tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: data.usage?.completion_tokens ?? 0 };
}

const costVnd = (p: ProviderConfig, tin: number, tout: number) =>
  Math.ceil(((tin * p.usdPerMTokIn + tout * p.usdPerMTokOut) / 1_000_000) * usdToVnd());

async function callWithRetry(p: ProviderConfig, req: LlmRequest): Promise<RawOut> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await (p.id === "groq" ? callGroq(p, req) : p.id === "cloudflare" ? callCloudflare(p, req) : callGemini(p, req));
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError("lỗi không xác định", p.id, false);
      if (!pe.transient || attempt >= AI_LIMITS.maxRetries) throw pe;
      await sleep(AI_LIMITS.retryBaseMs * 3 ** attempt); // 1s, 3s
    }
  }
}

/**
 * Gọi theo thứ tự ưu tiên (Groq → Gemini). Nhà cung cấp đang bị ngắt mạch bị bỏ qua.
 * `parse` kiểm đầu ra: nếu không hợp lệ (sai JSON/lược đồ) thì coi như nhà cung cấp đó thất bại và chuyển sang nhà cung cấp kế.
 */
export async function generate<T>(req: LlmRequest, parse: (text: string) => T): Promise<LlmResult & { value: T }> {
  // AI_OFFLINE=1: chặn tuyệt đối mọi cuộc gọi ra ngoài (dùng khi chạy kiểm thử trên máy công ty).
  if (process.env.AI_OFFLINE === "1") throw new NoProviderError("AI_OFFLINE=1: đã chặn cuộc gọi ra dịch vụ AI bên ngoài.");
  const order = providerOrder();
  if (!order.length) throw new NoProviderError("Chưa cấu hình khóa API (GROQ_API_KEY hoặc GEMINI_API_KEY).");
  await syncBreakers();
  const failed: ProviderId[] = [];
  let last: ProviderError | null = null;
  for (const p of order) {
    if (breakerState(p.id).open) {
      failed.push(p.id);
      continue;
    }
    const t0 = Date.now();
    try {
      const out = await callWithRetry(p, req);
      let value: T;
      try {
        value = parse(out.text);
      } catch {
        throw new ProviderError(`${p.id} trả về nội dung không đúng lược đồ`, p.id, false);
      }
      await noteSuccess(p.id);
      return {
        ...out,
        value,
        provider: p.id,
        model: p.model,
        costVnd: costVnd(p, out.tokensIn, out.tokensOut),
        latencyMs: Date.now() - t0,
        failedBefore: failed,
      };
    } catch (e) {
      last = e instanceof ProviderError ? e : new ProviderError("lỗi không xác định", p.id, false);
      await noteFailure(p.id, last);
      failed.push(p.id);
    }
  }
  throw last ?? new ProviderError("Mọi nhà cung cấp AI đang tạm dừng (ngắt mạch).", order[0].id, true);
}

// =====================================================================
// Cloudflare Workers AI: tạo ảnh + đọc ảnh. Gói miễn phí 10.000 neuron/ngày (làm mới 00:00 UTC = 07:00 giờ VN) — hết hạn mức thì
// Cloudflare trả lỗi; ta ghi nhận "tạm dừng đến nửa đêm UTC" vào ai_provider_state để mọi instance khỏi gọi vô ích.
// =====================================================================

/** Hết hạn mức ngày của Cloudflare (không phải lỗi hỏng hóc — không tính vào ngắt mạch văn bản). */
export class QuotaError extends Error {
  constructor(
    message: string,
    public retryAt: Date,
  ) {
    super(message);
  }
}

const IMAGE_QUOTA_KEY = "cloudflare_image";
const nextUtcMidnight = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
};

/** Thông báo thân thiện cho người dùng khi hết lượt ảnh miễn phí trong ngày. */
export const IMAGE_QUOTA_MESSAGE =
  "Hôm nay cả nhà đã dùng hết lượt tạo ảnh AI miễn phí — hạn mức làm mới lúc 07:00 sáng mai (giờ Việt Nam). Bạn vẫn tải ảnh lên như bình thường.";

/** Còn đang tạm dừng vì hết hạn mức ngày? (đọc CSDL; lỗi CSDL ⇒ coi như chưa dừng, để Cloudflare tự trả lỗi). */
export async function imageQuotaPausedUntil(): Promise<Date | null> {
  try {
    const rows = await withTx({}, "luuxa_worker", async (tx) =>
      (await tx.query<{ open_ms: number | null }>("SELECT (extract(epoch FROM open_until) * 1000)::float8 AS open_ms FROM ai_provider_state WHERE provider = $1", [IMAGE_QUOTA_KEY])).rows,
    );
    const ms = rows[0]?.open_ms ?? 0;
    return ms > Date.now() ? new Date(ms) : null;
  } catch {
    return null;
  }
}

async function pauseImageQuota(): Promise<Date> {
  const until = nextUtcMidnight();
  try {
    await withTx({}, "luuxa_worker", (tx) =>
      tx.query(
        `INSERT INTO ai_provider_state (provider, failures, open_until, last_error, last_failure_at, updated_at)
         VALUES ($1, 0, $2, 'hết hạn mức ngày (Cloudflare)', now(), now())
         ON CONFLICT (provider) DO UPDATE SET open_until = EXCLUDED.open_until, last_error = EXCLUDED.last_error, last_failure_at = now(), updated_at = now()`,
        [IMAGE_QUOTA_KEY, until.toISOString()],
      ),
    );
  } catch (e) {
    console.error("[ai] không ghi được trạng thái hết hạn mức ảnh:", (e as Error).message);
  }
  return until;
}

interface CfEnvelope {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: unknown;
}

/** Gọi Cloudflare (JSON hoặc multipart); đổi lỗi thành ProviderError / QuotaError (không đưa nội dung phản hồi vào thông báo). */
async function cfRequest(url: string, token: string, body: BodyInit, contentType: string | null, timeoutMs: number, label: string): Promise<CfEnvelope> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, ...(contentType ? { "content-type": contentType } : {}) },
      body,
      signal: ctl.signal,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as CfEnvelope;
    if (!res.ok || j.success === false) {
      const errs = j.errors ?? [];
      const quota = res.status === 429 || errs.some((e) => e.code === 4006 || /daily free allocation|neurons/i.test(e.message ?? ""));
      if (quota) throw new QuotaError("Cloudflare hết hạn mức miễn phí trong ngày", await pauseImageQuota());
      const transient = res.status === 408 || res.status >= 500;
      throw new ProviderError(`${label} trả về HTTP ${res.status}${errs[0]?.code ? ` (mã ${errs[0].code})` : ""}`, "cloudflare", transient, res.status);
    }
    return j;
  } catch (e) {
    if (e instanceof ProviderError || e instanceof QuotaError) throw e;
    const aborted = (e as Error)?.name === "AbortError";
    throw new ProviderError(aborted ? `${label} quá thời gian chờ` : `${label} lỗi kết nối`, "cloudflare", true);
  } finally {
    clearTimeout(timer);
  }
}

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
  timeoutMs?: number;
}
export interface ImageResult {
  /** JPEG đúng kích thước yêu cầu (đã cắt/thu nhỏ, không còn metadata). */
  buffer: Buffer;
  model: string;
  latencyMs: number;
  /** Có phải mô hình dự phòng không (ảnh vuông bị cắt). */
  fallback: boolean;
}

async function cfRunImage(model: string, req: ImageRequest, cf: { accountId: string; token: string }): Promise<Buffer> {
  const url = cfAccountUrl(cf.accountId, `/ai/run/${model}`);
  const timeoutMs = req.timeoutMs ?? 90_000;
  let env: CfEnvelope;
  if (/flux-2/.test(model)) {
    // Dòng FLUX.2: nhận kích thước tùy chọn, gửi dạng multipart
    const fd = new FormData();
    fd.append("prompt", req.prompt);
    fd.append("width", String(req.width));
    fd.append("height", String(req.height));
    if (req.seed !== undefined) fd.append("seed", String(req.seed));
    env = await cfRequest(url, cf.token, fd, null, timeoutMs, "cloudflare (ảnh)");
  } else {
    // FLUX.1 schnell: JSON, chỉ ra ảnh vuông
    env = await cfRequest(url, cf.token, JSON.stringify({ prompt: req.prompt, steps: 6, ...(req.seed !== undefined ? { seed: req.seed } : {}) }), "application/json", timeoutMs, "cloudflare (ảnh)");
  }
  const b64 = (env.result as { image?: string } | undefined)?.image;
  if (typeof b64 !== "string" || b64.length < 100) throw new ProviderError("cloudflare không trả về ảnh", "cloudflare", false);
  return Buffer.from(b64, "base64");
}

/**
 * Tạo một ảnh bằng Cloudflare: mô hình chính, lỗi (không phải hết hạn mức) thì thử mô hình dự phòng. Đầu ra luôn là JPEG đúng
 * `width × height` (cắt giữa nếu cần) — storeUpload sau đó xử lý như mọi ảnh người dùng tải lên.
 */
export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  if (process.env.AI_OFFLINE === "1") throw new NoProviderError("AI_OFFLINE=1: đã chặn cuộc gọi ra dịch vụ AI bên ngoài.");
  const cf = cloudflareAccess();
  if (!cf) throw new NoProviderError("Chưa cấu hình Cloudflare Workers AI (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN).");
  const paused = await imageQuotaPausedUntil();
  if (paused) throw new QuotaError("Cloudflare đang tạm dừng vì hết hạn mức ngày", paused);

  const t0 = Date.now();
  const models = [CF_MODELS.image(), CF_MODELS.imageFallback()].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr: unknown = null;
  for (let i = 0; i < models.length; i++) {
    try {
      let raw: Buffer;
      try {
        raw = await cfRunImage(models[i], req, cf);
      } catch (e) {
        // lỗi tạm thời (5xx/mạng): thử lại một lần trước khi đổi mô hình
        if (e instanceof ProviderError && e.transient) raw = await cfRunImage(models[i], req, cf);
        else throw e;
      }
      const buffer = await sharp(raw).resize({ width: req.width, height: req.height, fit: "cover", position: "centre" }).jpeg({ quality: 88 }).toBuffer();
      return { buffer, model: models[i], latencyMs: Date.now() - t0, fallback: i > 0 };
    } catch (e) {
      if (e instanceof QuotaError) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof ProviderError ? lastErr : new ProviderError("cloudflare không tạo được ảnh", "cloudflare", true);
}

export interface DescribeRequest {
  system: string;
  instruction: string;
  /** data: URL (JPEG đã thu nhỏ). */
  imageDataUrl: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Đọc ảnh bằng mô hình thị giác của Cloudflare (chú thích ảnh). */
export async function describeImage(req: DescribeRequest): Promise<{ text: string; model: string; latencyMs: number }> {
  if (process.env.AI_OFFLINE === "1") throw new NoProviderError("AI_OFFLINE=1: đã chặn cuộc gọi ra dịch vụ AI bên ngoài.");
  const cf = cloudflareAccess();
  if (!cf) throw new NoProviderError("Chưa cấu hình Cloudflare Workers AI (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN).");
  const model = CF_MODELS.vision();
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), req.timeoutMs ?? 45_000);
  try {
    const res = await fetch(cfAccountUrl(cf.accountId, "/ai/v1/chat/completions"), {
      method: "POST",
      headers: { authorization: `Bearer ${cf.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: [{ type: "text", text: req.instruction }, { type: "image_url", image_url: { url: req.imageDataUrl } }] },
        ],
        max_tokens: req.maxTokens ?? 160,
        temperature: 0.2,
      }),
      signal: ctl.signal,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as CfEnvelope & { choices?: { message?: { content?: string | null } }[] };
    if (!res.ok) {
      const errs = j.errors ?? [];
      if (res.status === 429 || errs.some((e) => e.code === 4006 || /daily free allocation|neurons/i.test(e.message ?? ""))) {
        throw new QuotaError("Cloudflare hết hạn mức miễn phí trong ngày", await pauseImageQuota());
      }
      throw new ProviderError(`cloudflare (đọc ảnh) trả về HTTP ${res.status}`, "cloudflare", res.status >= 500 || res.status === 408, res.status);
    }
    const text = j.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError("cloudflare (đọc ảnh) trả về nội dung rỗng", "cloudflare", false);
    return { text: text.trim(), model, latencyMs: Date.now() - t0 };
  } catch (e) {
    if (e instanceof ProviderError || e instanceof QuotaError) throw e;
    throw new ProviderError((e as Error)?.name === "AbortError" ? "cloudflare (đọc ảnh) quá thời gian chờ" : "cloudflare (đọc ảnh) lỗi kết nối", "cloudflare", true);
  } finally {
    clearTimeout(timer);
  }
}

export interface SearchResult {
  text: string;
  /** Nguồn do Google dẫn (url là liên kết chuyển hướng của Google; title thường là tên miền của trang). */
  sources: { title: string; url: string }[];
  queries: string[];
  model: string;
  latencyMs: number;
}

/**
 * Tra cứu web bằng Gemini + công cụ tìm kiếm Google (googleSearch). KHÔNG dùng chế độ JSON cùng lúc với công cụ tìm kiếm —
 * người gọi nhận văn bản thường (gạch đầu dòng) rồi tự tách. Gói miễn phí hiện chỉ dùng được dòng gemini-2.5 (đổi bằng GEMINI_SEARCH_MODEL).
 */
export async function geminiSearch(prompt: string, timeoutMs = 40_000): Promise<SearchResult> {
  if (process.env.AI_OFFLINE === "1") throw new NoProviderError("AI_OFFLINE=1: đã chặn cuộc gọi ra dịch vụ AI bên ngoài.");
  const g = providerConfigs().gemini;
  if (!g.apiKey) throw new NoProviderError("Chưa cấu hình GEMINI_API_KEY.");
  const model = searchModel();
  const t0 = Date.now();
  const data = (await post(
    geminiUrl(model),
    { "x-goog-api-key": g.apiKey },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
    },
    "gemini",
    timeoutMs,
  )) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] };
    }[];
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  if (!text) throw new ProviderError("gemini (tìm kiếm) trả về nội dung rỗng", "gemini", false);
  const seen = new Set<string>();
  const sources: { title: string; url: string }[] = [];
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    const url = c.web?.uri;
    if (!url || !/^https:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: (c.web?.title ?? "").trim().slice(0, 200) || "Nguồn trên mạng", url: url.slice(0, 600) });
  }
  return { text, sources: sources.slice(0, 8), queries: (cand?.groundingMetadata?.webSearchQueries ?? []).slice(0, 5), model, latencyMs: Date.now() - t0 };
}
