"use client";

import React, { useState } from "react";
import { Vote, Share2, Lock, EyeOff, ListChecks, Clock, Trash2, CheckCircle } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { formatPollForZalo, isoToVnDateTime } from "@/lib/events-format";
import { pollsApi, refreshEvents } from "@/lib/data/events";
import type { PollDto } from "@/lib/types/events";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  poll: PollDto;
  variant: "compact" | "full";
  canManage: boolean;
  canVote: boolean;
}

export default function PollCard({ poll, variant, canManage, canVote }: Props) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);

  const known = poll.options.every((o) => o.votes !== null);
  const totalVotes = known ? poll.options.reduce((s, o) => s + (o.votes ?? 0), 0) : 0;
  const mine = new Set(poll.myOptionIds);

  const vote = async (optionId: string) => {
    if (busy) return;
    if (!poll.isOpen) {
      showToast("info", "Cuộc biểu quyết đã đóng — không nhận thêm phiếu.");
      return;
    }
    if (!canVote) {
      showToast("error", "Tài khoản của bạn không có quyền bỏ phiếu.");
      return;
    }
    let next: string[];
    if (poll.isMultiSelect) {
      next = mine.has(optionId) ? [...mine].filter((x) => x !== optionId) : [...mine, optionId];
      if (next.length > poll.maxChoices) {
        showToast("error", `Chỉ được chọn tối đa ${poll.maxChoices} phương án — bỏ chọn một phương án trước.`);
        return;
      }
    } else {
      next = mine.has(optionId) ? [] : [optionId];
    }
    setBusy(true);
    try {
      await pollsApi.vote(poll.id, next);
      await refreshEvents();
      showToast("success", next.length === 0 ? "Đã rút phiếu biểu quyết." : mine.size ? "Đã đổi lựa chọn biểu quyết." : "Đã ghi nhận phiếu của bạn!");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyZalo = async () => {
    const ok = await copyTextToClipboard(formatPollForZalo(poll));
    showToast(ok ? "success" : "error", ok ? "Đã sao chép kết quả biểu quyết! Có thể dán ngay vào Zalo." : "Không thể tự động sao chép. Vui lòng thử lại!");
  };

  const doConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    if (!action) return;
    setBusy(true);
    try {
      if (action === "close") await pollsApi.close(poll.id);
      else await pollsApi.remove(poll.id);
      await refreshEvents();
      showToast("success", action === "close" ? "Đã đóng cuộc biểu quyết." : "Đã xóa cuộc biểu quyết.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const badges = (
    <>
      {!poll.isOpen && (
        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold inline-flex items-center gap-1">
          <Lock className="w-3 h-3" /> Đã đóng
        </span>
      )}
      {poll.isAnonymous && (
        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold inline-flex items-center gap-1">
          <EyeOff className="w-3 h-3" /> Ẩn danh
        </span>
      )}
      {poll.isMultiSelect && (
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold inline-flex items-center gap-1">
          <ListChecks className="w-3 h-3" /> Chọn tối đa {poll.maxChoices}
        </span>
      )}
      {poll.isOpen && poll.closesAt && (
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> Hạn {isoToVnDateTime(poll.closesAt)}
        </span>
      )}
    </>
  );

  const dialogs = (
    <ConfirmDialog
      isOpen={confirm !== null}
      onClose={() => setConfirm(null)}
      onConfirm={doConfirm}
      title={confirm === "close" ? "Đóng cuộc biểu quyết?" : "Xóa cuộc biểu quyết?"}
      message={
        confirm === "close"
          ? "Sau khi đóng, anh em không thể bỏ hoặc đổi phiếu nữa và kết quả được chốt."
          : "Cuộc biểu quyết chưa có phiếu nào sẽ bị xóa hẳn."
      }
      confirmText={confirm === "close" ? "Đóng biểu quyết" : "Xóa"}
      variant={confirm === "close" ? "warning" : "danger"}
    />
  );

  if (variant === "compact") {
    return (
      <div className="p-3 bg-white/90 rounded-xl border border-purple-100 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-bold text-gray-800 flex items-start gap-1">
            <Vote className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
            <span>Biểu quyết: {poll.question}</span>
          </span>
          <span className="text-[10px] font-mono text-gray-400 shrink-0">{poll.voters}/{poll.eligible}</span>
        </div>
        {(poll.isAnonymous || poll.isMultiSelect || !poll.isOpen) && <div className="flex flex-wrap gap-1">{badges}</div>}
        <div className="space-y-1.5">
          {poll.options.map((opt) => {
            const pct = known && totalVotes > 0 ? Math.round(((opt.votes ?? 0) / totalVotes) * 100) : 0;
            const isMyVote = mine.has(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => vote(opt.id)}
                disabled={busy}
                className={cn(
                  "w-full text-left p-2 rounded-lg text-xs border transition relative overflow-hidden flex items-center justify-between disabled:opacity-60",
                  isMyVote ? "border-primary bg-purple-50/80 font-bold text-primary" : "border-gray-200 hover:border-purple-200 bg-white text-gray-700",
                  !poll.isOpen && "cursor-default"
                )}
              >
                <div className="absolute left-0 top-0 bottom-0 bg-purple-100/40 -z-0" style={{ width: `${pct}%` }} />
                <span className="relative z-10 truncate pr-2">
                  {isMyVote ? "✓ " : ""}
                  {opt.label}
                </span>
                <span className="relative z-10 text-[10px] font-mono font-bold shrink-0">{known ? `${opt.votes} (${pct}%)` : "🔒"}</span>
              </button>
            );
          })}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm flex flex-col justify-between gap-5 group">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-primary text-[10px] font-bold truncate">
            {poll.eventTitle ? `${poll.eventTitle} (${poll.eventDate})` : "Biểu quyết chung"}
          </span>
          <span className="text-[11px] font-mono text-gray-400 shrink-0">
            {known ? `${totalVotes} lượt vote` : `${poll.voters} người đã vote`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">{badges}</div>

        <h3 className="text-base font-extrabold text-gray-900 leading-snug">{poll.question}</h3>
        {poll.description && <p className="text-xs text-gray-500 leading-relaxed">{poll.description}</p>}

        <div className="space-y-2 pt-2">
          {poll.options.map((opt) => {
            const pct = known && totalVotes > 0 ? Math.round(((opt.votes ?? 0) / totalVotes) * 100) : 0;
            const isMyVote = mine.has(opt.id);
            return (
              <div
                key={opt.id}
                onClick={() => vote(opt.id)}
                className={cn(
                  "p-3 rounded-2xl border transition-all relative overflow-hidden flex flex-col gap-1.5 group/opt",
                  poll.isOpen ? "cursor-pointer" : "cursor-default",
                  isMyVote ? "border-primary bg-purple-50/90 shadow-2xs" : "border-gray-200 hover:border-purple-300 bg-white",
                  busy && "opacity-60 pointer-events-none"
                )}
              >
                <div className="absolute left-0 top-0 bottom-0 bg-purple-100/60 -z-0" style={{ width: `${pct}%` }} />
                <div className="relative z-10 flex items-center justify-between text-xs font-bold gap-2">
                  <span className={cn(isMyVote ? "text-primary font-black" : "text-gray-900")}>
                    {isMyVote ? "✓ " : ""}
                    {opt.label}
                  </span>
                  <span className="font-mono text-primary text-xs shrink-0">{known ? `${opt.votes} (${pct}%)` : "🔒 ẩn"}</span>
                </div>
                {opt.voterNames && opt.voterNames.length > 0 && (
                  <div className="relative z-10 flex items-center gap-1 overflow-hidden pt-1">
                    <span className="text-[10px] text-gray-400">Đã vote:</span>
                    <span className="text-[10px] text-gray-600 truncate font-medium">{opt.voterNames.join(", ")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400">
          {poll.voters}/{poll.eligible} anh em đã biểu quyết
          {poll.isOpen && mine.size > 0 && " • Bấm lại lựa chọn của bạn để rút phiếu"}
          {!known && " • Kết quả từng phương án công bố khi đóng"}
        </p>
      </div>

      <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[11px] text-gray-400">
          Tạo ngày {poll.createdDate}
          {poll.createdByName ? ` • ${poll.createdByName}` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          {canManage && poll.isOpen && (
            <button
              onClick={() => setConfirm("close")}
              disabled={busy}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Đóng</span>
            </button>
          )}
          {canManage && !poll.hasVotes && (
            <button
              onClick={() => setConfirm("delete")}
              disabled={busy}
              title="Xóa biểu quyết chưa có phiếu"
              className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={copyZalo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition active:scale-95"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Copy Zalo</span>
          </button>
        </div>
      </div>
      {dialogs}
    </div>
  );
}
