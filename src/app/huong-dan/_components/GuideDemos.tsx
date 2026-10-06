"use client";

// Minh họa giao diện cho trang Hướng dẫn: dựng bằng cùng kiểu dáng (Tailwind) với ứng dụng thật, chỉ để xem — không gọi API.
import React, { useState } from "react";
import {
  Bell, Check, CheckCircle2, Clock3, Copy, Home, LayoutGrid, Search, Settings, Sparkles, Wallet, Calendar as CalendarIcon, UtensilsCrossed,
  X, ArrowRight, MoreHorizontal, QrCode, ShieldCheck,
} from "lucide-react";
import type { GuideDemo } from "@/content/guide";
import { cn } from "@/lib/utils";

/** Khung "Minh họa" bao quanh mỗi demo. */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-3 sm:p-4 overflow-hidden", className)}>
      <span className="absolute top-2 right-2.5 px-1.5 py-0.5 rounded-md bg-white/90 border border-gray-200 text-[9px] font-bold uppercase tracking-wider text-gray-400">Minh họa</span>
      {children}
    </div>
  );
}

const Pin = ({ n }: { n: number }) => (
  <span className="inline-flex w-4 h-4 shrink-0 rounded-full bg-rose-500 text-white text-[9px] font-black items-center justify-center shadow-sm">{n}</span>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="px-1.5 py-0.5 rounded-md border border-gray-300 border-b-2 bg-white text-[10px] font-mono font-bold text-gray-600">{children}</kbd>
);

