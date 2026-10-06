"use client";

// Bộ chọn tỉnh/thành, xã/phường theo danh mục provinces.open-api.vn (qua /api/v1/geo):
//  - ProvincePicker: một tỉnh/thành (lưu tên gọn "Hà Nội", "TP. Hồ Chí Minh") — trường đại học, quê quán…
//  - HometownPicker: quê quán = huyện/xã ghi tự do + tỉnh/thành (cho phép chọn theo tên tỉnh cũ trước 07/2025)
//  - AddressPicker: địa chỉ = số nhà/đường/thôn + xã/phường + tỉnh/thành theo địa giới hiện hành
// Giá trị vẫn là chuỗi văn bản như trước (tương thích dữ liệu cũ); không tải được danh mục ⇒ tự chuyển sang ô nhập tay.
import React, { useEffect, useMemo, useState } from "react";
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { Check, ChevronDown, Loader2, MapPin, PencilLine, RotateCcw } from "lucide-react";
import { CustomInput } from "./FormControls";
import { useProvinces, useWards } from "@/lib/data/geo";
import { addressParts, composeAddress, findProvince, findWard, provinceKey, searchGeo } from "@/lib/geo";
import type { GeoEdition, GeoProvinceDto, GeoWardDto } from "@/lib/types/geo";
import { cn } from "@/lib/utils";

const labelCls = "block text-xs font-bold text-gray-700 mb-1.5";
const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-9 text-xs text-gray-900 placeholder:text-gray-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed";

interface Named {
  code: number;
  name: string;
}

/** Ô chọn có tìm kiếm không dấu. `text` là chữ hiển thị khi đóng (giá trị đang lưu, kể cả khi không có trong danh mục). */
function GeoCombobox<T extends Named>({
  items,
  selected,
  text,
  onPick,
  placeholder,
  loading,
  disabled,
  allowCustom,
  error,
  sub,
}: {
  items: T[];
  selected: T | null;
  text: string;
  onPick: (item: T | null, custom?: string) => void;
  placeholder: string;
  loading?: boolean;
  disabled?: boolean;
  allowCustom?: boolean;
  error?: boolean;
  sub?: (item: T) => string | null;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => searchGeo(items, query), [items, query]);
  // Chữ vừa gõ không trùng hẳn một mục ⇒ cho "dùng nguyên văn" (đặt CUỐI danh sách để Enter chọn mục khớp nhất)
  const custom = allowCustom && query.trim() && !shown.some((x) => provinceKey(x.name) === provinceKey(query)) ? query.trim() : null;
  // Phương án "dùng chữ vừa gõ": mã -1 (chọn được bằng Enter như mọi phương án khác)
  const customItem: Named | null = custom ? { code: -1, name: custom } : null;
  return (
    <Combobox<T | Named | null>
      value={selected}
      by={(a, b) => !!a && !!b && a.code === b.code}
      onChange={(v) => {
        if (!v) return;
        if (v.code === -1) onPick(null, v.name);
        else onPick(v as T);
      }}
      onClose={() => setQuery("")}
      disabled={disabled}
      immediate
    >
      <div className="relative">
        <ComboboxInput<T | Named | null>
          className={cn(inputCls, error && "border-rose-400 focus:border-rose-500 focus:ring-rose-100")}
          displayValue={() => text}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={loading ? "Đang tải danh mục…" : placeholder}
          autoComplete="off"
        />
        <ComboboxButton aria-label="Mở danh sách" className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
        </ComboboxButton>
      </div>
      <ComboboxOptions
        anchor={{ to: "bottom start", gap: 6 }}
        className="z-[90] w-[var(--input-width)] min-w-56 max-h-[min(18rem,55vh)] overflow-y-auto rounded-2xl bg-white p-1 text-xs shadow-xl ring-1 ring-black/5 border border-purple-50 empty:invisible"
      >
        {shown.map((x) => (
          <ComboboxOption
            key={x.code}
            value={x}
            className="group relative cursor-pointer select-none py-2 pl-8 pr-3 rounded-xl text-gray-800 data-[focus]:bg-purple-50 data-[focus]:text-primary data-[selected]:font-bold data-[selected]:text-primary"
          >
            <Check className="invisible group-data-[selected]:visible absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" />
            <span className="block truncate">{x.name}</span>
            {sub?.(x) && <span className="block truncate text-[10px] font-normal text-gray-400">{sub(x)}</span>}
          </ComboboxOption>
        ))}
        {customItem && (
          <ComboboxOption
            value={customItem}
            className="flex items-center gap-2 cursor-pointer select-none py-2 px-3 rounded-xl text-gray-700 data-[focus]:bg-purple-50 data-[focus]:text-primary"
          >
            <PencilLine className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Dùng “<b>{custom}</b>” (không có trong danh mục)
            </span>
          </ComboboxOption>
        )}
        {!loading && !shown.length && !custom && <div className="py-3 px-3 text-gray-400">Không tìm thấy — thử gõ không dấu, vd. “ha noi”.</div>}
      </ComboboxOptions>
    </Combobox>
  );
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="mt-1 text-[10.5px] text-amber-700 flex items-center gap-1">
      Chưa tải được danh mục tỉnh/thành — đang nhập tay.
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline">
        <RotateCcw className="w-3 h-3" /> Thử lại
      </button>
    </p>
  );
}

