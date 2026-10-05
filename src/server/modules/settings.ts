import "server-only";
import type { Tx } from "../db";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../errors";
import {
  TELEGRAM_EVENT_KEYS,
  TELEGRAM_EVENT_LABEL,
  feastToLabel,
  sameSettingValue,
  validateSettingValue,
  type OrgSettingsDto,
  type SettingChange,
  type SettingDto,
  type SettingValueType,
  type SettingsListDto,
  type TelegramTestDto,
} from "@/lib/types/settings";

interface SettingRow {
  key: string;
  value: unknown;
  value_type: SettingValueType;
  description: string;
  min_value: number | null;
  max_value: number | null;
  is_public: boolean;
  write_permission: string;
  default_value: unknown;
  updated_at: Date;
  version: number;
  can_write: boolean;
  updated_by_name: string | null;
}

const SELECT_SETTING = `
  SELECT s.key, s.value, s.value_type, s.description, s.min_value, s.max_value, s.is_public, s.write_permission,
         s.default_value, s.updated_at, s.version, app.has_permission(s.write_permission) AS can_write,
         m.display_name AS updated_by_name
    FROM settings s
    LEFT JOIN members m ON m.user_id = s.updated_by AND m.deleted_at IS NULL`;

const toDto = (r: SettingRow): SettingDto => ({
  key: r.key,
  value: r.value,
  valueType: r.value_type,
  description: r.description,
  min: r.min_value,
  max: r.max_value,
  isPublic: r.is_public,
  writePermission: r.write_permission,
  defaultValue: r.default_value ?? null,
  canWrite: r.can_write,
  updatedAt: new Date(r.updated_at).toISOString(),
  updatedByName: r.updated_by_name,
  version: r.version,
});

/** Mọi cấu hình người gọi được xem (RLS: khóa công khai, khóa mình có quyền sửa, cấu hình tài chính cho cán bộ tài chính). */
export async function listSettings(tx: Tx): Promise<SettingsListDto> {
  const rows = (await tx.query<SettingRow>(`${SELECT_SETTING} ORDER BY s.key`)).rows;
  const perms = [...new Set(rows.map((r) => r.write_permission))];
  const writers: SettingsListDto["writers"] = {};
  for (const w of (
    await tx.query<{ code: string; description: string; roles: string[] }>(
      `SELECT p.code, p.description,
              COALESCE(array_agg(r.name_vi ORDER BY r.rank, r.code) FILTER (WHERE r.id IS NOT NULL), '{}') AS roles
         FROM permissions p
         LEFT JOIN role_permissions rp ON rp.permission_code = p.code
         LEFT JOIN roles r ON r.id = rp.role_id
        WHERE p.code = ANY($1::text[])
        GROUP BY p.code, p.description`,
      [perms],
    )
  ).rows) {
    writers[w.code] = { description: w.description, roles: w.roles };
  }
  return { items: rows.map(toDto), writers };
}

async function loadOne(tx: Tx, key: string): Promise<SettingRow> {
  const r = (await tx.query<SettingRow>(`${SELECT_SETTING} WHERE s.key = $1`, [key])).rows[0];
  if (!r) throw notFound(`Không tìm thấy cấu hình "${key}" (hoặc bạn không có quyền xem cấu hình này).`);
  return r;
}

function denyWrite(r: SettingRow): never {
  throw forbidden(
    r.write_permission === "finance.settings.write"
      ? `Cấu hình tài chính "${r.key}" chỉ người có quyền finance.settings.write (Trưởng nhà) được sửa.`
      : `Bạn không có quyền sửa cấu hình "${r.key}" (cần quyền ${r.write_permission}).`,
  );
}

const normalize = (type: SettingValueType, v: unknown) => (type === "string" && typeof v === "string" ? v.trim() : v);

/**
 * Lưu nhiều khóa trong MỘT transaction (ràng buộc liên khóa như BR-FIN-32 — hạn mức Thủ quỹ tự duyệt < ngưỡng hai chữ ký —
 * được trigger DEFERRABLE kiểm lúc COMMIT trên trạng thái cuối). Kiểm hết mọi khóa trước rồi mới ghi.
 */
