import { api } from "@/server/http";
import { forbidden } from "@/server/errors";
import { readZaloConfig, zaloBotInfo, ZALO_EVENT_KEYS } from "@/server/integrations/zalo";

async function requireSettingWrite(ctx: Parameters<Parameters<typeof api>[1]>[0]) {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_permission('setting.write') AS ok")).rows[0]?.ok);
  if (!ok) throw forbidden("Chỉ Admin / Trưởng nhà (quyền sửa cấu hình hệ thống) mới xem được tích hợp Zalo.");
}

/** Trạng thái tích hợp Zalo: đã có token chưa, bot là ai, cấu hình nhóm. Không bao giờ trả về token. */
export const GET = api({}, async (ctx) => {
  await requireSettingWrite(ctx);
  const cfg = await readZaloConfig(ctx);
  const bot = cfg.tokenConfigured ? await zaloBotInfo() : null;
  return { ...cfg, bot, eventKeys: ZALO_EVENT_KEYS };
});
