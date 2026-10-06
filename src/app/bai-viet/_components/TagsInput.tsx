"use client";

import React, { useState } from "react";
import { X } from "lucide-react";

const MAX_TAGS = 8;
const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").replace(/^#/, "");

/** Ô nhập thẻ (Enter hoặc dấu phẩy để thêm; Backspace khi ô trống để xóa thẻ cuối). Tối đa 8 thẻ. */
export function TagsInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState("");
  const listId = React.useId();

  const add = (raw: string) => {
    const parts = raw.split(",").map(norm).filter((t) => t.length >= 2 && t.length <= 30);
    if (!parts.length) return;
    onChange([...new Set([...value, ...parts])].slice(0, MAX_TAGS));
    setText("");
  };

  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor={`${listId}-in`}>Thẻ (tùy chọn)</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-purple-200 focus-within:border-primary transition-all">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-purple-50 border border-purple-100 text-xs font-bold text-primary">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Bỏ thẻ ${t}`} className="p-0.5 rounded-full hover:bg-purple-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <>
            <input
              id={`${listId}-in`}
              list={`${listId}-list`}
              value={text}
              onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(text);
                } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
              }}
              onBlur={() => add(text)}
              maxLength={30}
              placeholder={value.length ? "" : "VD: tuyển sinh 2026"}
              className="flex-1 min-w-[90px] bg-transparent text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none py-0.5"
            />
            <datalist id={`${listId}-list`}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
          </>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Enter để thêm. Người đọc bấm thẻ để xem các bài cùng chủ đề. Tối đa {MAX_TAGS} thẻ.</p>
    </div>
  );
}
