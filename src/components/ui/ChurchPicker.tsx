"use client";

// Ô "Nhà thờ / giáo xứ đã dự lễ": chọn trong danh sách giáo xứ của Giáo phận Nha Trang (gõ để lọc, không cần dấu) hoặc TỰ NHẬP nếu nhà thờ
// không có trong danh sách. Giá trị luôn là chuỗi văn bản — chữ đang gõ được giữ nguyên, chỉ thay khi bấm chọn / Enter trên mục đã tô sáng.
import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FloatingPanel } from "./FloatingPanel";
import { searchChurches } from "@/lib/nha-trang-churches";
import { foldVi } from "@/lib/geo";
import { cn } from "@/lib/utils";

export interface ChurchPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
}

export function ChurchPicker({ label, value, onChange, placeholder = "Chọn giáo xứ hoặc tự nhập tên nhà thờ", disabled = false, className, maxLength = 160 }: ChurchPickerProps) {
  const id = useId();
  const listId = `${id}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(-1);

  const groups = useMemo(() => searchChurches(filter), [filter]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const valueKey = foldVi(value.trim());
  const close = useCallback(() => {
    setOpen(false);
    setFilter("");
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
    const c = flat[i];
    if (!c) return;
    onChange(c.name);
    close();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        setActive(0);
        return;
      }
      setActive((i) => (e.key === "ArrowDown" ? Math.min(flat.length - 1, i + 1) : Math.max(0, i - 1)));
    } else if (e.key === "Enter" && open) {
      e.preventDefault(); // không gửi nhầm cả biểu mẫu khi đang chọn nhà thờ
      if (active >= 0) pick(active);
      else close();
    } else if (e.key === "Tab" || e.key === "Escape") {
      close();
    }
  };

  let index = -1;
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div ref={wrapRef} className="relative rounded-xl shadow-2xs">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            onChange(e.target.value);
            setFilter(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-9 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Mở danh sách nhà thờ"
          // giữ con trỏ ở ô nhập (không blur) để bấm mũi tên xong vẫn gõ tiếp được
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close() : openList())}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-primary disabled:cursor-not-allowed"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180 text-primary")} aria-hidden="true" />
        </button>
      </div>
      <FloatingPanel open={open} onClose={close} anchorRef={wrapRef} maxHeight={300} className="p-1 text-xs">
        {/* giữ focus ở ô nhập khi bấm vào danh sách (ô nhập không bị blur trước khi kịp chọn) */}
        <div id={listId} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {flat.length === 0 && (
            <div className="px-3 py-2.5 text-gray-500 leading-relaxed">
              Không có trong danh sách{value.trim() ? <> — sẽ lưu đúng chữ bạn nhập: “<b className="text-gray-800">{value.trim()}</b>”.</> : "."}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{g.label}</div>
              {g.items.map((c) => {
                const i = ++index;
                const selected = foldVi(c.name) === valueKey;
                return (
                  <div
                    key={c.name}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={selected}
                    ref={(el) => {
                      if (el && i === active) el.scrollIntoView({ block: "nearest" });
                    }}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(i)}
                    className={cn(
                      "relative cursor-pointer select-none py-2 pl-8 pr-4 rounded-xl transition-colors",
                      i === active ? "bg-purple-50 text-primary font-bold" : "text-gray-800",
                      selected && "font-bold text-primary bg-purple-50/60"
                    )}
                  >
                    <span className="block truncate">{c.name}</span>
                    {c.hint && <span className="block truncate text-[10px] font-normal text-gray-400">{c.hint}</span>}
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-primary">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </FloatingPanel>
    </div>
  );
}