export async function updateSettings(tx: Tx, changes: SettingChange[]): Promise<{ changed: string[] }> {
  const byKey = new Map<string, SettingChange>();
  for (const c of changes) byKey.set(c.key, c);
  const roles = (await tx.query<{ code: string }>("SELECT code FROM roles")).rows.map((r) => r.code);

  const plan: { row: SettingRow; value: unknown }[] = [];
  const errors: { field: string; message: string }[] = [];
  for (const c of byKey.values()) {
    const row = await loadOne(tx, c.key);
    const value = normalize(row.value_type, c.value);
    if (sameSettingValue(value, row.value)) continue;
    if (!row.can_write) denyWrite(row);
    const err = validateSettingValue({ key: row.key, valueType: row.value_type, min: row.min_value, max: row.max_value }, value, roles);
    if (err) {
      errors.push({ field: row.key, message: err });
      continue;
    }
    if (c.version !== undefined && c.version !== row.version)
      throw conflict(`Cấu hình "${row.key}" vừa được người khác thay đổi — tải lại trang để xem giá trị mới rồi sửa lại.`, "STALE_VERSION");
    plan.push({ row, value });
  }
  if (errors.length) throw badRequest(`${errors[0].field}: ${errors[0].message}`, errors);

  for (const { row, value } of plan) {
    const r = await tx.query("UPDATE settings SET value = $2::jsonb WHERE key = $1 AND version = $3", [row.key, JSON.stringify(value), row.version]);
    if (!r.rowCount) throw conflict(`Cấu hình "${row.key}" vừa được người khác thay đổi — tải lại trang rồi thử lại.`, "STALE_VERSION");
  }
  return { changed: plan.map((p) => p.row.key) };
}

