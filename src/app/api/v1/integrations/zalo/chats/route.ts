import { api } from "@/server/http";
import { forbidden } from "@/server/errors";
import { zaloRecentChats } from "@/server/integrations/zalo";

/** Dò các cuộc trò chuyện (kể cả nhóm) bot vừa nhận tin để lấy chat_id. */
export const GET = api({}, async (ctx) => {
  const ok = await ctx.db(async (tx) => (await tx.query<{ ok: boolean }>("SELECT app.has_permission('setting.write') AS ok")).rows[0]?.ok);
  if (!ok) throw forbidden("Chỉ Admin / Trưởng nhà mới dò được nhóm Zalo.");
  return zaloRecentChats();
});
