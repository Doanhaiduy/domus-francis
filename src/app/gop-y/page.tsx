"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EyeOff, Inbox, Loader2, MessageSquareHeart, MessageSquareText, Send, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { feedbackApi, useFeedback } from "@/lib/data/feedback";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_HINT,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABEL,
  type FeedbackCategory,
  type FeedbackDto,
  type FeedbackStatus,
} from "@/lib/types/feedback";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomSelect, CustomTextarea, CustomToggle, ImageUploadDropzone } from "@/components/ui/FormControls";
import { previewUrl } from "@/components/ui/ImageUploadDropzone";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<FeedbackStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  reviewing: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
  declined: "bg-gray-200 text-gray-700",
};
const CATEGORY_STYLE: Record<FeedbackCategory, string> = {
  bug: "bg-rose-50 text-rose-700 border-rose-100",
  idea: "bg-purple-50 text-purple-700 border-purple-100",
  ux: "bg-sky-50 text-sky-700 border-sky-100",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const fmt = (iso: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

type Tab = "mine" | "all";

export default function FeedbackPage() {
  const { showToast } = useApp();
  const { data, isLoading } = useFeedback();
  const [tab, setTab] = useState<Tab>("mine");
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");
  const [toDelete, setToDelete] = useState<FeedbackDto | null>(null);

  const canManage = data?.canManage ?? false;
  const list = tab === "all" ? (data?.all ?? []) : (data?.mine ?? []);
  const shown = useMemo(() => (tab === "all" && filter !== "all" ? list.filter((f) => f.status === filter) : list), [list, tab, filter]);
  const countOf = (s: FeedbackStatus) => (data?.all ?? []).filter((f) => f.status === s).length;

  const remove = async () => {
    const f = toDelete;
    setToDelete(null);
    if (!f) return;
    try {
      await feedbackApi.remove(f.id);
      showToast("success", "Đã xóa góp ý.");
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col w-full gap-6 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5"><MessageSquareHeart className="w-6 h-6 text-primary" /> Góp ý về ứng dụng</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">Gặp lỗi, thấy chỗ khó dùng hay muốn ứng dụng có thêm gì đó? Cứ nói với chúng tôi — mỗi góp ý của anh em giúp ứng dụng tốt hơn cho cả nhà.</p>
      </div>

      <FeedbackForm />

      {canManage && (
        <div role="tablist" className="inline-flex p-1 rounded-xl bg-gray-100 gap-1 self-start">
          {([["mine", "Góp ý của tôi"], ["all", "Tất cả góp ý"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", tab === k ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}>
              {label}
              {k === "all" && (data?.newCount ?? 0) > 0 && <span className="bg-error-container text-on-error-container text-[10px] font-bold px-1.5 py-0.5 rounded-full">{data!.newCount}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "all" && canManage && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
          {([["all", "Tất cả", (data?.all ?? []).length], ...FEEDBACK_STATUSES.map((s) => [s, FEEDBACK_STATUS_LABEL[s], countOf(s)])] as [FeedbackStatus | "all", string, number][]).map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("px-3 py-1 rounded-full text-[11px] font-bold border transition", filter === k ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300")}>
              {label} <span className={filter === k ? "text-white/80" : "text-gray-400"}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-28 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{tab === "all" ? "Không có góp ý nào ở mục này" : "Bạn chưa gửi góp ý nào"}</p>
          {tab === "mine" && <p className="text-sm text-gray-500 mt-1">Điền vào biểu mẫu phía trên để gửi góp ý đầu tiên.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 items-start">
          {shown.map((f) => (
            <FeedbackItem key={f.id} item={f} manage={tab === "all" && canManage} onDelete={() => setToDelete(f)} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Xóa góp ý?"
        message="Góp ý này sẽ bị xóa khỏi danh sách."
        confirmText="Xóa"
        cancelText="Giữ lại"
        variant="danger"
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Biểu mẫu gửi góp ý
// ---------------------------------------------------------------------
function FeedbackForm() {
  const { showToast } = useApp();
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [content, setContent] = useState("");
  const [evidence, setEvidence] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [page, setPage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mở từ chân trang: /gop-y?from=<màn hình đang xem> ⇒ ghi nhận màn hình liên quan
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from && from.startsWith("/") && !from.startsWith("/gop-y")) setPage(from.slice(0, 200));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 10) return showToast("error", "Hãy viết góp ý rõ hơn một chút (tối thiểu 10 ký tự).");
    setBusy(true);
    try {
      await feedbackApi.create({ category, content: content.trim(), pagePath: page, isAnonymous: anonymous, evidenceFileId: evidence || null });
      showToast("success", "Đã gửi góp ý — cảm ơn bạn!");
      setContent("");
      setEvidence("");
      setAnonymous(false);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-3xl border border-purple-100 p-5 sm:p-6 space-y-4 max-w-3xl">
      <div>
        <p className="text-xs font-bold text-gray-700 mb-2">Bạn muốn góp ý về điều gì?</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Loại góp ý">
          {FEEDBACK_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn("text-left rounded-2xl border p-3 transition", category === c ? "border-primary bg-purple-50 ring-2 ring-purple-200" : "border-gray-200 hover:border-purple-300")}
            >
              <span className="block text-xs font-extrabold text-gray-900">{FEEDBACK_CATEGORY_LABEL[c]}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{FEEDBACK_CATEGORY_HINT[c]}</span>
            </button>
          ))}
        </div>
      </div>

      <CustomTextarea label="Nội dung góp ý" value={content} onChange={(e) => setContent(e.target.value)} rows={5} maxLength={2000} placeholder="Mô tả càng cụ thể càng tốt: bạn đang làm gì, thấy gì, mong muốn thế nào…" hint={`${content.trim().length}/2000 ký tự`} />

      {page && (
        <p className="text-[11px] text-gray-500 inline-flex items-center gap-1.5">
          Màn hình liên quan: <code className="px-1.5 py-0.5 rounded bg-gray-100 font-mono">{page}</code>
          <button type="button" onClick={() => setPage(null)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400" aria-label="Bỏ màn hình liên quan"><X className="w-3 h-3" /></button>
        </p>
      )}

      <ImageUploadDropzone label="Ảnh chụp màn hình (không bắt buộc)" value={evidence} onChange={setEvidence} bucket="attachments" placeholder="Chụp hoặc chọn ảnh màn hình đang gặp vấn đề" helperText="Ảnh giúp chúng tôi hiểu nhanh hơn. Thông tin vị trí trong ảnh được xóa trước khi lưu." />

      <CustomToggle checked={anonymous} onChange={setAnonymous} label="Ẩn tên khi gửi" description="Người quản lý sẽ không thấy tên bạn trong góp ý này. Bạn vẫn xem được câu trả lời ở mục “Góp ý của tôi”." />

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Gửi góp ý
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Một góp ý (của mình, hoặc của mọi người khi là người quản lý)
// ---------------------------------------------------------------------
function FeedbackItem({ item: f, manage, onDelete }: { item: FeedbackDto; manage: boolean; onDelete: () => void }) {
  const { showToast } = useApp();
  const [status, setStatus] = useState<FeedbackStatus>(f.status);
  const [response, setResponse] = useState(f.response ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(f.status);
    setResponse(f.response ?? "");
  }, [f.status, f.response]);

  const dirty = status !== f.status || response.trim() !== (f.response ?? "");

  const save = async () => {
    setBusy(true);
    try {
      await feedbackApi.update(f.id, { status: status !== f.status ? status : undefined, response: response.trim() !== (f.response ?? "") ? response.trim() || null : undefined });
      showToast("success", response.trim() !== (f.response ?? "") && response.trim() ? "Đã lưu và báo người gửi." : "Đã cập nhật.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn("bg-white border rounded-2xl p-4 sm:p-5 space-y-3", f.status === "new" ? "border-amber-200" : "border-purple-100", busy && "opacity-60 pointer-events-none")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold border", CATEGORY_STYLE[f.category])}>{FEEDBACK_CATEGORY_LABEL[f.category]}</span>
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", STATUS_STYLE[f.status])}>{FEEDBACK_STATUS_LABEL[f.status]}</span>
        <span className="text-[11px] text-gray-400 ml-auto">{fmt(f.createdAt)}</span>
      </div>

      {manage && (
        <p className="text-xs text-gray-600 flex items-center gap-1.5">
          {f.authorName ? <b className="text-gray-800">{f.authorName}</b> : <span className="inline-flex items-center gap-1 font-semibold text-gray-500"><EyeOff className="w-3.5 h-3.5" aria-hidden /> Ẩn danh</span>}
          {f.pagePath && <span>· màn hình <code className="px-1 rounded bg-gray-100 font-mono">{f.pagePath}</code></span>}
        </p>
      )}
      {!manage && f.pagePath && <p className="text-[11px] text-gray-500">Màn hình liên quan: <code className="px-1 rounded bg-gray-100 font-mono">{f.pagePath}</code></p>}

      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{f.content}</p>

      {f.evidenceFileId && (
        <a href={`/api/v1/files/${f.evidenceFileId}`} target="_blank" rel="noreferrer" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl(f.evidenceFileId, "thumb")} alt="Ảnh chụp màn hình đính kèm" className="max-h-36 rounded-xl border border-purple-100 object-cover" />
        </a>
      )}

      {manage ? (
        <div className="rounded-2xl bg-gray-50/70 border border-gray-100 p-3 space-y-3">
          <CustomSelect<FeedbackStatus> label="Trạng thái" value={status} onChange={setStatus} options={FEEDBACK_STATUSES.map((s) => ({ value: s, label: FEEDBACK_STATUS_LABEL[s] }))} />
          <CustomTextarea label="Trả lời (người gửi sẽ thấy)" value={response} onChange={(e) => setResponse(e.target.value)} rows={2} maxLength={1000} placeholder="VD: Cảm ơn bạn, mình đã ghi nhận và sẽ cập nhật trong bản tới." />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:underline"><Trash2 className="w-3.5 h-3.5" /> Xóa</button>
            <button type="button" disabled={!dirty} onClick={save} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container transition active:scale-95 disabled:opacity-50">Lưu</button>
          </div>
        </div>
      ) : (
        <>
          {f.response && (
            <div className="rounded-2xl bg-purple-50 border border-purple-100 p-3">
              <p className="text-[11px] font-extrabold text-primary flex items-center gap-1.5"><MessageSquareText className="w-3.5 h-3.5" aria-hidden /> Trả lời{f.respondedByName ? ` từ ${f.respondedByName}` : ""}{f.respondedAt ? ` · ${fmt(f.respondedAt)}` : ""}</p>
              <p className="text-sm text-gray-800 mt-1 leading-relaxed whitespace-pre-line">{f.response}</p>
            </div>
          )}
          {f.isMine && f.status === "new" && (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /> Rút lại góp ý</button>
          )}
        </>
      )}
    </li>
  );
}