/** "Khôi phục mặc định": value := default_value cho các khóa được chọn (bỏ qua khóa đã ở mặc định / không có mặc định). */
export async function resetSettings(tx: Tx, keys: string[]): Promise<{ reset: string[]; skipped: string[] }> {
  const reset: string[] = [];
  const skipped: string[] = [];
  for (const key of [...new Set(keys)]) {
    const row = await loadOne(tx, key);
    if (row.default_value === null || row.default_value === undefined || sameSettingValue(row.value, row.default_value)) {
      skipped.push(key);
      continue;
    }
    if (!row.can_write) denyWrite(row);
    const r = await tx.query("UPDATE settings SET value = default_value WHERE key = $1 AND default_value IS NOT NULL", [key]);
    if (!r.rowCount) denyWrite(row);
    reset.push(key);
  }
  return { reset, skipped };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Cấu hình công khai cho mọi màn hình (tên nhà, khẩu hiệu, địa chỉ, bổn mạng, mức quỹ…) — chỉ khóa is_public. */
export async function getPublicSettings(tx: Tx): Promise<OrgSettingsDto> {
  const values: Record<string, unknown> = {};
  for (const r of (await tx.query<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE is_public ORDER BY key")).rows)
    values[r.key] = r.value;
  const feast = str(values["org.patron_feast"]);
  let feastTitle: string | null = null;
  if (/^\d{2}-\d{2}$/.test(feast)) {
    feastTitle =
      (
        await tx.query<{ title: string }>(
          `SELECT title FROM liturgical_days
            WHERE to_char(day_date, 'MM-DD') = $1 AND extract(year FROM day_date) = extract(year FROM app.local_today())
            LIMIT 1`,
          [feast],
        )
      ).rows[0]?.title ?? null;
  }
  return {
    houseName: str(values["org.house_name"]),
    motto: str(values["org.motto"]),
    address: str(values["org.address"]),
    patronFeast: feast,
    patronFeastLabel: feastToLabel(feast),
    patronFeastTitle: feastTitle,
    contactPhone: str(values["org.contact_phone"]),
    orderName: str(values["org.order_name"]),
    chaplainName: str(values["org.chaplain_name"]),
    duesBankAccount: str(values["finance.dues_bank_account"]),
    monthlyDuesVnd: num(values["finance.monthly_dues_vnd"]),
    duesDueDay: num(values["finance.dues_due_day"]),
    mealPricePerServingVnd: num(values["meal.price_per_serving_vnd"]),
    lunchCutoffTime: str(values["meal.lunch_cutoff_time"]) || null,
    dinnerCutoffTime: str(values["meal.dinner_cutoff_time"]) || null,
    nightPrayerTime: str(values["liturgy.night_prayer_time"]) || null,
    mealsEnabled: values["feature.meals.enabled"] === true,
    values,
  };
}

/**
 * "Gửi thử" Telegram: hệ thống chạy LOCAL nên KHÔNG gọi Telegram API. Kiểm cấu hình đã lưu và trả về bản xem trước
 * tin nhắn sẽ gửi, kèm các vấn đề cấu hình cần xử lý.
 */
export async function telegramDryRun(tx: Tx): Promise<TelegramTestDto> {
  const rows = (
    await tx.query<{ key: string; value: unknown; can_write: boolean }>(
      `SELECT key, value, app.has_permission(write_permission) AS can_write FROM settings
        WHERE key LIKE 'integration.telegram.%' OR key IN ('org.house_name', 'meal.lunch_cutoff_time', 'meal.dinner_cutoff_time', 'liturgy.night_prayer_time')`,
    )
  ).rows;
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const tgRow = rows.find((r) => r.key === "integration.telegram.group_chat_id");
  if (!tgRow) throw forbidden("Chỉ Ban điều hành có quyền sửa cấu hình hệ thống (setting.write) mới xem và thử được cấu hình Telegram.");
  if (!tgRow.can_write) throw forbidden("Bạn không có quyền cấu hình Telegram (cần quyền setting.write).");

  const enabled = v["integration.telegram.group_enabled"] === true;
  const chatId = str(v["integration.telegram.group_chat_id"]);
  const events = (v["integration.telegram.group_events"] ?? {}) as Record<string, boolean>;
  const active = TELEGRAM_EVENT_KEYS.filter((k) => events[k] === true);
  const problems: string[] = [];
  if (!enabled) problems.push("Công tắc “Gửi tin tự động vào nhóm” đang TẮT — dù có kết nối mạng, hệ thống cũng sẽ không gửi tin nào.");
  if (!chatId) problems.push("Chưa nhập Group Chat ID của nhóm Telegram.");
  if (!active.length) problems.push("Chưa bật loại tin tự động nào.");
  problems.push("Bot Token không được lưu trong CSDL (theo thiết kế, token là bí mật cấu hình phía máy chủ) và bản cài đặt local không dùng token.");

  const now = (await tx.query<{ t: string }>("SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS t")).rows[0].t;
  const preview = [
    `🔔 ${str(v["org.house_name"]) || "Lưu xá"} — tin nhắn thử`,
    `Thời điểm: ${now}`,
    `Nhóm nhận: ${chatId || "(chưa cấu hình)"}`,
    "Tin tự động đang bật:",
    ...(active.length ? active.map((k) => `  • ${TELEGRAM_EVENT_LABEL[k]}`) : ["  (không có)"]),
  ].join("\n");

  return {
    sent: false,
    mode: "local",
    reason:
      "Hệ thống đang chạy ở chế độ LOCAL: mọi kết nối ra Internet (Telegram Bot API) đều bị tắt, nên không có tin nhắn nào được gửi. Dưới đây là bản xem trước nội dung sẽ gửi khi triển khai thật.",
    enabled,
    chatId,
    activeEvents: active,
    problems,
    preview,
  };
}

export function assertKnownKeys(keys: string[]) {
  for (const k of keys)
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(k)) throw new ApiError(400, "VALIDATION_FAILED", `Khóa cấu hình không hợp lệ: ${k}`);
}
