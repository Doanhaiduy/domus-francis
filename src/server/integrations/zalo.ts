import "server-only";
import type { Ctx } from "../http";

// =====================================================================
// Tích hợp nhóm Zalo qua Zalo Bot (https://bot.zaloplatforms.com) — API dạng Telegram:
//   POST https://bot-api.zaloplatforms.com/bot<TOKEN>/sendMessage  { chat_id, text (≤ 2000 ký tự) }
// Bot Token chỉ nằm ở biến môi trường ZALO_BOT_TOKEN (không lưu CSDL, không gửi về trình duyệt).
// Cấu hình nhóm (bật/tắt, chat_id, loại tin) ở bảng settings: integration.zalo.*
// Gửi tin là "cố gắng hết sức": lỗi mạng/Zalo không làm hỏng thao tác chính của người dùng.
// =====================================================================

const API = "https://bot-api.zaloplatforms.com";
const TEXT_LIMIT = 2000;

export const ZALO_EVENT_KEYS = ["duty_week", "dues_reminder", "facility_new"] as const;
export type ZaloEventKey = (typeof ZALO_EVENT_KEYS)[number];
export const ZALO_EVENT_LABEL: Record<ZaloEventKey, string> = {
  duty_week: "Lịch trực vệ sinh sân nhà hằng tuần",
  dues_reminder: "Nhắc đóng quỹ / điện nước",
  facility_new: "Có báo hỏng cơ sở vật chất mới",
};

export interface ZaloConfig {
  tokenConfigured: boolean;
  enabled: boolean;
  chatId: string;
  events: Record<string, boolean>;
}

const token = () => process.env.ZALO_BOT_TOKEN?.trim() || "";

