"use client";

// Trợ lý AI của trình soạn bài công khai: gợi ý đề tài, viết nháp, chỉnh văn, gợi ý tiêu đề + tóm tắt.
// AI chỉ GỢI Ý — mọi kết quả đều hiện ra để người soạn xem, sửa rồi mới đưa vào bài; AI tắt/lỗi thì vẫn soạn tay như thường.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, FileText, Lightbulb, Loader2, RefreshCw, Sparkles, Wand2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type { AiResultDto, ArticleAssistInput, ArticleAssistOutput, ArticleImproveMode, ArticleLength, ArticleTone } from "@/lib/types/ai";
import { ARTICLE_CATEGORIES, articleCategoryLabel } from "@/lib/types/articles";
import { Portal } from "@/components/ui/Portal";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { AiLabel } from "@/components/ai/AiParts";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { cn } from "@/lib/utils";

type Output<A extends ArticleAssistOutput["action"]> = Extract<ArticleAssistOutput, { action: A }>;

/** Số chỗ AI để dấu "[cần bổ sung: …]" (thiếu dữ kiện) — người soạn phải điền trước khi đăng. */
export const countPlaceholders = (text: string) => (text.match(/\[cần bổ sung[^\]]*\]/gi) ?? []).length;

/** Gọi tác vụ AI viết bài; lỗi (hết hạn mức, AI tắt, mạng…) hiện thành thông báo tiếng Việt, trả null. */
export function useArticleAi() {
  const { showToast } = useApp();
  const { available, reason, task } = useAiTask("content.article_assist");
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <A extends ArticleAssistOutput["action"]>(input: ArticleAssistInput, force = false): Promise<(AiResultDto<"content.article_assist"> & { output: Output<A> }) | null> => {
      setBusy(true);
      try {
        const r = await aiApi.run("content.article_assist", input, { force });
        return r as AiResultDto<"content.article_assist"> & { output: Output<A> };
      } catch (e) {
        showToast("error", errorMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [showToast]
  );
  return { available, reason, enabledTask: !!task?.enabled, busy, run };
}

// ---------------------------------------------------------------------
// Khung hộp thoại
// ---------------------------------------------------------------------
function Shell({ title, subtitle, onClose, children, footer, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cn("bg-white rounded-3xl w-full max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn", wide ? "max-w-3xl" : "max-w-xl")}
        >
          <div className="flex items-start gap-3 p-5 pb-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-300/40">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold text-gray-900 leading-snug">{title}</h3>
              {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pb-4 overflow-y-auto custom-scroll flex-1 min-h-0">{children}</div>
          {footer && <div className="px-5 py-3.5 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2.5">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

const btnGhost = "px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50";
const btnPrimary = "inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-300/40 transition active:scale-95 disabled:opacity-50 disabled:shadow-none";
const btnSoft = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 transition active:scale-95 disabled:opacity-50";

function Thinking({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5 flex flex-col gap-3" role="status">
      <div className="flex items-center gap-2 text-xs font-bold text-violet-700">
        <Loader2 className="w-4 h-4 animate-spin" /> {text}
      </div>
      <div className="space-y-2">
        <div className="shimmer-box h-3.5 rounded-full w-2/3" />
        <div className="shimmer-box h-3 rounded-full w-full" />
        <div className="shimmer-box h-3 rounded-full w-11/12" />
        <div className="shimmer-box h-3 rounded-full w-4/5" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 1) Viết nháp từ chủ đề
// ---------------------------------------------------------------------
const TONES: { value: ArticleTone; label: string; subLabel: string }[] = [
  { value: "warm", label: "Thân thiện, ấm áp", subLabel: "Gần gũi như trò chuyện" },
  { value: "formal", label: "Trang trọng", subLabel: "Lịch sự, chững chạc" },
  { value: "lively", label: "Tươi trẻ, năng động", subLabel: "Truyền cảm hứng cho sinh viên" },
];
const LENGTHS: { value: ArticleLength; label: string; subLabel: string }[] = [
  { value: "short", label: "Ngắn", subLabel: "≈ 250 từ" },
  { value: "medium", label: "Vừa", subLabel: "≈ 450 từ" },
  { value: "long", label: "Dài", subLabel: "≈ 750 từ" },
];

export interface DraftSeed {
  topic?: string;
  keyPoints?: string;
}

export function DraftDialog({
  onClose,
  category,
  seed,
  hasContent,
  onApply,
}: {
  onClose: () => void;
  category: string;
  seed?: DraftSeed;
  /** Bài đang có nội dung ⇒ hỏi thay thế hay thêm vào cuối. */
  hasContent: boolean;
  onApply: (out: Output<"draft">, mode: "replace" | "append") => void;
}) {
  const { run, busy } = useArticleAi();
  const [topic, setTopic] = useState(seed?.topic ?? "");
  const [keyPoints, setKeyPoints] = useState(seed?.keyPoints ?? "");
  const [tone, setTone] = useState<ArticleTone>("warm");
  const [length, setLength] = useState<ArticleLength>("medium");
  const [result, setResult] = useState<(AiResultDto<"content.article_assist"> & { output: Output<"draft"> }) | null>(null);
  const canRun = topic.trim().length >= 5;

  const generate = async (force: boolean) => {
    if (!canRun || busy) return;
    const r = await run<"draft">({ action: "draft", topic: topic.trim(), keyPoints: keyPoints.trim() || undefined, category, tone, length }, force);
    if (r) setResult(r);
  };

  const out = result?.output;
  const gaps = out ? countPlaceholders(out.content) : 0;

  return (
    <Shell
      wide
      title={out ? "Bản nháp do AI viết" : "Nhờ AI viết nháp bài"}
      subtitle={out ? "Xem qua, rồi đưa vào bài để chỉnh sửa tiếp — bạn luôn là người quyết định nội dung đăng." : `Chuyên mục: ${articleCategoryLabel(category)} · AI chỉ dùng thông tin bạn nhập và thông tin giới thiệu cộng đoàn.`}
      onClose={onClose}
      footer={
        out ? (
          <>
            <button type="button" className={btnGhost} onClick={() => setResult(null)} disabled={busy}>
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Sửa yêu cầu
            </button>
            <button type="button" className={btnSoft} onClick={() => generate(true)} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Viết lại
            </button>
            {hasContent ? (
              <>
                <button type="button" className={btnSoft} onClick={() => onApply(out, "append")} disabled={busy}>Thêm vào cuối bài</button>
                <button type="button" className={btnPrimary} onClick={() => onApply(out, "replace")} disabled={busy}>
                  <Check className="w-3.5 h-3.5" /> Thay toàn bộ bài
                </button>
              </>
            ) : (
              <button type="button" className={btnPrimary} onClick={() => onApply(out, "replace")} disabled={busy}>
                <Check className="w-3.5 h-3.5" /> Dùng bản này
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className={btnGhost} onClick={onClose}>Hủy</button>
            <button type="button" className={btnPrimary} onClick={() => generate(false)} disabled={!canRun || busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} {busy ? "AI đang viết…" : "Viết nháp"}
            </button>
          </>
        )
      }
    >
      {busy && !out ? (
        <Thinking text="AI đang viết nháp — thường mất 10–30 giây…" />
      ) : out ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <AiLabel result={result} />
            {gaps > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                <AlertTriangle className="w-3 h-3" /> {gaps} chỗ cần bổ sung dữ kiện
              </span>
            )}
          </div>
          {busy && <Thinking text="Đang viết lại…" />}
          <div className={cn("flex flex-col gap-4", busy && "opacity-40 pointer-events-none")}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Tiêu đề</p>
              <p className="text-lg font-extrabold text-gray-900 leading-snug mt-0.5">{out.title}</p>
            </div>
            {out.summary && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Tóm tắt</p>
                <p className="text-sm text-gray-600 leading-relaxed mt-0.5">{out.summary}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Nội dung</p>
              <div className="rounded-2xl border border-purple-100 bg-surface/50 p-4 max-h-[42vh] overflow-y-auto custom-scroll">
                <ArticleMarkdown source={out.content} compact className="!text-[15px] !leading-7" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <CustomTextarea
            label="Bạn muốn viết về điều gì? *"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            maxLength={400}
            autoFocus
            placeholder="VD: Thông báo mở đơn đăng ký ở lưu xá năm học 2026–2027 cho sinh viên mới"
            hint={`${topic.trim().length}/400 · càng cụ thể, bài càng sát ý bạn`}
          />
          <CustomTextarea
            label="Ý chính / dữ kiện cần có (tùy chọn)"
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={"VD:\n- Nhận hồ sơ từ 01/08 đến 30/08\n- Ưu tiên sinh viên năm nhất, có giấy giới thiệu của cha xứ\n- Có buổi gặp mặt, tham quan nhà ngày 15/08"}
            hint="Ngày giờ, điều kiện, con số… AI sẽ KHÔNG tự bịa — thiếu dữ kiện nào nó sẽ đánh dấu [cần bổ sung] để bạn điền."
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <CustomSelect label="Giọng văn" value={tone} onChange={setTone} options={TONES} />
            <CustomSelect label="Độ dài" value={length} onChange={setLength} options={LENGTHS} />
          </div>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------
// 2) Gợi ý đề tài
// ---------------------------------------------------------------------
export function IdeasDialog({ onClose, category: initialCategory, onPick }: { onClose: () => void; category: string; onPick: (idea: { title: string; angle: string }, category: string) => void }) {
  const { run, busy } = useArticleAi();
  const [category, setCategory] = useState(initialCategory);
  const [note, setNote] = useState("");
  const [ideas, setIdeas] = useState<Output<"ideas">["ideas"] | null>(null);
  const first = useRef(true);

  const generate = useCallback(
    async (force: boolean) => {
      const r = await run<"ideas">({ action: "ideas", category, note: note.trim() || undefined }, force);
      if (r) setIdeas(r.output.ideas);
    },
    [run, category, note]
  );

  // Mở hộp thoại là có gợi ý ngay (không bắt người dùng bấm thêm một lần)
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void generate(false);
  }, [generate]);

  return (
    <Shell
      title="Gợi ý đề tài bài viết"
      subtitle="AI đề xuất vài ý tưởng hợp thời điểm và chuyên mục — chọn một ý để AI viết nháp, hoặc lấy cảm hứng rồi tự viết."
      onClose={onClose}
      footer={<button type="button" className={btnGhost} onClick={onClose}>Đóng</button>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid sm:grid-cols-[200px_1fr_auto] gap-3 items-end">
          <CustomSelect label="Chuyên mục" value={category} onChange={setCategory} options={ARTICLE_CATEGORIES.map((c) => ({ value: c.code, label: c.label }))} />
          <CustomInput label="Gợi ý thêm (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="VD: sắp tới mùa tuyển sinh, có lễ Bổn mạng…" onKeyDown={(e) => e.key === "Enter" && generate(true)} />
          <button type="button" className={btnSoft} onClick={() => generate(true)} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Gợi ý lại
          </button>
        </div>

        {busy && !ideas ? (
          <Thinking text="AI đang nghĩ đề tài…" />
        ) : ideas ? (
          <ul className={cn("flex flex-col gap-2.5", busy && "opacity-40 pointer-events-none")}>
            {ideas.map((idea, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(idea, category)}
                  className="group w-full text-left rounded-2xl border border-violet-100 bg-violet-50/40 hover:bg-violet-50 hover:border-violet-300 p-3.5 transition flex items-start gap-3"
                >
                  <span className="w-7 h-7 rounded-xl bg-white border border-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900 leading-snug group-hover:text-violet-700">{idea.title}</span>
                    <span className="block text-xs text-gray-600 mt-0.5 leading-relaxed">{idea.angle}</span>
                  </span>
                  <span className="shrink-0 self-center text-[11px] font-bold text-violet-600 opacity-0 group-hover:opacity-100 transition">Viết bài này →</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Chưa lấy được gợi ý — bấm “Gợi ý lại”.</p>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// 3) Chỉnh văn (trên đoạn đang chọn hoặc cả bài)
// ---------------------------------------------------------------------
export const IMPROVE_MODES: { mode: ArticleImproveMode; label: string; hint: string }[] = [
  { mode: "polish", label: "Sửa lỗi & làm mượt", hint: "Chính tả, ngữ pháp, câu văn trôi chảy" },
  { mode: "catchy", label: "Hấp dẫn hơn", hint: "Mở đầu cuốn hút, giàu hình ảnh" },
  { mode: "warmer", label: "Thân thiện hơn", hint: "Giọng ấm áp, gần gũi" },
  { mode: "formal", label: "Trang trọng hơn", hint: "Lịch sự, chững chạc" },
  { mode: "shorter", label: "Rút gọn", hint: "Còn khoảng một nửa" },
  { mode: "longer", label: "Mở rộng", hint: "Diễn giải rõ ý hơn, không thêm dữ kiện" },
];

export function ImproveMenu({
  disabled,
  getTarget,
  onApply,
}: {
  disabled?: boolean;
  /** Đoạn đang chọn (hoặc cả bài nếu không chọn gì); null nếu chưa có chữ. */
  getTarget: () => { text: string; whole: boolean } | null;
  onApply: (newText: string, label: string) => void;
}) {
  const { available, reason, run, busy } = useArticleAi();
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ text: string; whole: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (open) return setOpen(false);
    const t = getTarget();
    if (!t || t.text.trim().length < 5) {
      showToast("info", "Hãy viết vài câu (hoặc bôi đen đoạn muốn chỉnh) rồi thử lại.");
      return;
    }
    setTarget(t);
    setOpen(true);
  };

  const pick = async (m: (typeof IMPROVE_MODES)[number]) => {
    if (!target) return;
    setOpen(false);
    const r = await run<"improve">({ action: "improve", text: target.text.slice(0, 8000), mode: m.mode });
    if (r) onApply(r.output.text, m.label);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        disabled={disabled || busy || !available}
        title={available ? "Nhờ AI chỉnh văn: đoạn đang bôi đen, hoặc cả bài nếu không chọn gì" : reason ?? "AI chưa dùng được"}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{busy ? "AI đang chỉnh…" : "Chỉnh bằng AI"}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      <FloatingPanel open={open} onClose={() => setOpen(false)} anchorRef={btn} width={290} className="p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-gray-500">
          {target?.whole ? "Áp dụng cho cả bài" : `Áp dụng cho đoạn đã chọn (${target?.text.length ?? 0} ký tự)`}
        </p>
        {IMPROVE_MODES.map((m) => (
          <button key={m.mode} type="button" onClick={() => pick(m)} className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-violet-50 transition">
            <span className="block text-xs font-bold text-gray-900">{m.label}</span>
            <span className="block text-[11px] text-gray-500">{m.hint}</span>
          </button>
        ))}
      </FloatingPanel>
    </>
  );
}

// ---------------------------------------------------------------------
// 4) Gợi ý tiêu đề + tóm tắt từ nội dung đã viết
// ---------------------------------------------------------------------
export function MetaSuggest({ content, title, onPickTitle, onPickSummary }: { content: string; title: string; onPickTitle: (t: string) => void; onPickSummary: (s: string) => void }) {
  const { available, reason, run, busy } = useArticleAi();
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Output<"meta"> | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const go = async (force: boolean) => {
    if (content.trim().length < 30) {
      showToast("info", "Hãy viết nội dung bài (ít nhất vài câu) rồi nhờ AI gợi ý tiêu đề và tóm tắt.");
      return;
    }
    const r = await run<"meta">({ action: "meta", content: content.slice(0, 14000), title: title.trim() || undefined }, force);
    if (r) {
      setRes(r.output);
      setOpen(true);
    }
  };

  if (!available) return reason ? <span className="text-[11px] text-gray-400">AI chưa dùng được: {reason}</span> : null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => (res && !open ? setOpen(true) : go(false))}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-700 hover:text-violet-900 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} {busy ? "AI đang đọc bài…" : "AI gợi ý tiêu đề & tóm tắt"}
      </button>
      <FloatingPanel open={open && !!res} onClose={() => setOpen(false)} anchorRef={btn} width={380} maxHeight={420} className="p-2">
        {res && (
          <div className="flex flex-col gap-1.5">
            <p className="px-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Tiêu đề — bấm để dùng</p>
            {res.titles.map((t, i) => (
              <button key={i} type="button" onClick={() => { onPickTitle(t); setOpen(false); }} className="text-left px-2.5 py-2 rounded-xl text-sm font-bold text-gray-900 hover:bg-violet-50 transition leading-snug">
                {t}
              </button>
            ))}
            <p className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Tóm tắt</p>
            <button type="button" onClick={() => { onPickSummary(res.summary); setOpen(false); }} className="text-left px-2.5 py-2 rounded-xl text-xs text-gray-700 hover:bg-violet-50 transition leading-relaxed">
              {res.summary}
              <span className="block mt-1 text-[11px] font-bold text-violet-600">Dùng tóm tắt này →</span>
            </button>
            <button type="button" onClick={() => go(true)} disabled={busy} className="self-end inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-50 rounded-lg">
              <RefreshCw className="w-3 h-3" /> Gợi ý lại
            </button>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}

// ---------------------------------------------------------------------
// 5) Thẻ "Trợ lý AI" ở cột phụ của trình soạn
// ---------------------------------------------------------------------
export function AiAssistCard({ onDraft, onIdeas, empty }: { onDraft: () => void; onIdeas: () => void; empty: boolean }) {
  const { available, reason } = useArticleAi();
  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-indigo-50/50 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center shadow-sm shadow-violet-300/40">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-gray-900 leading-tight">Trợ lý AI</h3>
          <p className="text-[11px] text-gray-500">{empty ? "Chưa biết bắt đầu từ đâu? Nhờ AI nhé." : "Viết lại, chỉnh văn, gợi ý tiêu đề"}</p>
        </div>
      </div>
      {available ? (
        <div className="grid gap-2">
          <button type="button" onClick={onIdeas} className={cn(btnSoft, "justify-start !bg-white")}>
            <Lightbulb className="w-3.5 h-3.5" /> Gợi ý đề tài để viết
          </button>
          <button type="button" onClick={onDraft} className={cn(btnPrimary, "justify-start")}>
            <FileText className="w-3.5 h-3.5" /> {empty ? "Viết nháp từ chủ đề" : "Viết nháp mới từ chủ đề"}
          </button>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            AI chỉ <b>gợi ý</b>; bạn xem, sửa rồi mới đăng. Không bịa ngày giờ hay con số — thiếu dữ kiện AI sẽ để chỗ trống cho bạn điền.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          AI chưa dùng được{reason ? `: ${reason}` : ""} Bạn vẫn soạn bài bình thường; Admin có thể bật ở <b>Cài đặt → Trợ lý AI</b>.
        </p>
      )}
    </div>
  );
}
