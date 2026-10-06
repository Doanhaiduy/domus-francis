"use client";

import React, { useEffect, useState } from "react";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { errorMessage } from "@/lib/api";
import { revisionsApi, useRevisions } from "@/lib/data/public-site";
import type { ArticleDetail } from "@/lib/types/articles";
import { cn } from "@/lib/utils";

const fmt = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

/** Lịch sử chỉnh sửa: xem lại các bản cũ của bài và khôi phục khi lỡ sửa nhầm. */
export function RevisionsDialog({ articleId, onClose, onRestored, onError }: { articleId: string; onClose: () => void; onRestored: (a: ArticleDetail) => void; onError: (msg: string) => void }) {
  const { revisions, isLoading } = useRevisions(articleId);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = revisions.find((r) => r.id === pickedId) ?? revisions[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restore = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      onRestored(await revisionsApi.restore(articleId, picked.id));
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <div role="dialog" aria-modal="true" aria-label="Lịch sử chỉnh sửa" onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start gap-3 p-5 pb-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0"><History className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold text-gray-900">Lịch sử chỉnh sửa</h3>
              <p className="text-xs text-gray-500 mt-0.5">Mỗi lần bạn đổi tiêu đề, tóm tắt hoặc nội dung, bản trước đó được lưu lại (25 bản gần nhất). Khôi phục không làm mất bản hiện tại — nó cũng thành một bản cũ.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"><X className="w-4 h-4" /></button>
          </div>

          {isLoading && !revisions.length ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : !revisions.length ? (
            <p className="px-5 pb-8 pt-4 text-sm text-gray-500">Bài chưa có bản cũ nào — lịch sử xuất hiện sau lần sửa đầu tiên.</p>
          ) : (
            <div className="grid md:grid-cols-[250px_1fr] gap-0 min-h-0 flex-1 border-t border-gray-100">
              <ul className="overflow-y-auto custom-scroll max-h-48 md:max-h-none border-b md:border-b-0 md:border-r border-gray-100 p-2 space-y-1">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setPickedId(r.id)} className={cn("w-full text-left px-3 py-2 rounded-xl transition", picked?.id === r.id ? "bg-purple-50 ring-1 ring-primary/30" : "hover:bg-gray-50")}>
                      <span className="block text-xs font-bold text-gray-900">{fmt(r.createdAt)}</span>
                      <span className="block text-[11px] text-gray-500 truncate">{r.savedByName ? `${r.savedByName} · ` : ""}{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="overflow-y-auto custom-scroll p-5 min-h-[200px]">
                {picked && (
                  <>
                    <h4 className="text-lg font-extrabold text-gray-900 leading-snug">{picked.title}</h4>
                    {picked.summary && <p className="text-sm text-gray-600 mt-1">{picked.summary}</p>}
                    <div className="mt-4"><ArticleMarkdown source={picked.content.replaceAll("/api/v1/public/files/", "/api/v1/files/")} compact className="!text-[14px] !leading-7" /></div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="px-5 py-3.5 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Đóng</button>
            <button type="button" onClick={restore} disabled={!picked || busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary-container transition active:scale-95 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Khôi phục bản này
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