/** Đọc cấu hình bằng vai trò worker (khóa integration.* không công khai cho thành viên thường). */
export async function readZaloConfig(ctx: Pick<Ctx, "dbAs">): Promise<ZaloConfig> {
  const rows = await ctx.dbAs("luuxa_worker", async (tx) => (await tx.query<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key LIKE 'integration.zalo.%'")).rows).catch(() => []);
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const events = v["integration.zalo.group_events"];
  return {
    tokenConfigured: !!token(),
    enabled: v["integration.zalo.group_enabled"] === true,
    chatId: typeof v["integration.zalo.group_chat_id"] === "string" ? (v["integration.zalo.group_chat_id"] as string).trim() : "",
    events: events && typeof events === "object" && !Array.isArray(events) ? (events as Record<string, boolean>) : {},
  };
}

interface ZaloReply {
  ok?: boolean;
  description?: string;
  error_code?: number;
  result?: unknown;
}

async function call(method: string, body: Record<string, unknown>, timeoutMs = 10_000): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const t = token();
  if (!t) return { ok: false, error: "Chưa cấu hình ZALO_BOT_TOKEN trên máy chủ." };
  try {
    const res = await fetch(`${API}/bot${t}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as ZaloReply;
    if (!res.ok || json.ok === false) return { ok: false, error: json.description || `Zalo trả lỗi ${json.error_code ?? res.status}.` };
    return { ok: true, result: json.result };
  } catch (e) {
    const msg = (e as Error)?.name === "TimeoutError" ? "Zalo không phản hồi (quá thời gian chờ)." : "Không kết nối được tới Zalo.";
    return { ok: false, error: msg };
  }
}

/** Cắt văn bản dài thành các đoạn ≤ 2000 ký tự (ưu tiên ngắt ở xuống dòng). */
export function chunkText(text: string, limit = TEXT_LIMIT): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Gửi văn bản tới một chat_id (tự chia đoạn). */
export async function sendZaloText(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  for (const part of chunkText(text)) {
    const r = await call("sendMessage", { chat_id: chatId, text: part });
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true };
}

export interface ZaloPostResult {
  sent: boolean;
  /** Lý do không gửi (tắt, thiếu cấu hình, lỗi Zalo…) — để hiện cho người dùng, không phải lỗi nghiêm trọng. */
  reason?: string;
}

/**
 * Đăng một tin vào nhóm Zalo của nhà nếu: công tắc tổng bật, đã có token + chat_id và loại tin `event` đang bật
 * (event = null: tin gửi thủ công, chỉ cần tổng bật + đủ cấu hình). Không ném lỗi.
 */
export async function postToZaloGroup(ctx: Pick<Ctx, "dbAs">, event: ZaloEventKey | null, text: string): Promise<ZaloPostResult> {
  try {
    const cfg = await readZaloConfig(ctx);
    if (!cfg.enabled) return { sent: false, reason: "Gửi tin nhóm Zalo đang tắt (Cài đặt → Tích hợp Zalo)." };
    if (!cfg.tokenConfigured) return { sent: false, reason: "Máy chủ chưa có ZALO_BOT_TOKEN." };
    if (!cfg.chatId) return { sent: false, reason: "Chưa nhập mã nhóm Zalo (chat_id)." };
    if (event && cfg.events[event] === false) return { sent: false, reason: `Loại tin “${ZALO_EVENT_LABEL[event]}” đang tắt.` };
    const r = await sendZaloText(cfg.chatId, text);
    return r.ok ? { sent: true } : { sent: false, reason: r.error };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

/** Thông tin bot (getMe) — kiểm tra token. */
export async function zaloBotInfo(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const r = await call("getMe", {});
  if (!r.ok) return { ok: false, error: r.error };
  const res = (r.result ?? {}) as Record<string, unknown>;
  return { ok: true, name: String(res.display_name ?? res.account_name ?? res.name ?? res.username ?? res.id ?? "Zalo Bot") };
}

export interface ZaloChatDto {
  chatId: string;
  type: string | null;
  title: string | null;
  lastText: string | null;
}

/** Các cuộc trò chuyện bot vừa nhận tin (getUpdates) — để lấy chat_id của nhóm: thêm bot vào nhóm, nhắn một câu, rồi bấm "Dò nhóm". */
export async function zaloRecentChats(): Promise<{ ok: boolean; chats: ZaloChatDto[]; error?: string; webhook?: string | null; raw?: string }> {
  // Webhook đang bật thì getUpdates không dùng được (hai cơ chế loại trừ nhau) — báo rõ để người dùng biết.
  const wh = await call("getWebhookInfo", {}, 6_000);
  const webhook = wh.ok ? (((wh.result ?? {}) as Record<string, unknown>).url as string | undefined) || null : null;
  // Long-polling: Zalo giữ yêu cầu tối đa `timeout` giây chờ tin mới; không có tin nào thì trả lỗi "Request timeout" (không phải lỗi thật).
  const r = await call("getUpdates", { timeout: "15" }, 22_000);
  if (!r.ok) {
    if (/time-?out/i.test(r.error ?? "")) return { ok: true, chats: [], webhook };
    return { ok: false, chats: [], error: r.error, webhook };
  }
  const list: unknown[] = Array.isArray(r.result) ? r.result : r.result ? [r.result] : [];
  const seen = new Map<string, ZaloChatDto>();
  for (const u of list) {
    const root = u as Record<string, unknown>;
    const msg = (root?.message ?? root) as Record<string, unknown>;
    const chat = (msg?.chat ?? null) as Record<string, unknown> | null;
    const id = chat?.id ?? msg?.chat_id;
    if (id === undefined || id === null) continue;
    const from = (msg?.from ?? null) as Record<string, unknown> | null;
    seen.set(String(id), {
      chatId: String(id),
      type: (chat?.chat_type ?? chat?.type ?? null) as string | null,
      title: ((chat?.title ?? chat?.name ?? from?.display_name ?? from?.name) as string | undefined) ?? null,
      lastText: typeof msg?.text === "string" ? (msg.text as string).slice(0, 80) : null,
    });
  }
  // Nhận được dữ liệu nhưng không đọc ra cuộc trò chuyện nào ⇒ trả về cấu trúc thô (đã cắt ngắn) để chẩn đoán
  const raw = !seen.size && list.length ? JSON.stringify(list).slice(0, 600) : undefined;
  return { ok: true, chats: [...seen.values()], webhook, raw };
}