// ---------------------------------------------------------------- Đăng nhập
function Login() {
  return (
    <Frame>
      <div className="mx-auto max-w-xs bg-white rounded-2xl border border-purple-50 shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-black">✝</span>
          <span className="text-sm font-black text-gray-900">Lưu Xá Phanxicô</span>
        </div>
        {[["Email", "ban@luuxa.local"], ["Mật khẩu", "••••••••••"]].map(([l, v]) => (
          <div key={l}>
            <p className="text-[10px] font-bold text-gray-500 mb-1">{l}</p>
            <div className="h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 flex items-center text-xs text-gray-700">{v}</div>
          </div>
        ))}
        <div className="h-9 rounded-xl bg-primary text-white text-xs font-bold flex items-center justify-center">Đăng nhập</div>
        <p className="text-[10px] text-gray-500 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-600" /> Lần đầu: hệ thống yêu cầu đổi mật khẩu</p>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Bố cục máy tính / điện thoại
const NAV = [
  { icon: <LayoutGrid className="w-3.5 h-3.5" />, label: "Tổng quan" },
  { icon: <Bell className="w-3.5 h-3.5" />, label: "Thông báo & Diễn đàn" },
  { icon: <CalendarIcon className="w-3.5 h-3.5" />, label: "Lịch & Xin phép", on: true },
  { icon: <Wallet className="w-3.5 h-3.5" />, label: "Thu Chi & Báo cáo" },
  { icon: <UtensilsCrossed className="w-3.5 h-3.5" />, label: "Bếp & Cơm" },
  { icon: <Settings className="w-3.5 h-3.5" />, label: "Cài Đặt & Hướng dẫn" },
];

function LayoutDesktop() {
  return (
    <Frame>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex h-52">
        <div className="relative w-32 sm:w-40 shrink-0 border-r border-gray-100 p-2 flex flex-col gap-0.5 bg-white">
          <span className="absolute -right-2 top-16"><Pin n={1} /></span>
          <p className="text-[10px] font-black text-gray-900 px-1.5 py-1">Lưu Xá Phanxicô</p>
          {NAV.map((n) => (
            <div key={n.label} className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold", n.on ? "bg-purple-100 text-primary" : "text-gray-500")}>
              {n.icon} <span className="truncate">{n.label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0 bg-surface-container-low/50">
          <div className="h-10 bg-white border-b border-gray-100 flex items-center gap-2 px-3">
            <div className="relative flex-1 max-w-[14rem] h-6 rounded-lg bg-surface-container-low flex items-center gap-1.5 px-2 text-[10px] text-gray-400">
              <Search className="w-3 h-3" /> Tìm kiếm nhanh… <span className="ml-auto"><Kbd>Ctrl K</Kbd></span>
              <span className="absolute -top-2 -left-2"><Pin n={2} /></span>
            </div>
            <span className="relative"><Bell className="w-4 h-4 text-gray-500" /><span className="absolute -top-2 -right-2"><Pin n={3} /></span></span>
            <span className="relative w-6 h-6 rounded-full bg-amber-400 text-white text-[9px] font-black flex items-center justify-center">VĐ<span className="absolute -top-2 -right-2"><Pin n={4} /></span></span>
          </div>
          <div className="p-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-white border border-gray-100" />)}
            <div className="col-span-3 h-16 rounded-xl bg-white border border-gray-100" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

function LayoutMobile() {
  const tabs = [
    { icon: <Home className="w-4 h-4" />, label: "Trang chủ", on: true },
    { icon: <CalendarIcon className="w-4 h-4" />, label: "Lịch" },
    { icon: <Wallet className="w-4 h-4" />, label: "Thu chi" },
    { icon: <MoreHorizontal className="w-4 h-4" />, label: "Thêm" },
  ];
  return (
    <Frame>
      <div className="mx-auto w-52 rounded-[1.6rem] border-[6px] border-gray-800 bg-white overflow-hidden shadow-md">
        <div className="h-8 bg-white border-b border-gray-100 flex items-center justify-between px-3">
          <span className="text-[10px] font-black text-gray-900">Lưu Xá</span>
          <Bell className="w-3.5 h-3.5 text-gray-500" />
        </div>
        <div className="h-32 bg-surface-container-low/60 p-2 flex flex-col gap-1.5">
          <div className="h-10 rounded-lg bg-white border border-gray-100" />
          <div className="h-10 rounded-lg bg-white border border-gray-100" />
          <div className="h-8 rounded-lg bg-white border border-gray-100" />
        </div>
        <div className="relative h-11 border-t border-gray-100 grid grid-cols-4 bg-white">
          {tabs.map((t) => (
            <div key={t.label} className={cn("flex flex-col items-center justify-center gap-0.5 text-[8px] font-bold", t.on ? "text-primary" : "text-gray-400")}>
              {t.icon}
              {t.label}
            </div>
          ))}
          <span className="absolute -top-2 right-3"><Pin n={1} /></span>
        </div>
      </div>
      <p className="text-center text-[10px] text-gray-500 mt-2 flex items-center justify-center gap-1"><Pin n={1} /> Mục không có ở thanh dưới nằm trong nút <b>Thêm</b></p>
    </Frame>
  );
}

// ---------------------------------------------------------------- RSVP
function Rsvp() {
  const [v, setV] = useState<"yes" | "no" | "maybe">("yes");
  const opts = [
    { k: "yes" as const, label: "Tham dự", on: "bg-emerald-500 text-white border-emerald-500" },
    { k: "no" as const, label: "Vắng", on: "bg-rose-500 text-white border-rose-500" },
    { k: "maybe" as const, label: "Chưa rõ", on: "bg-amber-400 text-white border-amber-400" },
  ];
  return (
    <Frame>
      <div className="max-w-sm bg-white rounded-2xl border border-gray-100 p-3 flex flex-col gap-2.5">
        <div>
          <p className="text-xs font-black text-gray-900">Họp nhà định kỳ Tháng 10</p>
          <p className="text-[10px] text-gray-500 mt-0.5">🕒 19:30 · 📍 Phòng sinh hoạt chung</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {opts.map((o) => (
            <button key={o.k} onClick={() => setV(o.k)} className={cn("py-2 rounded-xl border text-[11px] font-bold transition", v === o.k ? o.on : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Lịch phụng vụ
function CalendarLegend() {
  const cell = (day: number, lunar: string, o: { cls?: string; bar?: string; extra?: React.ReactNode } = {}) => (
    <div className={cn("relative h-14 rounded-xl border p-1.5 flex flex-col", o.cls ?? "bg-white border-gray-100")}>
      <span className="text-xs font-bold text-gray-800">{day}</span>
      <span className="text-[8px] text-gray-400">{lunar}</span>
      {o.bar && <span className={cn("absolute left-1.5 right-1.5 bottom-1 h-1 rounded-full", o.bar)} />}
      {o.extra && <span className="absolute top-1 right-1 text-[10px] leading-none">{o.extra}</span>}
    </div>
  );
  const legend: [string, React.ReactNode, string][] = [
    ["Vạch màu áo lễ + số nhỏ là **ngày âm lịch**", cell(6, "25/8", { bar: "bg-green-500" }), "Thường niên"],
    ["Ô **vàng**: lễ trọng / Tết", cell(8, "27/8", { cls: "bg-amber-50 border-amber-200", bar: "bg-white border border-gray-200" }), "Lễ trọng"],
    ["Ô có **⭐**: lễ Bổn mạng của nhà", cell(4, "13/8", { cls: "bg-amber-50 border-amber-300", extra: "⭐" }), "Bổn mạng"],
    ["Ô **màu khác**: ngày đặc biệt của nhà", cell(15, "5/9", { cls: "bg-sky-50 border-sky-200" }), "Đặc biệt"],
    ["**⛪**: ngày phải check-in đi lễ", cell(11, "30/8", { bar: "bg-green-500", extra: "⛪" }), "Check-in"],
  ];
  return (
    <Frame>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {legend.map(([text, node, name]) => (
          <div key={name} className="flex items-center gap-3">
            <div className="w-14 shrink-0">{node}</div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-900">{name}</p>
              <p className="text-[10.5px] text-gray-500 leading-snug">{text.split("**").map((p, i) => (i % 2 ? <b key={i} className="text-gray-700">{p}</b> : p))}</p>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Trạng thái đóng quỹ
function PayStates() {
  const rows = [
    { name: "Hoàng Long", note: "Chưa đóng", pill: "bg-rose-50 text-rose-700 border-rose-200", actions: ["qr", "claim"] },
    { name: "Tuấn Kiệt", note: "Chờ xác nhận", pill: "bg-amber-50 text-amber-800 border-amber-200", actions: [] as string[] },
    { name: "Bảo Nam", note: "Đã đóng", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", actions: ["undo"] },
  ];
  return (
    <Frame>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {["Quỹ T7–T12", "ĐN T9", "ĐN T8"].map((c, i) => (
          <span key={c} className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border", i === 0 ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200")}>{c}</span>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="w-7 h-7 rounded-full bg-purple-100 text-primary text-[9px] font-black flex items-center justify-center shrink-0">{r.name.split(" ").map((w) => w[0]).join("")}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900 truncate">{r.name}</p>
              <p className="text-[10px] text-gray-400">300.000đ</p>
            </div>
            <span className={cn("px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap", r.pill)}>{r.note}</span>
            <div className="flex gap-1">
              {r.actions.includes("qr") && <span className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-bold text-gray-700 inline-flex items-center gap-1"><QrCode className="w-3 h-3" />Nộp qua QR</span>}
              {r.actions.includes("claim") && <span className="px-2 py-1 rounded-lg bg-primary text-white text-[10px] font-bold">Tôi đã đóng</span>}
              {r.actions.includes("undo") && <span className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-bold text-gray-500">Hoàn tác</span>}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function PayQr() {
  const [copied, setCopied] = useState<string | null>(null);
  const fields: [string, string][] = [["Số tài khoản", "797997977"], ["Số tiền", "300.000đ"], ["Nội dung", "QSH-2026-10 Hoàng Long"]];
  // QR giả: lưới ô xác định (không phải mã thật)
  const cells = Array.from({ length: 169 }, (_, i) => {
    const x = i % 13, y = Math.floor(i / 13);
    const finder = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
    return finder ? (x % 3 === 1 && y % 3 === 1) || x === 0 || y === 0 || x === 3 || y === 3 || x === 9 || x === 12 || y === 9 || y === 12 : (x * 7 + y * 13 + x * y) % 3 === 0;
  });
  return (
    <Frame>
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] w-28 h-28 shrink-0 p-1.5 rounded-xl border border-gray-200 bg-white">
          {cells.map((on, i) => <span key={i} className={on ? "bg-gray-900" : "bg-white"} />)}
        </div>
        <div className="w-full flex flex-col gap-1.5">
          <p className="text-[11px] font-black text-gray-900">MB Bank · DOAN HAI DUY</p>
          {fields.map(([l, v]) => (
            <div key={l} className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-gray-400 font-semibold">{l}</p>
                <p className="text-[11px] font-bold text-gray-900 truncate">{v}</p>
              </div>
              <button type="button" onClick={() => setCopied(l)} className="text-[10px] font-bold text-primary inline-flex items-center gap-1">
                {copied === l ? <><Check className="w-3 h-3" />Đã chép</> : <><Copy className="w-3 h-3" />Chép</>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Cơm
function Meal() {
  const [on, setOn] = useState({ lunch: true, dinner: true });
  const Row = ({ k, label, cutoff }: { k: "lunch" | "dinner"; label: string; cutoff: string }) => (
    <div className="flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-3 py-2.5">
      <span className="text-lg">{k === "lunch" ? "🍚" : "🍲"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900">{label}</p>
        <p className="text-[10px] text-gray-500 inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> Chốt lúc {cutoff}</p>
      </div>
      <button type="button" onClick={() => setOn((s) => ({ ...s, [k]: !s[k] }))} className={cn("w-11 h-6 rounded-full p-0.5 transition", on[k] ? "bg-emerald-500" : "bg-gray-300")} aria-pressed={on[k]}>
        <span className={cn("block w-5 h-5 rounded-full bg-white shadow transition-transform", on[k] && "translate-x-5")} />
      </button>
      <span className={cn("text-[10px] font-bold w-12", on[k] ? "text-emerald-700" : "text-gray-400")}>{on[k] ? "Có ăn" : "Nghỉ"}</span>
    </div>
  );
  return (
    <Frame>
      <div className="max-w-sm flex flex-col gap-2">
        <Row k="lunch" label="Cơm trưa" cutoff="09:00" />
        <Row k="dinner" label="Cơm tối" cutoff="15:00" />
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Trực tuần
function DutyWeek() {
  return (
    <Frame>
      <div className="max-w-md bg-white rounded-2xl border border-gray-100 p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tuần 05/10 – 11/10</p>
            <p className="text-xs font-black text-gray-900 mt-0.5">🧹 Trực vệ sinh sân nhà</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">Đã đánh giá</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {["ĐK", "TP"].map((n) => <span key={n} className="w-9 h-9 rounded-full border-2 border-white bg-purple-100 text-primary text-[10px] font-black flex items-center justify-center">{n}</span>)}
          </div>
          <p className="text-[11px] font-bold text-gray-800">Đình Khôi &amp; Thanh Phong</p>
          <div className="ml-auto relative w-12 h-12">
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#eef0ff" strokeWidth="4" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="#6d4aff" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${0.8 * 94.2} 94.2`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-primary">8/10</span>
          </div>
        </div>
        <p className="text-[11px] text-gray-600 italic bg-gray-50 rounded-lg px-3 py-2">“Sân sạch, nhớ gom lá khô góc cổng.”</p>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Zalo
function ZaloBubble() {
  return (
    <Frame>
      <div className="max-w-md mx-auto flex flex-col gap-2.5">
        {[
          { t: "⏰ SỰ KIỆN HÔM NAY & NGÀY MAI (Thứ Ba 06/10 – Thứ Tư 07/10)\nHôm nay: • 20:30 — Kinh Tối & Lần hạt Mân Côi\nNgày mai: • 20:30 — Kinh Tối & Lần hạt Mân Côi", f: "— 🤖 Tin tự động của hệ thống" },
          { t: "💰 NHẮC ĐÓNG QUỸ\n📌 Quỹ sinh hoạt tháng 10/2026 · hạn 15/10\n🔴 Còn 4 bạn chưa đóng", f: "— Thao tác bởi Văn Đức" },
        ].map((m, i) => (
          <div key={i} className="flex items-end gap-2">
            <span className="w-7 h-7 rounded-full bg-sky-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">B</span>
            <div className="rounded-2xl rounded-bl-sm bg-white border border-gray-200 px-3 py-2 shadow-sm max-w-[85%]">
              <p className="text-[9px] font-bold text-sky-700 mb-0.5">Bot Lưu Xá Phanxicô</p>
              <p className="text-[11px] text-gray-800 whitespace-pre-line leading-relaxed">{m.t}</p>
              <p className="text-[10px] text-gray-500 mt-1">{m.f}</p>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ZaloCalendar() {
  const chip = (n: number, cls: string) => <span className={cn("inline-flex items-center justify-center min-w-[1.1rem] h-[1rem] px-1 rounded-full text-[9px] font-black", cls)}>{n}</span>;
  const days: Record<number, React.ReactNode> = {
    1: chip(2, "bg-emerald-100 text-emerald-700"),
    2: chip(1, "bg-emerald-100 text-emerald-700"),
    3: <>{chip(1, "bg-emerald-100 text-emerald-700")}{chip(1, "bg-rose-100 text-rose-700")}</>,
    5: chip(1, "bg-gray-200 text-gray-600"),
    8: chip(2, "border border-purple-300 text-primary bg-white"),
    9: chip(1, "border border-purple-300 text-primary bg-white"),
    10: chip(1, "border border-purple-300 text-primary bg-white"),
  };
  return (
    <Frame>
      <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-2.5">
          <p className="text-[11px] font-black text-gray-900 text-center mb-1.5">Tháng 10, 2026</p>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => <span key={w} className="text-[8px] font-bold text-gray-400">{w}</span>)}
            {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
              <div key={d} className={cn("h-9 rounded-lg flex flex-col items-center pt-1 gap-0.5", d === 6 && "border border-primary bg-purple-50")}>
                <span className="text-[10px] font-bold text-gray-700 leading-none">{d}</span>
                <span className="flex gap-0.5">{days[d]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-black text-gray-900">Thứ Ba, 06/10/2026</p>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-800 w-10">07:40</span>
            <span className="text-[11px] font-bold text-gray-900">Nhắc sự kiện hôm nay / ngày mai</span>
            <span className="px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[9px] font-bold">Tự động</span>
            <span className="px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold">Đã gửi</span>
          </div>
          <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/30 px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-primary w-10">~7h</span>
            <span className="text-[11px] font-bold text-gray-900">Lịch nhắc lặp</span>
            <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-primary text-[9px] font-bold">Dự kiến</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Phiếu chi
function ApprovalFlow() {
  const nodes = [
    { t: "Lập phiếu chi", s: "Thủ quỹ / ai được giao", c: "bg-sky-50 border-sky-200 text-sky-800" },
    { t: "Dưới ngưỡng", s: "Thủ quỹ tự duyệt", c: "bg-emerald-50 border-emerald-200 text-emerald-800" },
    { t: "Từ ngưỡng", s: "2 chữ ký: Trưởng nhà + Thủ quỹ", c: "bg-amber-50 border-amber-200 text-amber-800" },
    { t: "Đã chi", s: "Sổ quỹ tự ghi", c: "bg-purple-50 border-purple-200 text-purple-800" },
  ];
  return (
    <Frame>
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
        {nodes.map((n, i) => (
          <React.Fragment key={n.t}>
            <div className={cn("flex-1 rounded-xl border px-3 py-2.5", n.c)}>
              <p className="text-[11px] font-black">{n.t}</p>
              <p className="text-[10px] opacity-80 mt-0.5">{n.s}</p>
            </div>
            {i < nodes.length - 1 && <ArrowRight className="w-4 h-4 text-gray-300 self-center rotate-90 sm:rotate-0 shrink-0" />}
          </React.Fragment>
        ))}
      </div>
    </Frame>
  );
}

function FundPreview() {
  return (
    <Frame>
      <div className="max-w-sm bg-white rounded-2xl border border-gray-100 p-3.5 flex flex-col gap-2">
        <p className="text-xs font-black text-gray-900">Lập kỳ quỹ T7–T12/2026</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-gray-50 px-2.5 py-1.5"><p className="text-[9px] text-gray-400 font-bold">Mức/người</p><p className="font-bold">300.000đ</p></div>
          <div className="rounded-lg bg-gray-50 px-2.5 py-1.5"><p className="text-[9px] text-gray-400 font-bold">Hạn nộp</p><p className="font-bold">15/07/2026</p></div>
        </div>
        <div className="rounded-lg bg-purple-50 border border-purple-100 px-3 py-2 text-[11px] font-bold text-primary">12 người × 300.000đ = 3.600.000đ</div>
        <div className="h-8 rounded-xl bg-primary text-white text-[11px] font-bold flex items-center justify-center">Lập kỳ quỹ</div>
      </div>
    </Frame>
  );
}

function ExpenseStates() {
  const st: [string, string][] = [
    ["Nháp", "bg-gray-100 text-gray-600 border-gray-200"],
    ["Chờ duyệt", "bg-amber-50 text-amber-800 border-amber-200"],
    ["Đã duyệt", "bg-sky-50 text-sky-700 border-sky-200"],
    ["Đã chi", "bg-emerald-50 text-emerald-700 border-emerald-200"],
    ["Từ chối", "bg-rose-50 text-rose-700 border-rose-200"],
  ];
  return (
    <Frame>
      <div className="flex flex-wrap gap-2">
        {st.map(([l, c]) => <span key={l} className={cn("px-2.5 py-1 rounded-full border text-[11px] font-bold", c)}>{l}</span>)}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- Admin
function Roles() {
  const sys: [string, string][] = [["Admin", "bg-rose-50 text-rose-700 border-rose-200"], ["Trưởng nhà", "bg-amber-50 text-amber-800 border-amber-200"], ["Thủ quỹ", "bg-emerald-50 text-emerald-700 border-emerald-200"], ["Thành viên", "bg-sky-50 text-sky-700 border-sky-200"]];
  return (
    <Frame>
      <p className="text-[10px] font-bold text-gray-500 mb-1.5">Vai trò hệ thống (không xóa được)</p>
      <div className="flex flex-wrap gap-2 mb-3">{sys.map(([l, c]) => <span key={l} className={cn("px-3 py-1 rounded-full border text-[11px] font-bold", c)}>{l}</span>)}</div>
      <p className="text-[10px] font-bold text-gray-500 mb-1.5">Vai trò tự tạo (Admin chọn quyền)</p>
      <div className="flex flex-wrap gap-2">{["Trưởng ban Phụng vụ", "Trưởng ban Ẩm thực", "Trưởng ban Truyền thông"].map((l) => <span key={l} className="px-3 py-1 rounded-full border border-dashed border-purple-300 bg-purple-50/50 text-primary text-[11px] font-bold">{l}</span>)}</div>
    </Frame>
  );
}

function ActivityLog() {
  const rows = [
    { who: "Văn Đức", what: "Lập lịch trực tuần", area: "Trực nhật", ok: true, time: "23:38:03", dev: "Chrome · Windows" },
    { who: "Minh Tuấn", what: "Báo đã đóng quỹ", area: "Thu chi & Quỹ", ok: true, time: "23:37:52", dev: "Safari · iOS" },
    { who: "Minh Tuấn", what: "Gửi tin vào nhóm Zalo", area: "Zalo & Tác vụ", ok: false, time: "23:37:35", dev: "Safari · iOS" },
  ];
  return (
    <Frame>
      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {rows.map((r, i) => (
          <div key={i} className="px-3 py-2.5 flex items-center gap-2.5 flex-wrap">
            <span className="w-7 h-7 rounded-full bg-purple-100 text-primary text-[9px] font-black flex items-center justify-center shrink-0">{r.who.split(" ").map((w) => w[0]).join("")}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-gray-900">{r.what}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-primary text-[9px] font-bold">{r.area}</span>
                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold", r.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200")}>
                  {r.ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}{r.ok ? "Thành công" : "Lỗi 403"}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">{r.who} · {r.dev}</p>
            </div>
            <span className="text-[11px] font-semibold text-gray-600 tabular-nums">{r.time}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function AiCard() {
  return (
    <Frame>
      <div className="max-w-md bg-white rounded-2xl border border-purple-50 shadow-xs p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center"><Sparkles className="w-4 h-4" /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900">AI nhận xét kết quả học tập của bạn</p>
            <p className="text-[10px] text-gray-500">So với năm học trước · chỉ bạn xem được</p>
          </div>
        </div>
        <p className="text-[11px] font-bold text-gray-900">GPA tăng 0,3 so với năm trước — đà tiến bộ ổn định.</p>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[["GPA", "3,4", "+0,3"], ["Tín chỉ", "24", "+2"], ["Rèn luyện", "88", "+4"]].map(([l, v, d]) => (
            <div key={l} className="rounded-lg bg-gray-50 border border-gray-100 py-1.5"><p className="text-[9px] text-gray-400 font-bold">{l}</p><p className="text-xs font-black">{v}</p><p className="text-[9px] font-bold text-emerald-600">{d}</p></div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function Shortcuts() {
  const rows: [React.ReactNode, string][] = [
    [<span key="1" className="flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>, "Mở tìm kiếm nhanh (trang, anh em, tạo nhanh việc)"],
    [<Kbd key="2">Esc</Kbd>, "Đóng hộp thoại / danh sách đang mở"],
    [<Kbd key="3">F5</Kbd>, "Tải lại trang khi dữ liệu chưa cập nhật"],
  ];
  return (
    <Frame>
      <div className="flex flex-col gap-2">
        {rows.map(([k, t], i) => (
          <div key={i} className="flex items-center gap-3"><div className="w-24 shrink-0">{k}</div><p className="text-[11px] text-gray-600">{t}</p></div>
        ))}
      </div>
    </Frame>
  );
}

const DEMOS: Record<GuideDemo, () => React.ReactElement> = {
  login: Login,
  "layout-desktop": LayoutDesktop,
  "layout-mobile": LayoutMobile,
  rsvp: Rsvp,
  "calendar-legend": CalendarLegend,
  "pay-states": PayStates,
  "pay-qr": PayQr,
  meal: Meal,
  "duty-week": DutyWeek,
  "zalo-bubble": ZaloBubble,
  "zalo-calendar": ZaloCalendar,
  "approval-flow": ApprovalFlow,
  "fund-preview": FundPreview,
  roles: Roles,
  "activity-log": ActivityLog,
  "ai-card": AiCard,
  shortcuts: Shortcuts,
  "expense-states": ExpenseStates,
};

export function DemoView({ name, caption }: { name: GuideDemo; caption?: string }) {
  const D = DEMOS[name];
  return (
    <figure className="my-3">
      <D />
      {caption && <figcaption className="mt-1.5 text-[11px] text-gray-500 text-center">{caption}</figcaption>}
    </figure>
  );
}
