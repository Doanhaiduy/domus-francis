"use client";

import React from "react";
import Link from "next/link";
import {
  Banknote,
  CalendarClock,
  ChevronRight,
  Church,
  CircleCheck,
  ClipboardCheck,
  FileCheck2,
  Gavel,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  Inbox,
  Landmark,
  MailQuestion,
  MessageSquareHeart,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInbox } from "@/lib/data/inbox";
import type { InboxItem, InboxKind } from "@/lib/types/inbox";
import { Skeleton } from "@/components/ui/Skeleton";

// Gói B: thẻ "Việc cần xử lý" ở trang Tổng quan cho người quản lý (dùng useInbox() ở src/lib/data/inbox.ts).
// Mỗi dòng một loại việc: biểu tượng, nhãn, gợi ý ngắn, số việc — bấm mở thẳng trang/tab xử lý. Việc quá hạn tô đỏ và lên đầu.
// Ẩn hẳn với người không có quyền xử lý loại việc nào (thành viên thường).

const KIND_STYLE: Record<InboxKind, { icon: LucideIcon; tile: string }> = {
  leave: { icon: CalendarClock, tile: "bg-sky-50 text-sky-700" },
  expense_approve: { icon: FileCheck2, tile: "bg-violet-50 text-violet-700" },
  expense_pay: { icon: Banknote, tile: "bg-emerald-50 text-emerald-700" },
  application: { icon: UserPlus, tile: "bg-indigo-50 text-indigo-700" },
  inquiry: { icon: MailQuestion, tile: "bg-pink-50 text-pink-700" },
  claim: { icon: HandCoins, tile: "bg-teal-50 text-teal-700" },
  donation: { icon: HeartHandshake, tile: "bg-rose-50 text-rose-700" },
  bank_line: { icon: Landmark, tile: "bg-blue-50 text-blue-700" },
  mass_checkin: { icon: Church, tile: "bg-purple-50 text-purple-700" },
  transcript: { icon: GraduationCap, tile: "bg-cyan-50 text-cyan-700" },
  issue: { icon: Wrench, tile: "bg-orange-50 text-orange-700" },
  duty_review: { icon: ClipboardCheck, tile: "bg-amber-50 text-amber-700" },
  discipline_overdue: { icon: Gavel, tile: "bg-red-50 text-red-700" },
  feedback: { icon: MessageSquareHeart, tile: "bg-green-50 text-green-700" },
  data_request: { icon: ShieldCheck, tile: "bg-slate-100 text-slate-700" },
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

function InboxRow({ item }: { item: InboxItem }) {
  const style = KIND_STYLE[item.kind] ?? { icon: Inbox, tile: "bg-gray-100 text-gray-700" };
  const Icon = style.icon;
  const hint = item.hint ?? (item.urgent && item.overdue ? `${item.overdue} việc quá hạn` : null);
  return (
    <li>
      <Link
        href={item.href}
        aria-label={`${item.label}: ${item.count} việc${hint ? ` — ${hint}` : ""}`}
        className={cn(
          "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
          item.urgent ? "border-rose-200 bg-rose-50/50 hover:bg-rose-50" : "border-gray-100 hover:border-purple-200 hover:bg-surface-container-low"
        )}
      >
        <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", style.tile)}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-gray-900 leading-snug">{item.label}</span>
          {hint && (
            <span className={cn("flex items-start gap-1 text-[11px] mt-0.5 leading-snug", item.urgent ? "text-rose-600 font-semibold" : "text-gray-500")}>
              {item.urgent && <TriangleAlert className="w-3 h-3 mt-[1px] shrink-0" aria-hidden />}
              <span className="min-w-0">{hint}</span>
            </span>
          )}
        </span>
        <span
          className={cn(
            "min-w-[28px] h-7 px-2 rounded-full text-xs font-extrabold tabular-nums flex items-center justify-center shrink-0",
            item.urgent ? "bg-rose-600 text-white" : "bg-purple-100 text-purple-800"
          )}
        >
          {item.count > 99 ? "99+" : item.count}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary shrink-0 transition-colors" aria-hidden />
      </Link>
    </li>
  );
}

export function InboxCard() {
  const { inbox, eligible, isLoading, isValidating, mutate, total, overdue } = useInbox();
  if (!eligible) return null;
  // Lỗi tải (mạng / máy chủ) ⇒ ẩn thẻ thay vì làm rối trang Tổng quan; thanh bên vẫn tự thử lại mỗi phút
  if (!inbox && !isLoading) return null;
  const items = inbox?.items ?? [];

  return (
    <section aria-labelledby="inbox-card-title" className="bg-white rounded-3xl border border-purple-50 shadow-xs p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary-fixed text-primary flex items-center justify-center shrink-0 shadow-xs">
          <Inbox className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="inbox-card-title" className="text-base font-bold text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
            Việc cần xử lý
            {total > 0 && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-extrabold tabular-nums">{total}</span>}
            {overdue > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                <TriangleAlert className="w-3 h-3" aria-hidden /> {overdue} quá hạn
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Đang chờ bạn duyệt, xác nhận hoặc xử lý — bấm để mở đúng chỗ.</p>
        </div>
        <button
          type="button"
          onClick={() => void mutate()}
          disabled={isValidating}
          aria-label="Làm mới danh sách việc"
          title={inbox ? `Cập nhật lúc ${hhmm(inbox.generatedAt)} — bấm để làm mới` : "Làm mới"}
          className="p-2 -mr-1 -mt-1 rounded-xl text-gray-400 hover:text-primary hover:bg-purple-50 transition disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={cn("w-4 h-4", isValidating && "animate-spin")} />
        </button>
      </header>

      {!inbox ? (
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2" aria-busy="true" aria-label="Đang tải">
          {[0, 1, 2, 3].map((k) => (
            <li key={k} className={cn("flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5", k > 1 && "hidden sm:flex")}>
              <Skeleton className="w-9 h-9 rounded-xl" />
              <span className="flex-1 space-y-1.5">
                <Skeleton className="w-40 max-w-full h-3.5" />
                <Skeleton className="w-24 h-3" />
              </span>
              <Skeleton className="w-7 h-7 rounded-full" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 px-4 py-3.5">
          <CircleCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
          <p className="text-sm font-semibold text-emerald-800">Không có việc nào đang chờ 🎉</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((i) => (
            <InboxRow key={i.kind} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default InboxCard;
