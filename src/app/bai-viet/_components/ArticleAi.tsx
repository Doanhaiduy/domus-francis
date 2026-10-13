"use client";

// Trợ lý AI của trình soạn bài công khai: gợi ý đề tài, phỏng vấn lấy dữ kiện, tra cứu tư liệu, viết nháp, chỉnh văn, gợi ý tiêu đề + tóm tắt.
// AI chỉ GỢI Ý — mọi kết quả đều hiện ra để người soạn xem, sửa rồi mới đưa vào bài; AI tắt/lỗi thì vẫn soạn tay như thường.
// Chống "AI tự biên tự diễn": máy chủ đưa cho AI bảng THÔNG TIN THẬT (ngày phụng vụ, Bổn mạng, sự kiện), rồi dò ngày/giờ/số/SĐT trong bài mà
// dữ kiện không có — các chỗ đó hiện thành thẻ "cần kiểm lại" (xem src/lib/article-verify.ts).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ExternalLink, FileText, HelpCircle, Lightbulb, Loader2, RefreshCw, Search, Sparkles, Wand2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type {
  AiResultDto,
  ArticleAssistInput,
  ArticleAssistOutput,
  ArticleEnding,
  ArticleImproveMode,
  ArticleLength,
  ArticleQa,
  ArticleResearchOutput,
  ArticleTone,
} from "@/lib/types/ai";
import { ARTICLE_CATEGORIES, articleCategoryLabel } from "@/lib/types/articles";
import { FLAG_LABEL, SOFT_FLAG_KINDS, type DraftFlag, type DraftFlagKind } from "@/lib/article-verify";
import { Portal } from "@/components/ui/Portal";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { AiLabel } from "@/components/ai/AiParts";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { cn } from "@/lib/utils";
import { useAiRunner } from "./useAiRunner";

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
// Khung hộp thoại + phần tử dùng chung (cũng dùng ở ArticleImageAi.tsx)
// ---------------------------------------------------------------------
export function Shell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  noVeil,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** Hộp thoại tự có khung chờ riêng ⇒ ModalGuard không phủ lớp "Đang xử lý…". */
  noVeil?: boolean;
}) {
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
          {...(noVeil ? { "data-no-veil": "" } : {})}
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

export const btnGhost = "px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50";
export const btnPrimary =
  "inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-300/40 transition active:scale-95 disabled:opacity-50 disabled:shadow-none";
export const btnSoft = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 transition active:scale-95 disabled:opacity-50";

export function Thinking({ text }: { text: string }) {
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

const FLAG_ORDER: DraftFlagKind[] = ["patron", "quote", "claim", "date", "time", "phone", "number", "cta", "repeat", "cliche"];

/** Các chỗ AI viết mà dữ kiện không có (hoặc cụm sáo rỗng): nhóm theo loại; bấm một thẻ để chọn đúng đoạn đó trong khung soạn. */
export function FlagChips({ flags, onPick }: { flags: DraftFlag[]; onPick?: (text: string) => void }) {
  const groups = FLAG_ORDER.map((kind) => ({ kind, items: flags.filter((f) => f.kind === kind) })).filter((g) => g.items.length);
  if (!groups.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((g) => {
        const soft = SOFT_FLAG_KINDS.has(g.kind);
        return (
          <div key={g.kind}>
            <p className={cn("text-[11px] font-bold", soft ? "text-gray-500" : "text-amber-800")}>{FLAG_LABEL[g.kind]}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.items.map((f) => (
                <button
                  key={f.text}
                  type="button"
                  onClick={() => onPick?.(f.text)}
                  disabled={!onPick}
                  title={f.note ?? (onPick ? "Bấm để chọn đoạn này trong bài" : undefined)}
                  className={cn(
                    "max-w-full truncate px-2 py-0.5 rounded-full border text-[11px] font-semibold",
                    soft ? "bg-gray-50 border-gray-200 text-gray-600" : "bg-amber-50 border-amber-200 text-amber-900",
                    onPick && "hover:brightness-95 cursor-pointer"
                  )}
                >
                  {f.text}
                </button>
              ))}
            </div>
            {g.items.some((f) => f.note) && <p className="mt-1 text-[11px] text-amber-800">{g.items.find((f) => f.note)?.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// 1) Viết nháp từ chủ đề (+ phỏng vấn + tra cứu)
// ---------------------------------------------------------------------
const TONES: { value: ArticleTone; label: string; subLabel: string }[] = [
  { value: "plain", label: "Mộc mạc, chân thật", subLabel: "Như người trong nhà kể lại" },
  { value: "warm", label: "Thân thiện, ấm áp", subLabel: "Gần gũi như trò chuyện" },
  { value: "formal", label: "Trang trọng", subLabel: "Lịch sự, chững chạc" },
  { value: "lively", label: "Tươi trẻ, năng động", subLabel: "Truyền cảm hứng cho sinh viên" },
];
const LENGTHS: { value: ArticleLength; label: string; subLabel: string }[] = [
  { value: "short", label: "Ngắn", subLabel: "≈ 250 từ" },
  { value: "medium", label: "Vừa", subLabel: "≈ 450 từ" },
  { value: "long", label: "Dài", subLabel: "≈ 750 từ" },
];
const ENDINGS: { value: ArticleEnding; label: string; subLabel: string }[] = [
  { value: "none", label: "Không kêu gọi", subLabel: "Khép bài tự nhiên (khuyên dùng)" },
  { value: "soft", label: "Mời nhẹ nhàng", subLabel: "Một câu mời, không số điện thoại" },
  { value: "contact", label: "Kèm thông tin liên hệ", subLabel: "Hotline và địa chỉ của nhà" },
];

export interface DraftSeed {
  topic?: string;
  keyPoints?: string;
}

/** Thông tin kèm theo khi đưa bản nháp vào bài. */
export interface DraftApplyExtra {
  /** Nguồn tham khảo người soạn đã chọn ghi cuối bài (rỗng = không ghi). */
  sources?: { title: string; url: string }[];
}

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn("mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition", on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-300")}
    >
      {on && <Check className="w-3 h-3" />}
    </button>
  );
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
  onApply: (out: Output<"draft">, mode: "replace" | "append", extra: DraftApplyExtra) => void;
}) {
  const { run, busy } = useArticleAi();
  const researcher = useAiRunner("content.article_research");
  const [topic, setTopic] = useState(seed?.topic ?? "");
  const [keyPoints, setKeyPoints] = useState(seed?.keyPoints ?? "");
  const [tone, setTone] = useState<ArticleTone>("plain");
  const [length, setLength] = useState<ArticleLength>("medium");
  const [ending, setEnding] = useState<ArticleEnding>("none");
  const [qa, setQa] = useState<ArticleQa[] | null>(null);
  const [research, setResearch] = useState<ArticleResearchOutput | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  // Nguồn nào được ghi cuối bài: mặc định chỉ nguồn gắn với ý đã chọn (Vatican News/Wikipedia); nguồn web của Google không biết ứng với ý nào ⇒ người soạn tự tick
  const [pickedSrc, setPickedSrc] = useState<boolean[]>([]);
  const [cite, setCite] = useState(true);
  const [result, setResult] = useState<(AiResultDto<"content.article_assist"> & { output: Output<"draft"> }) | null>(null);
  const [step, setStep] = useState<null | "ask" | "write">(null);
  const canRun = topic.trim().length >= 5;

  const answers = (qa ?? []).filter((x) => x.a.trim()).map((x) => ({ q: x.q, a: x.a.trim() }));
  const notes = research ? research.notes.filter((_, i) => picked[i]) : [];
  const sources = research && notes.length ? research.sources.filter((_, i) => pickedSrc[i]).map((s) => ({ title: s.title, url: s.url })) : [];
  // Khớp ngưỡng của máy chủ: dưới ~40 ký tự dữ kiện thật ⇒ AI chỉ viết khung ngắn
  const material = keyPoints.trim().length + answers.reduce((n, a) => n + a.a.length, 0) + notes.join(" ").length;

  const generate = async (force: boolean) => {
    if (!canRun || busy) return;
    setStep("write");
    const r = await run<"draft">(
      {
        action: "draft",
        topic: topic.trim(),
        keyPoints: keyPoints.trim() || undefined,
        answers: answers.length ? answers : undefined,
        research: notes.length ? { notes, sources } : undefined,
        category,
        tone,
        length,
        ending,
      },
      force
    );
    setStep(null);
    if (r) setResult(r);
  };

  const ask = async () => {
    if (!canRun || busy) return;
    setStep("ask");
    const r = await run<"questions">({ action: "questions", topic: topic.trim(), category });
    setStep(null);
    if (r) setQa(r.output.questions.map((q) => ({ q, a: "" })));
  };

  const doResearch = async (force: boolean) => {
    if (!canRun || researcher.busy) return;
    const r = await researcher.run({ topic: topic.trim(), category }, force);
    if (r) {
      setResearch(r.output);
      setPicked(r.output.notes.map(() => true));
      setPickedSrc(r.output.sources.map((s) => s.noteIndex !== undefined));
    }
  };

  const out = result?.output;
  const gaps = out ? countPlaceholders(out.content) : 0;

  return (
    <Shell
      wide
      title={out ? "Bản nháp do AI viết" : "Nhờ AI viết nháp bài"}
      subtitle={
        out
          ? "Xem qua, rồi đưa vào bài để chỉnh sửa tiếp — bạn luôn là người quyết định nội dung đăng."
          : `Chuyên mục: ${articleCategoryLabel(category)} · AI chỉ dùng thông tin bạn nhập, tư liệu bạn chọn và bảng thông tin thật của nhà (ngày lễ, Bổn mạng, sự kiện).`
      }
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
                <button type="button" className={btnSoft} onClick={() => onApply(out, "append", { sources: cite && sources.length ? sources : undefined })} disabled={busy}>Thêm vào cuối bài</button>
                <button type="button" className={btnPrimary} onClick={() => onApply(out, "replace", { sources: cite && sources.length ? sources : undefined })} disabled={busy}>
                  <Check className="w-3.5 h-3.5" /> Thay toàn bộ bài
                </button>
              </>
            ) : (
              <button type="button" className={btnPrimary} onClick={() => onApply(out, "replace", { sources: cite && sources.length ? sources : undefined })} disabled={busy}>
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
      {(step === "write" && !out) || step === "ask" ? (
        <Thinking text={step === "ask" ? "AI đang nghĩ câu hỏi cho bạn…" : "AI đang viết — thường mất 10–30 giây…"} />
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
          {out.thin && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
              Bạn chưa đưa dữ kiện thật nào nên AI chỉ viết <b>khung bài ngắn</b>, chỗ nào cần chi tiết đều để <b>[cần bổ sung: …]</b>. Muốn bài chân thực, hãy bấm “Sửa yêu cầu”, để AI hỏi vài câu rồi kể lại điều đã xảy ra.
            </div>
          )}
          {out.flags.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 flex flex-col gap-2">
              <p className="text-xs font-bold text-amber-900">Cần bạn kiểm lại trước khi đăng</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">AI nêu các chi tiết dưới đây nhưng chúng không có trong dữ kiện bạn đưa (hoặc là cụm từ nghe “như văn AI”). Kiểm lại, sửa hoặc xóa.</p>
              <FlagChips flags={out.flags} />
            </div>
          )}
          {!out.thin && (
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Hãy đọc kỹ: AI vẫn có thể thêm chi tiết cảnh (đồ vật, thời tiết, cảm xúc) hoặc lời nói mà bạn không kể — xóa hoặc sửa chỗ nào không đúng sự thật.
            </p>
          )}
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
            {sources.length > 0 && (
              <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                <Tick on={cite} onClick={() => setCite((v) => !v)} label="Ghi nguồn tham khảo cuối bài" />
                <span>Ghi mục “Nguồn tham khảo” ({sources.length} nguồn) ở cuối bài</span>
              </label>
            )}
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
            placeholder="VD: Buổi lần chuỗi Mân Côi tối thứ Sáu của anh em trong nhà"
            hint={`${topic.trim().length}/400 · càng cụ thể, bài càng sát ý bạn`}
          />
          <CustomTextarea
            label="Điều đã xảy ra / dữ kiện cần có (tùy chọn nhưng nên có)"
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={"VD:\n- Tối thứ Sáu 9/10, 20 anh em lần chuỗi ở sân nhà\n- Cha linh hướng nhắc về lòng tin cậy vào Đức Mẹ\n- Cuối buổi cả nhà dùng chè đậu xanh"}
            hint="Ngày giờ, tên người, con số… ghi thật. AI sẽ KHÔNG tự bịa — thiếu dữ kiện nào nó đánh dấu [cần bổ sung] để bạn điền."
          />

          <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3.5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-violet-800">Muốn bài chân thực hơn?</p>
                <p className="text-[11px] text-gray-500">Văn hay nhất là văn có chi tiết thật. Để AI hỏi bạn vài câu, hoặc tra thêm tư liệu có nguồn.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSoft} onClick={ask} disabled={!canRun || busy}>
                  {busy && !qa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HelpCircle className="w-3.5 h-3.5" />} AI hỏi tôi vài câu
                </button>
                {researcher.available && (
                  <button type="button" className={btnSoft} onClick={() => doResearch(!!research)} disabled={!canRun || researcher.busy}>
                    {researcher.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} {research ? "Tra cứu lại" : "Tra cứu thêm thông tin"}
                  </button>
                )}
              </div>
            </div>

            {qa && (
              <div className="flex flex-col gap-3">
                {qa.map((x, i) => (
                  <CustomTextarea
                    key={i}
                    label={x.q}
                    value={x.a}
                    onChange={(e) => setQa((cur) => (cur ?? []).map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))}
                    rows={2}
                    maxLength={1200}
                    placeholder="Trả lời ngắn gọn, đúng sự thật (bỏ trống nếu không có)"
                  />
                ))}
              </div>
            )}

            {researcher.busy && !research && <Thinking text="Đang tra cứu — thường 10–25 giây…" />}
            {research && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-gray-800">Tư liệu tìm được — chọn ý muốn đưa vào bài</p>
                {research.webSearch !== "ok" && (
                  <p className="text-[11px] text-amber-800">
                    {research.webSearch === "skipped" ? "Chưa bật tìm kiếm web." : "Tìm kiếm web đang hết lượt hoặc tạm lỗi."} Chỉ có nguồn Vatican News và Wikipedia.
                  </p>
                )}
                {research.notes.length === 0 ? (
                  <p className="text-xs text-gray-500">Không tìm thấy tư liệu phù hợp — bạn vẫn có thể viết từ dữ kiện của mình.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {research.notes.map((n, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                        <Tick
                          on={!!picked[i]}
                          onClick={() => {
                            const next = !picked[i];
                            setPicked((p) => p.map((v, j) => (j === i ? next : v)));
                            // bỏ ý nào thì bỏ luôn nguồn gắn với ý đó (và ngược lại)
                            setPickedSrc((ps) => ps.map((v, k) => (research.sources[k]?.noteIndex === i ? next : v)));
                          }}
                          label={`Dùng ý ${i + 1}`}
                        />
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {research.sources.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <p className="text-[11px] font-bold text-gray-600">Nguồn — tick nguồn bạn đã mở và đối chiếu, nguồn được tick sẽ ghi cuối bài</p>
                    <div className="flex flex-wrap gap-1.5">
                      {research.sources.map((s, i) => (
                        <span key={s.url} className={cn("inline-flex max-w-full items-center rounded-full border text-[11px] font-semibold", pickedSrc[i] ? "bg-violet-50 border-violet-300 text-violet-800" : "bg-white border-gray-200 text-gray-500")}>
                          <button type="button" role="checkbox" aria-checked={!!pickedSrc[i]} onClick={() => setPickedSrc((ps) => ps.map((v, k) => (k === i ? !v : v)))} className="inline-flex min-w-0 items-center gap-1 pl-2 pr-1 py-0.5" title={s.title}>
                            {pickedSrc[i] && <Check className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{s.title}</span>
                          </button>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Mở nguồn trong tab mới" className="pr-1.5 py-0.5 text-gray-400 hover:text-violet-700">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-gray-500">Tư liệu chỉ để bạn tham khảo, có thể sai hoặc lạc đề — bỏ tick ý không liên quan; AI diễn đạt lại bằng lời của nhà, hãy mở nguồn để kiểm chứng.</p>
              </div>
            )}
          </div>

          {material < 40 && topic.trim().length >= 5 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
              Chưa có dữ kiện thật nào: AI sẽ chỉ viết <b>khung bài ngắn</b> có chỗ [cần bổ sung]. Nhập vài ý ở trên hoặc bấm “AI hỏi tôi vài câu” để có bài đầy đủ hơn.
            </p>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <CustomSelect label="Giọng văn" value={tone} onChange={setTone} options={TONES} />
            <CustomSelect label="Độ dài" value={length} onChange={setLength} options={LENGTHS} />
            <CustomSelect label="Kết bài" value={ending} onChange={setEnding} options={ENDINGS} />
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
      subtitle="AI đề xuất vài ý tưởng có cơ sở thật (ngày lễ, sự kiện sắp tới của nhà) và không trùng bài đã đăng — chọn một ý để viết nháp, hoặc lấy cảm hứng rồi tự viết."
      onClose={onClose}
      footer={<button type="button" className={btnGhost} onClick={onClose}>Đóng</button>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid sm:grid-cols-[200px_1fr_auto] gap-3 items-end">
          <CustomSelect label="Chuyên mục" value={category} onChange={setCategory} options={ARTICLE_CATEGORIES.map((c) => ({ value: c.code, label: c.label }))} />
          <CustomInput label="Gợi ý thêm (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="VD: sắp tới mùa tuyển sinh, có buổi tĩnh tâm…" onKeyDown={(e) => e.key === "Enter" && generate(true)} />
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
                    {idea.basis && <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-white border border-violet-100 text-[10px] font-bold text-violet-700">Cơ sở: {idea.basis}</span>}
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

/** Máy chủ nhận tối đa ngần này ký tự mỗi lần chỉnh — dài hơn thì phải chỉnh từng phần (cắt bớt rồi thay lại sẽ làm mất phần đuôi bài). */
export const IMPROVE_MAX_CHARS = 8000;

export function ImproveMenu({
  disabled,
  getTarget,
  onApply,
}: {
  disabled?: boolean;
  /** Đoạn đang chọn (hoặc cả bài nếu không chọn gì); null nếu chưa có chữ. */
  getTarget: () => { text: string; whole: boolean } | null;
  onApply: (newText: string, label: string, flags: DraftFlag[]) => void;
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
    if (t.text.length > IMPROVE_MAX_CHARS) {
      showToast(
        "info",
        `${t.whole ? "Bài" : "Đoạn đã chọn"} dài ${t.text.length.toLocaleString("vi-VN")} ký tự — AI chỉ chỉnh được tối đa ${IMPROVE_MAX_CHARS.toLocaleString("vi-VN")} ký tự mỗi lần. Hãy bôi đen từng phần ngắn hơn rồi chỉnh.`
      );
      return;
    }
    setTarget(t);
    setOpen(true);
  };

  const pick = async (m: (typeof IMPROVE_MODES)[number]) => {
    if (!target) return;
    setOpen(false);
    const r = await run<"improve">({ action: "improve", text: target.text, mode: m.mode });
    if (r) onApply(r.output.text, m.label, r.output.flags ?? []);
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
            AI chỉ <b>gợi ý</b>; bạn xem, sửa rồi mới đăng. Bài chân thực nhất khi bạn <b>kể điều đã xảy ra</b> — AI sẽ hỏi vài câu giúp bạn. Chỗ nào thiếu dữ kiện, AI để trống cho bạn điền.
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
