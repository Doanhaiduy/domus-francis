"use client";

// Soạn tin nhắc đóng quỹ bằng AI: chỉ gửi số tiền + hạn nộp + kỳ — KHÔNG gửi tên người nợ (thiết kế 8.1.2). Người soạn sửa lại rồi tự gửi.
import React, { useState } from "react";
import { Sparkles, Copy, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useAiTask } from "@/lib/data/ai";
import { AiLabel, AiSuggestButton } from "@/components/ai/AiParts";
import type { ContributionPlanDto } from "@/lib/types/finance";
import type { AiResultDto } from "@/lib/types/ai";

export default function AiDuesMessage({ plan }: { plan: ContributionPlanDto | undefined }) {
  const { showToast } = useApp();
  const { available } = useAiTask("finance.dues_message");
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<"friendly" | "formal">("friendly");
  const [result, setResult] = useState<AiResultDto<"finance.dues_message"> | null>(null);
  const [text, setText] = useState("");

  if (!available || !plan) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", "Đã sao chép tin nhắn.");
    } catch {
      showToast("warning", "Trình duyệt không cho sao chép — hãy bôi đen và copy thủ công.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 text-xs font-bold"
      >
        <Sparkles className="w-3.5 h-3.5" /> Soạn tin nhắc quỹ
      </button>
      {open && (
        <div className="basis-full order-last p-4 rounded-2xl bg-violet-50/50 border border-violet-100 flex flex-col gap-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <p className="text-gray-600 leading-relaxed">
              Soạn lời nhắc cho khoản <b>{plan.name}</b> — {plan.amountVnd.toLocaleString("vi-VN")} đ/người, hạn {plan.dueDate.split("-").reverse().join("/")}. AI không nhận tên ai cả; bạn sửa lại rồi tự gửi vào nhóm.
            </p>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white text-gray-400" title="Đóng">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={tone} onChange={(e) => setTone(e.target.value as "friendly" | "formal")} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold">
              <option value="friendly">Giọng thân thiện</option>
              <option value="formal">Giọng trang trọng</option>
            </select>
            <AiSuggestButton
              task="finance.dues_message"
              label={result ? "Soạn lại" : "Soạn tin nhắc"}
              getInput={() => ({ amountVnd: plan.amountVnd, dueDate: plan.dueDate, periodLabel: plan.name.slice(0, 40), tone })}
              onResult={(r) => {
                setResult(r);
                setText(r.output.message);
              }}
            />
          </div>
          {result && (
            <div className="flex flex-col gap-2">
              <AiLabel result={result} className="self-start" />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={800}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-xs leading-relaxed focus:outline-none focus:border-primary"
              />
              <button onClick={copy} className="self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-violet-200 text-violet-700 font-bold hover:bg-violet-100">
                <Copy className="w-3.5 h-3.5" /> Sao chép
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
