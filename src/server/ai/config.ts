import "server-only";

// ---------------------------------------------------------------------
// Cấu hình nhà cung cấp AI. Mặc định: Groq; nếu Groq lỗi/hết hạn mức thì dự phòng Gemini.
// Khóa API CHỈ đọc từ biến môi trường (.env.local) — không lưu vào DB, không trả về client, không ghi log.
// Không có khóa nào ⇒ cổng AI báo "chưa cấu hình" và giao diện quay về nhập tay (hệ thống không phụ thuộc AI).
// ---------------------------------------------------------------------

export type ProviderId = "groq" | "gemini" | "cloudflare";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  model: string;
  apiKey: string | null;
  /** Chỉ Cloudflare: mã tài khoản (đường dẫn API có chứa mã này). Thiếu ⇒ coi như chưa cấu hình. */
  accountId?: string | null;
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
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      apiKey: key(process.env.GEMINI_API_KEY),
      usdPerMTokIn: num(process.env.GEMINI_USD_PER_MTOK_IN, 0.1),
      usdPerMTokOut: num(process.env.GEMINI_USD_PER_MTOK_OUT, 0.4),
    },
    // Cloudflare Workers AI: văn bản dự phòng (cùng họ mô hình với Groq), tạo ảnh, đọc ảnh. Gói miễn phí 10.000 neuron/ngày ⇒ chi phí quy đổi = 0.
    cloudflare: {
      id: "cloudflare",
      label: "Cloudflare",
      model: process.env.CLOUDFLARE_TEXT_MODEL?.trim() || "@cf/qwen/qwen3.8-27b",
      apiKey: cloudflareAccess()?.token ?? null,
      accountId: cloudflareAccess()?.accountId ?? null,
      usdPerMTokIn: 0,
      usdPerMTokOut: 0,
    },
  };
}

/** Khóa Cloudflare Workers AI: cần ĐỦ mã tài khoản + token (cả hai) thì mới dùng được. */
export function cloudflareAccess(): { accountId: string; token: string } | null {
  const accountId = key(process.env.CLOUDFLARE_ACCOUNT_ID);
  const token = key(process.env.CLOUDFLARE_API_TOKEN);
  return accountId && token ? { accountId, token } : null;
}

/** Mô hình Cloudflare cho từng việc (đổi bằng biến môi trường khi Cloudflare đổi/ngừng mô hình). */
export const CF_MODELS = {
  /** Tạo ảnh đúng kích thước tùy chọn (multipart). Đã thử: ảnh sạch, không chữ nguệch ngoạc. */
  image: () => process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || "@cf/black-forest-labs/flux-2-klein-4b",
  /** Dự phòng khi mô hình chính lỗi: nhanh nhưng chỉ ra ảnh vuông 1024 (được cắt về đúng tỷ lệ). */
  imageFallback: () => process.env.CLOUDFLARE_IMAGE_FALLBACK_MODEL?.trim() || "@cf/black-forest-labs/flux-1-schnell",
  /** Đọc ảnh → chú thích tiếng Việt. */
  vision: () => process.env.CLOUDFLARE_VISION_MODEL?.trim() || "@cf/meta/llama-4-scout-17b-16e-instruct",
};

/** Mô hình Gemini có công cụ tìm kiếm Google (gói miễn phí chỉ còn dùng được dòng 2.5; Gemini 3.x báo hết hạn mức). */
export const searchModel = () => process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-2.5-flash";

/** Thứ tự thử (chưa lọc theo khóa): mặc định groq → cloudflare → gemini. AI_PROVIDER_ORDER="gemini,groq" để đổi (nhà cung cấp không nêu được nối vào cuối). */
export function providerIdOrder(): ProviderId[] {
  const wanted = (process.env.AI_PROVIDER_ORDER ?? "groq,cloudflare,gemini")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderId => s === "groq" || s === "gemini" || s === "cloudflare");
  return [...new Set<ProviderId>([...wanted, "groq", "cloudflare", "gemini"])];
}

/** Nhà cung cấp văn bản theo thứ tự thử; chỉ giữ nhà đã có khóa. */
export function providerOrder(): ProviderConfig[] {
  const cfg = providerConfigs();
  return providerIdOrder()
    .map((id) => cfg[id])
    .filter((p) => !!p.apiKey);
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
  /** Tạo ảnh AI (Cloudflare 10.000 neuron/ngày ≈ 60–100 ảnh): mỗi người 6 lần/giờ, cả nhà tối đa N ảnh/ngày (đếm từ 07:00 sáng giờ VN = 00:00 UTC, lúc Cloudflare làm mới hạn mức). */
  imagePerHour: 6,
  imageDailyCap: num(process.env.AI_IMAGE_DAILY_CAP, 60),
  /** Gợi ý chú thích ảnh / tra cứu tư liệu: hạn mức giờ riêng, không chiếm phần của tác vụ khác. */
  captionPerHour: 20,
  researchPerHour: 10,
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
