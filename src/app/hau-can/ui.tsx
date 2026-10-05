"use client";
// Thành phần giao diện dùng chung trong trang Hậu cần (khung modal, xem ảnh lớn, chọn nhiều thành viên).
import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import type { Member } from "@/lib/types/members";

export function ModalShell({
  open,
  onClose,
  icon,
  iconClass = "bg-primary text-white",
  headerClass = "bg-purple-50/50",
  title,
  subtitle,
  maxWidth = "max-w-md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  iconClass?: string;
  headerClass?: string;
  title: string;
  subtitle?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <Portal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`bg-white rounded-3xl w-full ${maxWidth} overflow-hidden shadow-2xl border border-purple-100 flex flex-col max-h-[90vh]`}
        >
          <div className={`p-5 border-b border-gray-100 flex items-center justify-between ${headerClass}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`p-2 rounded-2xl font-bold text-lg shrink-0 ${iconClass}`}>{icon}</span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900 leading-tight">{title}</h3>
                {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white transition" aria-label="Đóng">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto custom-scroll flex-1">{children}</div>
        </div>
      </div>
    </Portal>
  );
}

export function Lightbox({ photo, onClose }: { photo: { url: string; title: string } | null; onClose: () => void }) {
  if (!photo) return null;
  return (
    <Portal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      >
        <div onClick={(e) => e.stopPropagation()} className="relative max-w-3xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col">
          <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
            <span className="text-sm font-bold truncate">{photo.title}</span>
            <button onClick={onClose} className="p-1 rounded-xl hover:bg-white/20 text-gray-300 hover:text-white transition" aria-label="Đóng">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={photo.title} className="w-full max-h-[75vh] object-contain bg-black" />
        </div>
      </div>
    </Portal>
  );
}

/** Chọn nhiều thành viên (đang ở) bằng ô tick, có tìm kiếm. */
export function MemberMultiPicker({
  members,
  value,
  onChange,
  label,
  busy = {},
}: {
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  /** memberId → ghi chú bận (đã có ca khác cùng ca/ngày) */
  busy?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return members.filter((m) => !k || m.fullName.toLowerCase().includes(k) || m.name.toLowerCase().includes(k) || m.room.toLowerCase().includes(k));
  }, [members, q]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-bold text-gray-700">{label}</label>
        <span className="text-[11px] text-primary font-bold">{value.length} người</span>
      </div>
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên hoặc phòng…"
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50/60 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto custom-scroll pr-1">
        {list.map((m) => {
          const on = value.includes(m.id);
          const note = busy[m.id];
          return (
            <label
              key={m.id}
              className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition ${
                on ? "border-primary bg-purple-50/70" : "border-gray-200 bg-gray-50/60 hover:bg-purple-50/50"
              }`}
              title={note}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="rounded text-primary focus:ring-primary accent-primary" />
              <span className="min-w-0">
                <span className="block font-semibold text-gray-800 truncate">{m.fullName}</span>
                <span className={`block text-[10px] truncate ${note ? "text-amber-600" : "text-gray-400"}`}>{note ?? m.room}</span>
              </span>
            </label>
          );
        })}
        {list.length === 0 && <p className="col-span-2 text-[11px] text-gray-400 p-2">Không tìm thấy thành viên phù hợp.</p>}
      </div>
    </div>
  );
}

export function Stars({ value, onChange, size = "w-5 h-5" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"} transition`}
          aria-label={`${n} sao`}
        >
          <svg viewBox="0 0 20 20" className={`${size} ${n <= value ? "text-amber-400" : "text-gray-200"}`} fill="currentColor">
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
