import { api } from "@/server/http";
import { assertKnownKeys, listSettings, updateSettings } from "@/server/modules/settings";
import { SettingPutSchema } from "@/server/modules/settings-schema";
import { notFound } from "@/server/errors";

const keyOf = (p: Record<string, string>) => {
  const k = decodeURIComponent(p.key ?? "");
  assertKnownKeys([k]);
  return k;
};

export const GET = api({}, async (ctx) => {
  const key = keyOf(ctx.params);
  const { items } = await ctx.db(listSettings);
  const item = items.find((s) => s.key === key);
  if (!item) throw notFound(`Không tìm thấy cấu hình "${key}" (hoặc bạn không có quyền xem cấu hình này).`);
  return item;
});

/** Sửa một khóa (quyền theo write_permission; giới hạn min/max/kiểu do DB kiểm thêm lần nữa). */
export const PUT = api({}, async (ctx) => {
  const key = keyOf(ctx.params);
  const b = await ctx.body(SettingPutSchema);
  return ctx.db(async (tx) => {
    await updateSettings(tx, [{ key, value: b.value, version: b.version }]);
    return (await listSettings(tx)).items.find((s) => s.key === key);
  });
});
