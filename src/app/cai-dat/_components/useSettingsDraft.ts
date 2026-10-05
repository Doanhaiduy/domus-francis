"use client";
// Bản nháp cấu hình của màn hình Cài đặt: chỉ giữ các khóa đã sửa, kiểm lỗi theo kiểu/min/max (cùng bộ luật với server),
// lưu tất cả trong một lần gọi PATCH /api/v1/settings (một transaction).
import { useCallback, useMemo, useState } from "react";
import { errorMessage, ApiClientError } from "@/lib/api";
import { refreshSettings, settingsApi, useSettings } from "@/lib/data/settings";
import { sameSettingValue, validateSettingValue, type SettingDto, type SettingWriterDto } from "@/lib/types/settings";

export interface SettingsDraft {
  isLoading: boolean;
  error: unknown;
  byKey: Map<string, SettingDto>;
  writers: Record<string, SettingWriterDto>;
  roleCodes: string[];
  meta: (key: string) => SettingDto | undefined;
  value: <T = unknown>(key: string) => T | undefined;
  set: (key: string, value: unknown) => void;
  errorOf: (key: string) => string | undefined;
  isDirty: (key: string) => boolean;
  dirtyKeys: string[];
  hasErrors: boolean;
  saving: boolean;
  save: () => Promise<{ ok: boolean; message: string }>;
  discard: (keys?: string[]) => void;
  resetToDefaults: (keys: string[]) => Promise<{ ok: boolean; message: string }>;
  lockReason: (key: string) => string | null;
  anyWritable: boolean;
}

export function useSettingsDraft(roleCodes: string[] = []): SettingsDraft {
  const { settings, writers, error, isLoading, mutate } = useSettings();
  const byKey = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const meta = useCallback((key: string) => byKey.get(key), [byKey]);

  const value = useCallback(<T>(key: string): T | undefined => (key in draft ? draft[key] : byKey.get(key)?.value) as T | undefined, [draft, byKey]);

  const set = useCallback(
    (key: string, v: unknown) => {
      setServerErrors((e) => {
        if (!(key in e)) return e;
        const n = { ...e };
        delete n[key];
        return n;
      });
      setDraft((d) => {
        const cur = byKey.get(key);
        if (cur && sameSettingValue(v, cur.value)) {
          const n = { ...d };
          delete n[key];
          return n;
        }
        return { ...d, [key]: v };
      });
    },
    [byKey],
  );

  const clientErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      const m = byKey.get(k);
      if (!m) continue;
      const e = validateSettingValue(m, v, roleCodes);
      if (e) errs[k] = e;
    }
    // BR-FIN-32: hạn mức Thủ quỹ tự duyệt phải nhỏ hơn ngưỡng hai chữ ký (DB kiểm lại lúc COMMIT)
    const solo = value<number>("finance.expense.treasurer_solo_approve_max_vnd");
    const dual = value<number>("finance.expense.dual_approval_min_vnd");
    if (
      typeof solo === "number" &&
      typeof dual === "number" &&
      solo >= dual &&
      ("finance.expense.treasurer_solo_approve_max_vnd" in draft || "finance.expense.dual_approval_min_vnd" in draft)
    ) {
      const msg = "Hạn mức Thủ quỹ tự duyệt phải nhỏ hơn ngưỡng hai chữ ký (BR-FIN-32).";
      errs["finance.expense.treasurer_solo_approve_max_vnd"] ??= msg;
      errs["finance.expense.dual_approval_min_vnd"] ??= msg;
    }
    return errs;
  }, [draft, byKey, roleCodes, value]);

  const errorOf = useCallback((key: string) => clientErrors[key] ?? serverErrors[key], [clientErrors, serverErrors]);
  const dirtyKeys = useMemo(() => Object.keys(draft), [draft]);
  const hasErrors = Object.keys(clientErrors).length > 0;

  const save = useCallback(async () => {
    if (!dirtyKeys.length) return { ok: true, message: "Không có thay đổi nào cần lưu." };
    if (hasErrors) return { ok: false, message: "Vui lòng sửa các ô đang báo lỗi trước khi lưu." };
    setSaving(true);
    try {
      const changes = dirtyKeys.map((key) => ({ key, value: draft[key], version: byKey.get(key)?.version }));
      const res = await settingsApi.save(changes);
      await mutate({ items: res.items, writers: res.writers }, { revalidate: false });
      setDraft({});
      setServerErrors({});
      void refreshSettings();
      return { ok: true, message: `Đã lưu ${res.changed.length} cấu hình vào hệ thống.` };
    } catch (e) {
      if (e instanceof ApiClientError && e.errors?.length) {
        setServerErrors(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
      }
      if (e instanceof ApiClientError && e.code === "STALE_VERSION") void mutate();
      return { ok: false, message: errorMessage(e) };
    } finally {
      setSaving(false);
    }
  }, [dirtyKeys, hasErrors, draft, byKey, mutate]);

  const discard = useCallback((keys?: string[]) => {
    setDraft((d) => {
      if (!keys) return {};
      const n = { ...d };
      for (const k of keys) delete n[k];
      return n;
    });
    setServerErrors({});
  }, []);

  const resetToDefaults = useCallback(
    async (keys: string[]) => {
      if (!keys.length) return { ok: true, message: "Các cấu hình đã ở giá trị mặc định." };
      setSaving(true);
      try {
        const res = await settingsApi.reset(keys);
        await mutate({ items: res.items, writers: res.writers }, { revalidate: false });
        discard(keys);
        void refreshSettings();
        return { ok: true, message: `Đã khôi phục ${res.reset.length} cấu hình về giá trị mặc định.` };
      } catch (e) {
        return { ok: false, message: errorMessage(e) };
      } finally {
        setSaving(false);
      }
    },
    [mutate, discard],
  );

  const lockReason = useCallback(
    (key: string): string | null => {
      const m = byKey.get(key);
      if (!m) return "Bạn không có quyền xem cấu hình này.";
      if (m.canWrite) return null;
      const w = writers[m.writePermission];
      const who = w?.roles.length ? w.roles.join(", ") : "Ban điều hành";
      if (m.writePermission === "finance.settings.write")
        return `Chỉ ${who} được sửa · finance.settings.write (Admin kỹ thuật không có quyền tài chính)`;
      return `Chỉ ${who} được sửa · ${m.writePermission}`;
    },
    [byKey, writers],
  );

  const anyWritable = useMemo(() => settings.some((s) => s.canWrite), [settings]);

  return {
    isLoading: isLoading && !settings.length,
    error,
    byKey,
    writers,
    roleCodes,
    meta,
    value,
    set,
    errorOf,
    isDirty: (k) => k in draft,
    dirtyKeys,
    hasErrors,
    saving,
    save,
    discard,
    resetToDefaults,
    lockReason,
    anyWritable,
  };
}
