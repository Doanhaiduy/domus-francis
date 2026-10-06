"use client";

import React, { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { faqsApi, useFaqs } from "@/lib/data/public-site";
import type { FaqDto } from "@/lib/types/public-site";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomInput, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";

/** Quản lý câu hỏi thường gặp hiển thị ở /hoi-dap. */
export function FaqTab() {
  const { showToast } = useApp();
  const { faqs, isLoading } = useFaqs();
  const [editing, setEditing] = useState<FaqDto | "new" | null>(null);
  const [toDelete, setToDelete] = useState<FaqDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(id);
    try {
      await fn();
      if (okMsg) showToast("success", okMsg);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // Đổi chỗ với câu kề bên: hoán đổi sortOrder (đánh số lại tuần tự để tránh trùng giá trị)
  const move = (i: number, d: -1 | 1) => {
    const a = faqs[i];
    const b = faqs[i + d];
    if (!a || !b) return;
    run(a.id, async () => {
      const ordered = faqs.map((f) => f.id);
      [ordered[i], ordered[i + d]] = [ordered[i + d], ordered[i]];
      await Promise.all(ordered.map((id, idx) => (faqs.find((f) => f.id === id)!.sortOrder === idx + 1 ? null : faqsApi.update(id, { sortOrder: idx + 1 }))));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-xl">Những câu hỏi người ngoài hay hỏi (chi phí, nội quy, hồ sơ…). Hiển thị ở trang <b>Hỏi đáp</b> công khai và giúp Google hiện câu trả lời trực tiếp.</p>
        <div className="flex gap-2">
          <Link href="/hoi-dap" target="_blank" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition">
            <ExternalLink className="w-3.5 h-3.5" /> Xem trang
          </Link>
          <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
            <Plus className="w-4 h-4" /> Thêm câu hỏi
          </button>
        </div>
      </div>

      {editing && (
        <FaqForm
          key={editing === "new" ? "new" : editing.id}
          faq={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast("success", "Đã lưu câu hỏi.");
          }}
        />
      )}

      {isLoading && !faqs.length ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-20 rounded-2xl" />)}</div>
      ) : faqs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <HelpCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">Chưa có câu hỏi nào</p>
          <p className="text-sm text-gray-500 mt-1">Gợi ý: “Chi phí ở một tháng là bao nhiêu?”, “Điều kiện để được nhận vào ở?”, “Giờ giới nghiêm là mấy giờ?”.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {faqs.map((f, i) => (
            <li key={f.id} className={cn("bg-white border border-purple-100 rounded-2xl p-4 flex gap-3 items-start", busy === f.id && "opacity-60 pointer-events-none", !f.isActive && "bg-gray-50")}>
              <div className="flex flex-col shrink-0">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên trên" className="p-1 rounded text-gray-400 hover:text-primary disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === faqs.length - 1} aria-label="Xuống dưới" className="p-1 rounded text-gray-400 hover:text-primary disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900">{f.question}{!f.isActive && <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">Đang ẩn</span>}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{f.answer}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <IconBtn title={f.isActive ? "Ẩn khỏi trang công khai" : "Hiện lại"} onClick={() => run(f.id, () => faqsApi.update(f.id, { isActive: !f.isActive }))}>
                  {f.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </IconBtn>
                <IconBtn title="Sửa" onClick={() => setEditing(f)}><Pencil className="w-4 h-4" /></IconBtn>
                <IconBtn title="Xóa" danger onClick={() => setToDelete(f)}><Trash2 className="w-4 h-4" /></IconBtn>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const f = toDelete;
          setToDelete(null);
          if (f) run(f.id, () => faqsApi.remove(f.id), "Đã xóa câu hỏi.");
        }}
        title="Xóa câu hỏi?"
        message={<>Câu hỏi “<b>{toDelete?.question}</b>” sẽ biến mất khỏi trang Hỏi đáp.</>}
        confirmText="Xóa"
      />
    </div>
  );
}

function FaqForm({ faq, onCancel, onSaved }: { faq: FaqDto | null; onCancel: () => void; onSaved: () => void }) {
  const { showToast } = useApp();
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [isActive, setIsActive] = useState(faq?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (question.trim().length < 5) return showToast("error", "Câu hỏi tối thiểu 5 ký tự.");
    if (!answer.trim()) return showToast("error", "Hãy nhập câu trả lời.");
    setBusy(true);
    try {
      if (faq) await faqsApi.update(faq.id, { question, answer, isActive });
      else await faqsApi.create({ question, answer, isActive });
      onSaved();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border-2 border-primary/30 rounded-2xl p-5 space-y-3 shadow-sm">
      <h3 className="text-sm font-extrabold text-gray-900">{faq ? "Sửa câu hỏi" : "Thêm câu hỏi mới"}</h3>
      <CustomInput label="Câu hỏi *" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={250} placeholder="VD: Chi phí ở một tháng là bao nhiêu?" />
      <CustomTextarea label="Câu trả lời *" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} maxLength={4000} hint="Hỗ trợ **chữ đậm**, danh sách “- gạch đầu dòng” và liên kết [chữ](https://…)." />
      <CustomToggle checked={isActive} onChange={setIsActive} label="Hiển thị công khai" />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
        <button type="button" onClick={save} disabled={busy} className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container disabled:opacity-60 transition active:scale-95">{busy ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={cn("p-2 rounded-lg text-gray-500 transition", danger ? "hover:bg-rose-50 hover:text-rose-600" : "hover:bg-purple-50 hover:text-primary")}>
      {children}
    </button>
  );
}
