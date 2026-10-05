import { api } from "@/server/http";
import { assertKnownKeys, listSettings, resetSettings } from "@/server/modules/settings";

/** Khôi phục một khóa về settings.default_value. */
export const POST = api({}, async (ctx) => {
  const key = decodeURIComponent(ctx.params.key ?? "");
  assertKnownKeys([key]);
  return ctx.db(async (tx) => {
    const r = await resetSettings(tx, [key]);
    return { ...r, item: (await listSettings(tx)).items.find((s) => s.key === key) };
  });
});
