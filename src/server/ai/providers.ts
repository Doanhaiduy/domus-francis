import "server-only";
import { AI_LIMITS, providerOrder, testBaseUrl, usdToVnd, type ProviderConfig, type ProviderId } from "./config";

// ---------------------------------------------------------------------
// Adapter nhà cung cấp: Groq (API tương thích OpenAI) và Gemini (generateContent).
// Địa chỉ gọi ra được cố định trong mã (allow-list) — không nhận URL từ người dùng hay từ cấu hình DB.
// Khóa gửi trong header (không đưa vào URL để khỏi lọt vào log). Không log prompt/đầu ra (BR-AI-10).
// ---------------------------------------------------------------------

const groqUrl = () => `${testBaseUrl() ? testBaseUrl() + "/groq" : "https://api.groq.com"}/openai/v1/chat/completions`;
const geminiUrl = (model: string) =>
  `${testBaseUrl() ? testBaseUrl() + "/gemini" : "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

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

// --- Ngắt mạch theo tiến trình --------------------------------------------------
interface Breaker {
  failures: number;
  openUntil: number;
}
const g = globalThis as unknown as { __luuxaAiBreaker?: Map<ProviderId, Breaker> };
const breakers = (g.__luuxaAiBreaker ??= new Map<ProviderId, Breaker>());

export function breakerState(id: ProviderId): { open: boolean; retryAt: number | null } {
  const b = breakers.get(id);
  const open = !!b && b.openUntil > Date.now();
  return { open, retryAt: open ? b!.openUntil : null };
}
const noteFailure = (id: ProviderId) => {
  const b = breakers.get(id) ?? { failures: 0, openUntil: 0 };
  b.failures += 1;
  if (b.failures >= AI_LIMITS.breakerThreshold) {
    b.openUntil = Date.now() + AI_LIMITS.breakerPauseMs;
    b.failures = 0;
  }
  breakers.set(id, b);
};
const noteSuccess = (id: ProviderId) => breakers.delete(id);

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

const costVnd = (p: ProviderConfig, tin: number, tout: number) =>
  Math.ceil(((tin * p.usdPerMTokIn + tout * p.usdPerMTokOut) / 1_000_000) * usdToVnd());

async function callWithRetry(p: ProviderConfig, req: LlmRequest): Promise<RawOut> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await (p.id === "groq" ? callGroq(p, req) : callGemini(p, req));
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
      noteSuccess(p.id);
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
      noteFailure(p.id);
      failed.push(p.id);
    }
  }
  throw last ?? new ProviderError("Mọi nhà cung cấp AI đang tạm dừng (ngắt mạch).", order[0].id, true);
}
