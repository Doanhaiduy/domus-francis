import { z } from "zod";
import { api } from "@/server/http";
import { batch } from "@/server/db";
import { ApiError, forbidden } from "@/server/errors";
import { MODULE_SETTING_KEY, TOGGLEABLE_MODULES, type DisabledModules, type ModulesStateDto } from "@/lib/modules";

const HREFS = new Set(TOGGLEABLE_MODULES.map((m) => m.href));

/** Phân hệ đang ẩn (bảo trì) — mọi thành viên đọc được để thanh bên/trang hiển thị đúng. */
export const GET = api({}, (ctx) =>
  ctx.db(async (tx): Promise<ModulesStateDto> => {
    const [v, p] = await batch(tx, [
      ["SELECT value FROM settings WHERE key = $1", [MODULE_SETTING_KEY]],
      ["SELECT app.has_permission('setting.write') AS ok"],
    ]);
    const raw = (v.rows[0]?.value ?? {}) as DisabledModules;
    const disabled: DisabledModules = {};
    for (const [href, cfg] of Object.entries(raw)) if (HREFS.has(href)) disabled[href] = cfg ?? {};
    return { disabled, canManage: !!p.rows[0]?.ok };
  }),
);

const Body = z.object({
  disabled: z.record(
    z.string(),
    z.object({
      message: z.string().trim().max(300, "Lời nhắn tối đa 300 ký tự.").optional(),
      since: z.string().max(40).optional(),
    }),
  ),
});

/** Lưu danh sách phân hệ đang ẩn (cần setting.write — Admin/Trưởng nhà). */
export const PUT = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  for (const href of Object.keys(b.disabled)) if (!HREFS.has(href)) throw new ApiError(400, "BAD_MODULE", `Phân hệ không hợp lệ: ${href}`);
  return ctx.db(async (tx) => {
    const cur = (await tx.query("SELECT value, app.has_permission(write_permission) AS ok FROM settings WHERE key = $1", [MODULE_SETTING_KEY])).rows[0];
    if (!cur) throw new ApiError(409, "NOT_MIGRATED", "Thiếu cấu hình ui.disabled_modules — hãy chạy pnpm db:migrate.");
    if (!cur.ok) throw forbidden("Chỉ người có quyền sửa cấu hình hệ thống mới ẩn/hiện được phân hệ.");
    const prev = (cur.value ?? {}) as DisabledModules;
    const now = new Date().toISOString();
    const next: DisabledModules = {};
    for (const [href, cfg] of Object.entries(b.disabled)) next[href] = { message: cfg.message || undefined, since: prev[href]?.since ?? cfg.since ?? now };
    await tx.query(
      "UPDATE settings SET value = $2::jsonb, updated_by = app.current_user_id(), updated_at = now(), version = version + 1 WHERE key = $1",
      [MODULE_SETTING_KEY, JSON.stringify(next)],
    );
    return { disabled: next };
  });
});
