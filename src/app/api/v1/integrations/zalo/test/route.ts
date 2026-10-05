import { z } from "zod";
import { api } from "@/server/http";
import { forbidden } from "@/server/errors";
import { readZaloConfig, sendZaloText } from "@/server/integrations/zalo";

const Schema = z.object({ text: z.string().trim().max(1000).optional() });

/** Gửi một tin thử vào nhóm Zalo đã cấu hình (không phụ thuộc công tắc tổng). */
export const POST = api({}, async (ctx) => {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_permission('setting.write') AS ok")).rows[0]?.ok);
  if (!ok) throw forbidden("Chỉ Admin / Trưởng nhà mới gửi tin thử được.");
  const b = await ctx.body(Schema);
  const cfg = await readZaloConfig(ctx);
  if (!cfg.tokenConfigured) return { sent: false, reason: "Máy chủ chưa có ZALO_BOT_TOKEN — đặt biến môi trường này trên Vercel rồi triển khai lại." };
  if (!cfg.chatId) return { sent: false, reason: "Chưa nhập mã nhóm Zalo (chat_id) hoặc chưa lưu cấu hình." };
  const text = b.text || "🔔 Tin thử từ hệ thống Lưu Xá Phanxicô — nếu thấy tin này trong nhóm nghĩa là kết nối Zalo đã hoạt động.";
  const r = await sendZaloText(cfg.chatId, text);
  return r.ok ? { sent: true } : { sent: false, reason: r.error };
});
