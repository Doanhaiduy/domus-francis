"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Một dòng thông tin kèm nút sao chép (số tài khoản, nội dung chuyển khoản…). */
export function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch {
      /* trình duyệt chặn clipboard: người dùng vẫn chọn được văn bản */
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-purple-50/60 border border-purple-100 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`font-bold text-gray-900 break-all ${mono ? "font-mono tracking-wide text-lg" : ""}`}>{value}</p>
      </div>
      <button type="button" onClick={copy} aria-label={`Sao chép ${label}`} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-purple-200 text-xs font-bold text-primary hover:bg-purple-50 active:scale-95 transition">
        {ok ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        {ok ? "Đã chép" : "Sao chép"}
      </button>
    </div>
  );
}