// ---------------------------------------------------------------------
// Một tỉnh/thành
// ---------------------------------------------------------------------
export interface ProvincePickerProps {
  label?: string;
  /** Tên tỉnh/thành đang lưu (văn bản tự do từ trước vẫn hiển thị nguyên) */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Cho chọn theo 63 tỉnh/thành cũ (trước 07/2025) — dùng cho quê quán */
  allowLegacy?: boolean;
  className?: string;
}

export function ProvincePicker({ label, value, onChange, placeholder = "Chọn tỉnh / thành phố", error, disabled, allowLegacy, className }: ProvincePickerProps) {
  const current = useProvinces("2025");
  // Giá trị cũ không có trong 34 tỉnh/thành mới (vd. "Nam Định") ⇒ mở sẵn danh mục cũ để khớp
  const needLegacy = !!allowLegacy && !!value.trim() && !current.isLoading && !findProvince(value, current.provinces);
  const [legacyOn, setLegacyOn] = useState<boolean | null>(null);
  const edition: GeoEdition = allowLegacy && (legacyOn ?? needLegacy) ? "legacy" : "2025";
  const legacy = useProvinces("legacy", edition === "legacy");
  const src = edition === "legacy" ? legacy : current;
  const selected = findProvince(value, src.provinces);
  const [manual, setManual] = useState(false);

  if (src.error || manual) {
    return (
      <div className={cn("w-full", className)}>
        <CustomInput label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder="VD: Hà Nội" maxLength={100} error={error} disabled={disabled} />
        {src.error && !manual ? (
          <Unavailable onRetry={src.retry} />
        ) : (
          <button type="button" onClick={() => setManual(false)} className="mt-1 text-[10.5px] font-bold text-primary hover:underline">
            Chọn từ danh mục
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={cn("w-full", className)}>
      {label && <label className={labelCls}>{label}</label>}
      <GeoCombobox
        items={src.provinces}
        selected={selected}
        text={selected ? selected.shortName : value}
        onPick={(p, custom) => onChange(p ? p.shortName : findProvince(custom, src.provinces)?.shortName ?? custom ?? "")}
        placeholder={placeholder}
        loading={src.isLoading}
        disabled={disabled}
        allowCustom
        error={!!error}
      />
      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
      {(allowLegacy || (!!value.trim() && !selected && !src.isLoading)) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-gray-500">
          {!!value.trim() && !selected && !src.isLoading && <span className="text-amber-700">“{value}” chưa khớp danh mục — chọn lại nếu cần.</span>}
          {allowLegacy && (
            <button
              type="button"
              onClick={() => setLegacyOn(edition !== "legacy")}
              className="font-bold text-primary hover:underline"
              title="Từ 01/07/2025 cả nước còn 34 tỉnh/thành; quê quán thường vẫn ghi theo tên tỉnh cũ"
            >
              {edition === "legacy" ? "Dùng 34 tỉnh/thành hiện hành" : "Chọn theo tên tỉnh cũ (63 tỉnh)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Quê quán: "Xuân Trường, Nam Định" = huyện/xã (tự ghi) + tỉnh/thành (chọn)
// ---------------------------------------------------------------------
export function HometownPicker({ label = "Quê quán", value, onChange, disabled }: { label?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  // Giữ hai phần trong state (gõ dấu phẩy ở phần huyện/xã không làm nhảy chữ); tách lại khi giá trị đổi từ bên ngoài
  const split = (v: string) => {
    const parts = addressParts(v);
    return { province: parts.length ? parts[parts.length - 1] : "", detail: parts.slice(0, -1).join(", ") };
  };
  const [st, setSt] = useState(() => split(value));
  const [emitted, setEmitted] = useState(value);
  useEffect(() => {
    if (value !== emitted) {
      setSt(split(value));
      setEmitted(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const emit = (next: { province: string; detail: string }) => {
    setSt(next);
    // Chưa chọn tỉnh ⇒ chưa ghép (tránh phần huyện/xã bị hiểu nhầm là tên tỉnh ở lần mở sau)
    const v = next.province.trim() ? [next.detail.trim().replace(/,+$/, ""), next.province.trim()].filter(Boolean).join(", ") : next.detail.trim();
    setEmitted(v);
    onChange(v);
  };
  return (
    <div className="w-full">
      {label && <label className={labelCls}>{label}</label>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
        <ProvincePicker value={st.province} onChange={(p) => emit({ ...st, province: p })} allowLegacy disabled={disabled} placeholder="Tỉnh / thành phố quê quán" />
        <CustomInput
          value={st.detail}
          onChange={(e) => emit({ ...st, detail: e.target.value })}
          placeholder="Huyện / xã / giáo xứ quê (tùy chọn)"
          maxLength={140}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Địa chỉ theo địa giới hiện hành: số nhà/đường/thôn + xã/phường + tỉnh/thành
// ---------------------------------------------------------------------
export interface AddressPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}

export function AddressPicker({ label, value, onChange, disabled, maxLength = 200, className }: AddressPickerProps) {
  const { provinces, error, isLoading, retry } = useProvinces("2025");
  const [province, setProvince] = useState<GeoProvinceDto | null>(null);
  const [ward, setWard] = useState<GeoWardDto | null>(null);
  const [detail, setDetail] = useState("");
  // Chuỗi đã lưu mà không tách được theo danh mục mới (địa giới cũ, nhập tay) ⇒ giữ nguyên cho tới khi người dùng chọn lại
  const [legacyText, setLegacyText] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [parsedFor, setParsedFor] = useState<string | null>(null);
  const { wards, isLoading: wardsLoading } = useWards(province?.code ?? null);
  const [pendingWard, setPendingWard] = useState<string | null>(null);

  // Điền sẵn từ chuỗi đang lưu (một lần mỗi khi giá trị đổi từ bên ngoài, vd. mở hồ sơ khác)
  useEffect(() => {
    if (isLoading || !provinces.length || value === parsedFor) return;
    if (value === composeAddress(detail, ward?.name ?? null, province?.name ?? null)) {
      setParsedFor(value);
      return;
    }
    const parts = addressParts(value);
    const p = parts.length ? findProvince(parts[parts.length - 1], provinces) : null;
    setProvince(p);
    setWard(null);
    if (p) {
      setPendingWard(parts.length >= 2 ? parts[parts.length - 2] : null);
      setDetail(parts.slice(0, -1).join(", "));
      setLegacyText(null);
    } else {
      setPendingWard(null);
      setDetail("");
      setLegacyText(value.trim() ? value : null);
    }
    setParsedFor(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, provinces, isLoading]);

  // Khi danh sách xã/phường về: khớp phần trước tên tỉnh với một xã/phường ⇒ tách khỏi phần chi tiết
  useEffect(() => {
    if (!pendingWard || !wards.length) return;
    const w = findWard(pendingWard, wards);
    if (w) {
      setWard(w);
      setDetail((d) => addressParts(d).slice(0, -1).join(", "));
    }
    setPendingWard(null);
  }, [pendingWard, wards]);

  const emit = (d: string, w: GeoWardDto | null, p: GeoProvinceDto | null) => {
    const next = composeAddress(d, w?.name ?? null, p?.name ?? null);
    setParsedFor(next);
    setLegacyText(null);
    onChange(next);
  };

  if (error || manual) {
    return (
      <div className={cn("w-full", className)}>
        <CustomInput label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} disabled={disabled} placeholder="Số nhà, đường/thôn, xã/phường, tỉnh/thành" />
        {error && !manual ? (
          <Unavailable onRetry={retry} />
        ) : (
          <button
            type="button"
            onClick={() => {
              setManual(false);
              setParsedFor(null);
            }}
            className="mt-1 text-[10.5px] font-bold text-primary hover:underline"
          >
            Chọn tỉnh/thành, xã/phường từ danh mục
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label className="text-xs font-bold text-gray-700">{label}</label>
          <button type="button" onClick={() => setManual(true)} disabled={disabled} className="text-[10.5px] font-bold text-gray-400 hover:text-primary">
            Nhập tay
          </button>
        </div>
      )}
      {legacyText && (
        <p className="mb-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-[10.5px] text-amber-800 flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Đang lưu: <b>{legacyText}</b> — theo địa giới cũ hoặc nhập tay. Giữ nguyên, hoặc chọn tỉnh/thành và xã/phường mới bên dưới để cập nhật.
          </span>
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <GeoCombobox
          items={provinces}
          selected={province}
          text={province?.name ?? ""}
          onPick={(p) => {
            setProvince(p);
            setWard(null);
            emit(detail, null, p);
          }}
          placeholder="Tỉnh / thành phố"
          loading={isLoading}
          disabled={disabled}
        />
        <GeoCombobox
          items={wards}
          selected={ward}
          text={ward?.name ?? ""}
          onPick={(w) => {
            setWard(w);
            emit(detail, w, province);
          }}
          placeholder={province ? "Xã / phường / đặc khu" : "Chọn tỉnh/thành trước"}
          loading={!!province && wardsLoading}
          disabled={disabled || !province}
        />
        <div className="sm:col-span-2">
          <CustomInput
            value={detail}
            onChange={(e) => {
              setDetail(e.target.value);
              if (province || !legacyText) emit(e.target.value, ward, province);
            }}
            placeholder="Số nhà, ngõ, đường / thôn, xóm"
            maxLength={120}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
