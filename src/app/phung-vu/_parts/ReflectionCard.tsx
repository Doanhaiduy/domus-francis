"use client";

import React, { useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, PenLine, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { liturgyApi, refreshLiturgy, useReflections } from "@/lib/data/community";
import { formatDate } from "@/lib/community-format";
import { CustomInput, CustomTextarea } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function ReflectionCard({ showToast }: { showToast: (type: "success" | "error" | "info", msg: string) => void }) {
  const { reflections, isLoading } = useReflections(6);
  const [idx, setIdx] = useState(0);
  const [writing, setWriting] = useState(false);
  const [ref, setRef] = useState("");
  const [quote, setQuote] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const r = reflections[Math.min(idx, Math.max(reflections.length - 1, 0))];

  return (
    <div className="p-5 rounded-3xl bg-purple-50/60 border border-purple-100 text-xs flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-primary font-bold min-w-0">
          <BookOpen className="w-4 h-4 shrink-0" />
          <span className="truncate">Góc Chia Sẻ Lời Chúa{r?.scriptureRef ? ` · ${r.scriptureRef}` : ""}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {reflections.length > 1 && (
            <>
              <button
                disabled={idx >= reflections.length - 1}
                onClick={() => setIdx((i) => i + 1)}
                className="p-1 rounded-lg hover:bg-purple-100 text-primary disabled:opacity-30"
                title="Bài cũ hơn"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={idx === 0}
                onClick={() => setIdx((i) => i - 1)}
                className="p-1 rounded-lg hover:bg-purple-100 text-primary disabled:opacity-30"
                title="Bài mới hơn"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={() => setWriting((v) => !v)} className="p-1 rounded-lg hover:bg-purple-100 text-primary" title="Chia sẻ suy niệm">
            <PenLine className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {writing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (body.trim().length < 10) return showToast("error", "Nội dung suy niệm tối thiểu 10 ký tự.");
            setBusy(true);
            try {
              await liturgyApi.createReflection({ scriptureRef: ref || null, quote: quote || null, body });
              await refreshLiturgy();
              setIdx(0);
              setWriting(false);
              setRef("");
              setQuote("");
              setBody("");
              showToast("success", "Đã chia sẻ suy niệm với cả nhà.");
            } catch (err) {
              showToast("error", errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-2"
        >
          <CustomInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Trích dẫn (vd: Ga 14, 27)" maxLength={80} />
          <CustomTextarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Câu Lời Chúa…" rows={2} maxLength={1000} />
          <CustomTextarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Suy niệm của bạn…" rows={3} maxLength={5000} required />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWriting(false)} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-[11px] font-bold text-gray-700">
              Hủy
            </button>
            <button type="submit" disabled={busy} className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-[11px] font-bold disabled:opacity-60">
              Chia sẻ
            </button>
          </div>
        </form>
      ) : r ? (
        <>
          {r.quote && <blockquote className="italic text-gray-800 leading-relaxed border-l-2 border-primary pl-3 my-1">“{r.quote}”</blockquote>}
          <p className="text-[11px] text-gray-500 whitespace-pre-line">
            Suy niệm từ Anh {r.author.name}: {r.body}
          </p>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>{r.weekOf ? `Tuần ${formatDate(r.weekOf)}` : formatDate(r.createdAt)}</span>
            {r.canDelete && (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-0.5 font-bold hover:text-rose-600">
                <Trash2 className="w-3 h-3" /> Gỡ
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-gray-500">{isLoading ? "Đang tải…" : "Chưa có bài suy niệm nào — hãy là người chia sẻ đầu tiên!"}</p>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!r) return;
          try {
            await liturgyApi.removeReflection(r.id);
            await refreshLiturgy();
            setIdx(0);
            showToast("success", "Đã gỡ bài suy niệm.");
          } catch (e) {
            showToast("error", errorMessage(e));
          }
        }}
        title="Gỡ bài suy niệm?"
        message="Bài chia sẻ sẽ không còn hiển thị với cộng đoàn."
        confirmText="Gỡ"
        variant="warning"
      />
    </div>
  );
}
