"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { SuggestionList, filterComboOptions } from "@/components/ui/CustomCombobox";

const MAX_TAGS = 8;
const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").replace(/^#/, "");

/**
 * Ô nhập thẻ (Enter hoặc dấu phẩy để thêm; Backspace khi ô trống để xóa thẻ cuối). Tối đa 8 thẻ.
 * Gợi ý thẻ đã dùng hiện ở bảng nổi cùng kiểu với các ô chọn khác (↑ ↓ để tô sáng, Enter / bấm để thêm); Enter khi chưa tô sáng mục nào thì thêm đúng chữ đang gõ.
 */
export function TagsInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = React.useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => filterComboOptions(suggestions.filter((s) => !value.includes(s)), text),
    [suggestions, value, text]
  );
  const closeList = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  const add = (raw: string) => {
    const parts = raw.split(",").map(norm).filter((t) => t.length >= 2 && t.length <= 30);
    if (!parts.length) return;
    onChange([...new Set([...value, ...parts])].slice(0, MAX_TAGS));
    setText("");
    setActive(-1);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    add(o.value);
    setActive(-1);
  };

  const showPanel = open && options.length > 0;

  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor={`${listId}-in`}>Thẻ (tùy chọn)</label>
      <div ref={wrapRef} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-purple-200 focus-within:border-primary transition-all">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-purple-50 border border-purple-100 text-xs font-bold text-primary">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Bỏ thẻ ${t}`} className="p-0.5 rounded-full hover:bg-purple-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <input
            id={`${listId}-in`}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && active >= 0 ? `${listId}-list-opt-${active}` : undefined}
            autoComplete="off"
            value={text}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              if (e.target.value.includes(",")) add(e.target.value);
              else setText(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length) {
                e.preventDefault();
                if (!open) {
                  setOpen(true);
                  setActive(0);
                } else setActive((i) => (e.key === "ArrowDown" ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1)));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (showPanel && active >= 0) pick(active);
                else add(text);
              } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
              else if (e.key === "Tab") closeList();
            }}
            // thêm chữ đang gõ khi rời ô — trừ khi đang bấm vào một gợi ý (mousedown vào bảng đã được giữ focus nên không rơi vào đây)
            onBlur={() => add(text)}
            maxLength={30}
            placeholder={value.length ? "" : "VD: tuyển sinh 2026"}
            className="flex-1 min-w-[90px] bg-transparent text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none py-0.5"
          />
        )}
      </div>
      <FloatingPanel open={showPanel} onClose={closeList} anchorRef={wrapRef} maxHeight={240} className="p-1 text-xs">
        <SuggestionList id={`${listId}-list`} options={options} active={active} onActive={setActive} onPick={pick} />
      </FloatingPanel>
      <p className="mt-1 text-[11px] text-gray-400">Enter để thêm. Người đọc bấm thẻ để xem các bài cùng chủ đề. Tối đa {MAX_TAGS} thẻ.</p>
    </div>
  );
}
