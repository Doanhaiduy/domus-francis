import "server-only";

// ---------------------------------------------------------------------
// Cấu hình nhà cung cấp AI. Mặc định: Groq; nếu Groq lỗi/hết hạn mức thì dự phòng Gemini.
// Khóa API CHỈ đọc từ biến môi trường (.env.local) — không lưu vào DB, không trả về client, không ghi log.
// Không có khóa nào ⇒ cổng AI báo "chưa cấu hình" và giao diện quay về nhập tay (hệ thống không phụ thuộc AI).
// ---------------------------------------------------------------------

export type ProviderId = "groq" | "gemini";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  model: string;
  apiKey: string | null;
  /** Đơn giá USD cho 1 triệu token (vào / ra) — dùng ước tính cost_vnd. Ghi đè bằng biến môi trường nếu giá đổi. */
  usdPerMTokIn: number;
  usdPerMTokOut: number;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : d;
};

const key = (v: string | undefined) => {
  const t = v?.trim();
  return t && !/^<.*>$/.test(t) && t !== "your-key-here" ? t : null;
};

export const usdToVnd = () => num(process.env.AI_USD_TO_VND, 25_500);

export function providerConfigs(): Record<ProviderId, ProviderConfig> {
  return {
    groq: {
      id: "groq",
      label: "Groq",
      model: process.env.GROQ_MODEL?.trim() || "qwen/qwen3.8-27b",
      apiKey: key(process.env.GROQ_API_KEY),
      usdPerMTokIn: num(process.env.GROQ_USD_PER_MTOK_IN, 0.59),
      usdPerMTokOut: num(process.env.GROQ_USD_PER_MTOK_OUT, 0.79),
    },
    gemini: {
      id: "gemini",
      label: "Gemini",
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      apiKey: key(process.env.GEMINI_API_KEY),
      usdPerMTokIn: num(process.env.GEMINI_USD_PER_MTOK_IN, 0.1),
      usdPerMTokOut: num(process.env.GEMINI_USD_PER_MTOK_OUT, 0.4),
    },
  };
}

/** Thứ tự thử: mặc định groq → gemini. AI_PROVIDER_ORDER="gemini,groq" để đổi; chỉ giữ nhà cung cấp đã có khóa. */
export function providerOrder(): ProviderConfig[] {
  const cfg = providerConfigs();
  const wanted = (process.env.AI_PROVIDER_ORDER ?? "groq,gemini")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderId => s === "groq" || s === "gemini");
  const order = [...new Set<ProviderId>([...wanted, "groq", "gemini"])];
  return order.map((id) => cfg[id]).filter((p) => !!p.apiKey);
}

export const AI_LIMITS = {
  /** Thời gian chờ mỗi lần gọi (thiết kế 8.2.3: 20 giây cho mô hình nhỏ). */
  timeoutMs: num(process.env.AI_TIMEOUT_MS, 20_000),
  /** Thử lại cùng nhà cung cấp khi lỗi tạm thời (429/5xx/mạng): tối đa 2 lần. */
  maxRetries: 2,
  retryBaseMs: num(process.env.AI_RETRY_BASE_MS, 1_000),
  /** Ngắt mạch: sau N lần lỗi liên tiếp tạm dừng nhà cung cấp một khoảng. */
  breakerThreshold: 5,
  breakerPauseMs: 10 * 60 * 1000,
  /** Giới hạn tốc độ: 20 yêu cầu/giờ/người (thiết kế nhóm `ai`). */
  perUserPerHour: 20,
  /** Riêng Trợ lý hỏi đáp (chat nhiều lượt): 40 lượt/giờ/người, không tính chung với các tác vụ khác. */
  assistantPerHour: 40,
  /** Cache theo nội dung: cùng đầu vào trong 24 giờ thì trả gợi ý cũ. */
  cacheHours: 24,
  /** Các thẻ "AI nhận xét" (thu chi, học tập): giữ kết quả 60 phút theo phạm vi (tháng / cá nhân / toàn nhà), bất kể số liệu có đổi;
   *  muốn có nhận xét mới trước hạn thì bấm "Tạo lại" (force). */
  insightCacheMinutes: 60,
  maxOutputTokens: 900,
} as const;

/**
 * Chỉ dùng khi kiểm thử: AI_TEST_BASE_URL trỏ tới máy chủ giả LOOPBACK (127.0.0.1/localhost) để thử toàn bộ luồng
 * Groq/Gemini mà không có lưu lượng nào ra ngoài. Địa chỉ không phải loopback bị bỏ qua.
 */
export function testBaseUrl(): string | null {
  const raw = process.env.AI_TEST_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ? raw.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
