"use client";

// Ô NHẬP CÓ GỢI Ý dùng chung (thay <datalist> của trình duyệt — danh sách gốc xấu, lệch giao diện, không có chế độ tối): vừa GÕ TỰ DO vừa chọn từ danh sách gợi ý
// vẽ bằng cùng kiểu với CustomSelect (FloatingPanel qua portal, tự lật lên khi hết chỗ, Esc chỉ đóng danh sách, không đóng hộp thoại).
// Giá trị luôn là chuỗi: chữ đang gõ được giữ nguyên; chỉ thay khi bấm một gợi ý, hoặc Enter trên mục đã tô sáng (↑ ↓ để tô sáng).
// Gõ để lọc (không cần dấu). Enter khi KHÔNG có mục nào được tô sáng thì không bị nuốt — chuyển cho onKeyDown của nơi dùng (vd. nhảy sang ô kế tiếp).
import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FloatingPanel } from "./FloatingPanel";
import { foldVi } from "@/lib/geo";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  /** Chữ hiển thị trong danh sách (mặc định = value) */
  label?: string;
  /** Dòng phụ nhỏ bên dưới */
  hint?: string;
}
export type ComboOptionInput = string | ComboOption;
export const toComboOption = (o: ComboOptionInput): ComboOption => (typeof o === "string" ? { value: o } : o);

/** Lọc gợi ý theo chữ đang gõ (không phân biệt hoa/thường và dấu). Rỗng ⇒ tất cả. */
export function filterComboOptions(options: ComboOptionInput[], text: string): ComboOption[] {
  const all = options.map(toComboOption);
  const k = foldVi(text.trim());
  if (!k) return all;
  return all.filter((o) => foldVi(`${o.label ?? o.value} ${o.hint ?? ""}`).includes(k));
}

/** Phần thân danh sách gợi ý (dùng trong FloatingPanel) — CustomCombobox và TagsInput cùng dùng để giống hệt nhau. */
export function SuggestionList({
  id,
  options,
  active,
  onActive,
  onPick,
  selectedValue,
}: {
  id: string;
  options: ComboOption[];
  active: number;
  onActive: (i: number) => void;
  onPick: (i: number) => void;
  selectedValue?: string;
}) {
  const sel = selectedValue ? foldVi(selectedValue.trim()) : "";
  return (
    // giữ focus ở ô nhập khi bấm vào danh sách (ô nhập không bị blur trước khi kịp chọn)
    <div id={id} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      {options.map((o, i) => {
        const selected = !!sel && foldVi((o.label ?? o.value).trim()) === sel;
        return (
          <div
            key={`${o.value}-${i}`}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={selected}
            ref={(el) => {
              if (el && i === active) el.scrollIntoView({ block: "nearest" });
            }}
            onMouseEnter={() => onActive(i)}
            onClick={() => onPick(i)}
            className={cn(
              "relative cursor-pointer select-none py-2 pl-8 pr-4 rounded-xl transition-colors",
              i === active ? "bg-purple-50 text-primary font-bold" : "text-gray-800",
              selected && "font-bold text-primary bg-purple-50/60"
            )}
          >
            <span className="block truncate">{o.label ?? o.value}</span>
            {o.hint && <span className="block truncate text-[10px] font-normal text-gray-400">{o.hint}</span>}
            {selected && (
              <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-primary">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface CustomComboboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list" | "role" | "type"> {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Danh sách gợi ý: chuỗi hoặc { value, label?, hint? } */
  options: ComboOptionInput[];
  error?: string;
  hint?: React.ReactNode;
  /** Chiều rộng tối thiểu của bảng gợi ý (px) khi ô nhập hẹp */
  panelMinWidth?: number;
}

export function CustomCombobox({ label, value, onChange, options, error, hint, panelMinWidth, className, disabled, onKeyDown, onFocus, onClick, ...rest }: CustomComboboxProps) {
  const autoId = useId();
  const id = rest.id ?? autoId;
  const listId = `${id}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(-1);

  const filtered = useMemo(() => filterComboOptions(options, filter), [options, filter]);
  const close = useCallback(() => {
    setOpen(false);
    setFilter("");
    setActive(-1);
  }, []);
  const openList = () => {
    if (disabled) return;
    if (!open) {
      setFilter("");
      setActive(-1);
    }
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = filtered[i];
    if (!o) return;
    onChange(o.value);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!disabled && filtered.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!open) {
          openList();
          setActive(0);
          return;
        }
        setActive((i) => (e.key === "ArrowDown" ? Math.min(filtered.length - 1, i + 1) : Math.max(0, i - 1)));
        return;
      }
      if (e.key === "Enter" && open && active >= 0) {
        e.preventDefault(); // chọn mục đang tô sáng; không gửi biểu mẫu
        pick(active);
        return;
      }
    }
    if (e.key === "Tab" || e.key === "Escape") close();
    onKeyDown?.(e);
  };

  const showPanel = open && filtered.length > 0;
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div ref={wrapRef} className="relative rounded-xl shadow-2xs">
        <input
          {...rest}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? `${listId}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          value={value}
          onFocus={(e) => {
            openList();
            onFocus?.(e);
          }}
          onClick={(e) => {
            openList();
            onClick?.(e);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setFilter(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-9 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-rose-400 focus:border-rose-500 focus:ring-rose-100"
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Mở danh sách gợi ý"
          // giữ con trỏ ở ô nhập (không blur) để bấm mũi tên xong vẫn gõ tiếp được
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close() : openList())}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-primary disabled:cursor-not-allowed"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showPanel && "rotate-180 text-primary")} aria-hidden="true" />
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] text-rose-500">{error}</p> : hint ? <div className="mt-1 text-[11px] text-gray-400">{hint}</div> : null}
      <FloatingPanel open={showPanel} onClose={close} anchorRef={wrapRef} minWidth={panelMinWidth} maxHeight={260} className="p-1 text-xs">
        <SuggestionList id={listId} options={filtered} active={active} onActive={setActive} onPick={pick} selectedValue={value} />
      </FloatingPanel>
    </div>
  );
}
