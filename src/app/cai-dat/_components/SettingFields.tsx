"use client";
// Ô nhập gắn với một khóa settings: tự khóa (disabled + lý do) khi người dùng không có write_permission của khóa,
// báo lỗi theo kiểu/min/max, gợi ý giới hạn và giá trị mặc định (có nút đưa ô về mặc định — lưu khi bấm "Lưu").
import React, { createContext, useContext, useEffect, useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { CustomInput, CustomTimePicker, CustomToggle } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import { feastToLabel, labelToFeast, sameSettingValue, type SettingDto } from "@/lib/types/settings";
import type { SettingsDraft } from "./useSettingsDraft";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} đ`;

export function formatSettingValue(m: Pick<SettingDto, "valueType" | "key">, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (m.valueType === "vnd" && typeof v === "number") return vnd(v);
  if (m.valueType === "boolean") return v ? "Bật" : "Tắt";
  if (m.key === "org.patron_feast" && typeof v === "string") return feastToLabel(v);
  if (typeof v === "number") return v.toLocaleString("vi-VN");
  if (typeof v === "string") return v === "" ? "(trống)" : v;
  return JSON.stringify(v);
}

/** true: lý do khóa đã hiện một lần ở đầu thẻ (hoặc cả trang đang chỉ đọc) — không lặp lại dưới từng ô. */
export const LockNoteShown = createContext(false);

/** Nếu MỌI khóa đang hiển thị của một thẻ đều bị khóa: các lý do (không trùng) để nêu một lần ở đầu thẻ; ngược lại null. */
export function commonLock(draft: SettingsDraft, keys: string[]): string | null {
  const reasons = keys.filter((k) => draft.meta(k)).map((k) => draft.lockReason(k));
  if (!reasons.length || reasons.some((r) => !r)) return null;
  const distinct = [...new Set(reasons as string[])];
  if (distinct.length === 1) return distinct[0];
  return ["Bạn không sửa được mục nào trong thẻ này:", ...distinct.map((r) => `• ${r}`)].join("\n");
}

/** Băng thông báo khóa ở đầu thẻ. */
export function CardLockNote({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <div className="-mt-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-1.5 text-[11px] text-amber-800">
      <Lock className="w-3.5 h-3.5 mt-[1px] shrink-0" />
      <span className="whitespace-pre-line">{reason}</span>
    </div>
  );
}

/** Dòng gợi ý dưới ô: lý do bị khóa, hoặc giới hạn + giá trị mặc định (kèm nút khôi phục ô). */
export function FieldHint({ draft, k, showBounds = true }: { draft: SettingsDraft; k: string; showBounds?: boolean }) {
  const m = draft.meta(k);
  const lock = draft.lockReason(k);
  const lockShown = useContext(LockNoteShown);
  if (lock && lockShown) return null;
  if (lock)
    return (
      <p className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-amber-700">
        <Lock className="w-3 h-3 mt-[1px] shrink-0" />
        <span>{lock}</span>
      </p>
    );
  if (!m) return null;
  const cur = draft.value(k);
  const bounds =
    showBounds && (m.min !== null || m.max !== null)
      ? `Giới hạn ${m.min !== null ? formatSettingValue(m, m.min) : "—"} – ${m.max !== null ? formatSettingValue(m, m.max) : "—"}`
      : null;
  const hasDefault = m.defaultValue !== null && m.defaultValue !== undefined && m.defaultValue !== "";
  const atDefault = hasDefault && sameSettingValue(cur, m.defaultValue);
  if (!bounds && (!hasDefault || atDefault)) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-gray-400">
      {bounds && <span>{bounds}</span>}
      {hasDefault && !atDefault && (
        <button
          type="button"
          onClick={() => draft.set(k, m.defaultValue)}
          className="inline-flex items-center gap-0.5 font-semibold text-primary/80 hover:text-primary"
          title="Đưa ô này về giá trị mặc định (bấm Lưu để áp dụng)"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Mặc định: {formatSettingValue(m, m.defaultValue)}
        </button>
      )}
    </p>
  );
}

interface FieldProps {
  draft: SettingsDraft;
  k: string;
  label: string;
  placeholder?: string;
  className?: string;
}

const dirtyRing = (draft: SettingsDraft, k: string) => (draft.isDirty(k) ? "ring-2 ring-purple-200 rounded-xl" : "");

export function TextSetting({ draft, k, label, placeholder, className }: FieldProps) {
  const m = draft.meta(k);
  const v = draft.value<string>(k);
  return (
    <div className={className}>
      <div className={dirtyRing(draft, k)}>
        <CustomInput
          label={label}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => draft.set(k, e.target.value)}
          placeholder={m ? placeholder : "Không có quyền xem"}
          disabled={!m?.canWrite}
          error={draft.errorOf(k)}
          className={!m?.canWrite ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
        />
      </div>
      <FieldHint draft={draft} k={k} showBounds={false} />
    </div>
  );
}

export function NumberSetting({ draft, k, label, suffix, className }: FieldProps & { suffix?: string }) {
  const m = draft.meta(k);
  const v = draft.value<number | string>(k);
  return (
    <div className={className}>
      <div className={dirtyRing(draft, k)}>
        <CustomInput
          label={label}
          type="number"
          inputMode="numeric"
          value={v === undefined || v === null ? "" : String(v)}
          min={m?.min ?? undefined}
          max={m?.max ?? undefined}
          step={m?.valueType === "number" ? "any" : m?.valueType === "vnd" ? 1000 : 1}
          onChange={(e) => draft.set(k, e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={m ? undefined : "Không có quyền xem"}
          disabled={!m?.canWrite}
          rightSuffix={suffix ?? (m?.valueType === "vnd" ? "VNĐ" : undefined)}
          error={draft.errorOf(k)}
          className={!m?.canWrite ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
        />
      </div>
      <FieldHint draft={draft} k={k} />
    </div>
  );
}

/** "05:30 sáng" / "5:30" → "05:30"; chuỗi không nhận ra giữ nguyên để báo lỗi. */
const normTime = (s: string) => {
  const m = /^\s*(\d{1,2})[:hH](\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s.trim();
};

export function TimeSetting({ draft, k, label, className }: FieldProps) {
  const m = draft.meta(k);
  const v = draft.value<string>(k);
  const locked = !m?.canWrite;
  return (
    <div className={className}>
      <div className={cn(dirtyRing(draft, k), locked && "pointer-events-none opacity-60 select-none")} aria-disabled={locked}>
        <CustomTimePicker
          label={label}
          value={typeof v === "string" ? v : ""}
          onChange={(t) => draft.set(k, normTime(t))}
          placeholder={m ? "Chọn giờ..." : "Không có quyền xem"}
          error={draft.errorOf(k)}
        />
      </div>
      <FieldHint draft={draft} k={k} />
    </div>
  );
}

export function ToggleSetting({
  draft,
  k,
  label,
  description,
  checked,
  onChange,
}: {
  draft: SettingsDraft;
  k: string;
  label: string;
  description?: string;
  /** Ghi đè cho khóa json (vd một công tắc trong integration.telegram.group_events) */
  checked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const m = draft.meta(k);
  const locked = !m?.canWrite;
  const on = checked ?? draft.value<boolean>(k) === true;
  return (
    <div>
      <div className={cn(locked && "pointer-events-none opacity-60 select-none")} aria-disabled={locked}>
        <CustomToggle checked={on} onChange={(x) => (onChange ? onChange(x) : draft.set(k, x))} label={label} description={description} />
      </div>
      {draft.errorOf(k) && <p className="text-[11px] text-rose-500">{draft.errorOf(k)}</p>}
      {locked && <FieldHint draft={draft} k={k} />}
    </div>
  );
}

/** Ô ngày Bổn mạng: nhập DD/MM, lưu MM-DD (org.patron_feast). Giữ chuỗi người dùng đang gõ để không nhảy chữ. */
export function FeastSetting({ draft, k, label, className }: FieldProps) {
  const m = draft.meta(k);
  const v = draft.value<string>(k) ?? "";
  const [text, setText] = useState(feastToLabel(v));
  useEffect(() => {
    if (labelToFeast(text) !== v) setText(feastToLabel(v));
    // chỉ đồng bộ khi giá trị bên ngoài đổi (lưu/khôi phục)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <div className={className}>
      <div className={dirtyRing(draft, k)}>
        <CustomInput
          label={label}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            draft.set(k, labelToFeast(e.target.value));
          }}
          placeholder="DD/MM — VD: 04/10"
          disabled={!m?.canWrite}
          error={draft.errorOf(k)}
          className={!m?.canWrite ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}
        />
      </div>
      <FieldHint draft={draft} k={k} />
    </div>
  );
}
