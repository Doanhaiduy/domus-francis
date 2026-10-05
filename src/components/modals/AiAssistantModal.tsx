"use client";

// Trợ lý hỏi đáp nội quy/quy trình (RAG): chỉ trả lời từ nội quy, thông báo và lịch mà chính người hỏi được xem; luôn trích nguồn.
import React, { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Bot, FileText, Megaphone, CalendarDays } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type { PolicyRagOutput } from "@/lib/types/ai";
import { AiConsentNotice, AiLabel } from "@/components/ai/AiParts";

interface Turn {
  q: string;
  a?: PolicyRagOutput;
  provider?: string | null;
  error?: string;
}

const SAMPLES = ["Giờ giới nghiêm của nhà là mấy giờ?", "Quy định về khách đến thăm phòng?", "Tuần này có sự kiện gì?"];
const KIND_ICON = { policy: FileText, announcement: Megaphone, event: CalendarDays } as const;

export default function AiAssistantModal() {
  const { closeModal, showToast } = useApp();
  const { available, needsConsent, reason, refresh } = useAiTask("community.policy_rag");
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [consentDone, setConsentDone] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch {
      // Bỏ qua nếu môi trường không hỗ trợ smooth scroll
    }
  }, [turns, busy]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (question.length < 3 || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: question }]);
    try {
      const r = await aiApi.run("community.policy_rag", { question });
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: r.output, provider: r.provider } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: errorMessage(e) } : x)));
    } finally {
      setBusy(false);
    }
  };

  const blocked = needsConsent && !consentDone;

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900 text-sm">Trợ lý Lưu Xá</h3>
            <p className="text-[11px] text-gray-500">Hỏi nội quy, thông báo, lịch sinh hoạt — có trích nguồn</p>
          </div>
        </div>
        <button onClick={closeModal} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400" title="Đóng">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-[240px]">
        {!available && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
            Trợ lý AI hiện chưa dùng được{reason ? `: ${reason}` : "."} Bạn vẫn xem được nội quy ở mục Diễn đàn / Thông báo.
          </div>
        )}
        {available && blocked && <AiConsentNotice onDone={() => setConsentDone(true)} />}

        {available && !blocked && turns.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500">Bạn có thể hỏi, ví dụ:</p>
            {SAMPLES.map((s) => (
              <button key={s} onClick={() => ask(s)} className="text-left px-3 py-2 rounded-xl bg-surface-container-low hover:bg-purple-50 text-xs font-medium text-gray-700 transition">
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="self-end max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-white text-xs font-medium whitespace-pre-wrap">{t.q}</div>
            {t.a && (
              <div className="self-start max-w-[92%] px-3.5 py-3 rounded-2xl rounded-bl-md bg-surface-container-low text-xs text-gray-800 flex flex-col gap-2">
                <p className="whitespace-pre-wrap leading-relaxed">{t.a.answer}</p>
                {!t.a.confident && <p className="text-[11px] text-amber-700">Mình chưa chắc chắn — hãy xác nhận lại với Ban điều hành.</p>}
                {t.a.sources && Array.isArray(t.a.sources) && t.a.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.a.sources.map((s, idx) => {
                      const Icon = (s?.kind && KIND_ICON[s.kind as keyof typeof KIND_ICON]) || FileText;
                      return (
                        <span key={s?.label || idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-[10px] font-semibold text-gray-600">
                          <Icon className="w-3 h-3" /> {s?.title || s?.label || "Nguồn"}
                        </span>
                      );
                    })}
                  </div>
                )}
                {t.provider && <AiLabel result={{ provider: t.provider as "groq" | "gemini", model: null, cached: false }} className="self-start" />}
              </div>
            )}
            {t.error && <div className="self-start max-w-[92%] px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-100 text-xs text-rose-700">{t.error}</div>}
          </div>
        ))}
        {busy && (
          <div className="self-start flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tìm trong nội quy…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex items-center gap-2 px-4 py-3 border-t border-gray-100"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={500}
          disabled={!available || blocked}
          placeholder="Nhập câu hỏi…"
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !available || blocked || q.trim().length < 3}
          className="p-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white disabled:opacity-50 transition"
          title="Gửi"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      <div className="px-5 pb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] text-gray-400">Câu trả lời do AI tạo, chỉ mang tính tham khảo. Đừng nhập thông tin cá nhân của người khác.</p>
        {available && !needsConsent && (
          <button
            type="button"
            onClick={async () => {
              try {
                await aiApi.setConsent(false);
                await refresh();
                setConsentDone(false);
                showToast("info", "Đã rút đồng ý — AI sẽ không xử lý nội dung của bạn nữa.");
              } catch (e) {
                showToast("error", errorMessage(e));
              }
            }}
            className="text-[10px] font-semibold text-gray-400 hover:text-rose-600 underline"
          >
            Rút đồng ý dùng AI
          </button>
        )}
      </div>
    </div>
  );
}
