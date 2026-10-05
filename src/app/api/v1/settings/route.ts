import { api } from "@/server/http";
import { listSettings, updateSettings } from "@/server/modules/settings";
import { SettingsPatchSchema } from "@/server/modules/settings-schema";

/** Danh sách cấu hình người gọi được xem (RLS) + quyền sửa từng khóa. */
export const GET = api({}, (ctx) => ctx.db(listSettings));

/** Lưu nhiều khóa trong một transaction (quyền theo settings.write_permission của từng khóa; ràng buộc liên khóa kiểm lúc COMMIT). */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(SettingsPatchSchema);
  return ctx.db(async (tx) => {
    const { changed } = await updateSettings(tx, b.changes);
    return { changed, ...(await listSettings(tx)) };
  });
});
