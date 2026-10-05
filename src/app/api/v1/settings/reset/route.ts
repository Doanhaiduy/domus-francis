import { api } from "@/server/http";
import { listSettings, resetSettings } from "@/server/modules/settings";
import { SettingsResetSchema } from "@/server/modules/settings-schema";

/** Khôi phục nhiều khóa về mặc định trong một transaction. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SettingsResetSchema);
  return ctx.db(async (tx) => {
    const r = await resetSettings(tx, b.keys);
    return { ...r, ...(await listSettings(tx)) };
  });
});
