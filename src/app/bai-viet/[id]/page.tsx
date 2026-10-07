"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  CalendarClock,
  Check,
  Circle,
  ExternalLink,
  Eye,
  Heading2,
  Heading3,
  History,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pencil,
  Quote,
  Save,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { articlesApi, useArticle, useArticles, type ArticleFormPayload } from "@/lib/data/articles";
import { isValidSlug, slugify } from "@/lib/articles-format";
import { ARTICLE_CATEGORIES, isScheduled, type ArticleDetail } from "@/lib/types/articles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomInput, CustomSelect, CustomTextarea, CustomToggle, ImageUploadDropzone, uploadFile } from "@/components/ui/FormControls";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { TagsInput } from "../_components/TagsInput";
import { SchedulePicker } from "../_components/SchedulePicker";
import { RevisionsDialog } from "../_components/RevisionsDialog";
import { AiAssistCard, DraftDialog, ImproveMenu, IdeasDialog, MetaSuggest, countPlaceholders, type DraftSeed } from "../_components/ArticleAi";
import { cn } from "@/lib/utils";

const EMPTY: ArticleFormPayload = { title: "", slug: "", summary: "", content: "", category: "tin-tuc", coverFileId: null, byline: "", isFeatured: false, status: "draft", tags: [], publishedAt: null };

const fromArticle = (a: ArticleDetail): ArticleFormPayload => ({
  title: a.title,
  slug: a.slug,
  summary: a.summary ?? "",
  content: a.content,
  category: a.category,
  coverFileId: a.coverFileId,
  byline: a.byline ?? "",
  isFeatured: a.isFeatured,
  status: a.status,
  tags: a.tags,
  publishedAt: isScheduled(a) ? a.publishedAt : null,
});

const wordCount = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean).length;
const card = "bg-white border border-purple-100 rounded-2xl p-4 sm:p-5";
const toolBtn = "p-2 rounded-lg text-gray-600 hover:bg-purple-50 hover:text-primary transition disabled:opacity-50";

interface Snapshot {
  content: string;
  label: string;
}

export default function ArticleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "moi";
  const { showToast } = useApp();
  const { can, isLoading: sessionLoading } = useSession();
  const allowed = can("article.manage");
  const { article, isLoading, error } = useArticle(!isNew && allowed ? id : null);
  const { articles: allArticles } = useArticles(allowed);
  const tagSuggestions = useMemo(() => [...new Set(allArticles.flatMap((a) => a.tags))].sort(), [allArticles]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [form, setForm] = useState<ArticleFormPayload>(EMPTY);
  const [saved, setSaved] = useState<ArticleFormPayload>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "publish">(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [draftSeed, setDraftSeed] = useState<DraftSeed | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [undo, setUndo] = useState<Snapshot | null>(null);
  const [confirmGaps, setConfirmGaps] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const improveRange = useRef<{ start: number; end: number; whole: boolean } | null>(null);

  // Nạp bài khi sửa
  useEffect(() => {
    if (!article) return;
    const f = fromArticle(article);
    setForm(f);
    setSaved(f);
    setSlugTouched(true);
  }, [article]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof ArticleFormPayload>(k: K, v: ArticleFormPayload[K]) => setForm((f) => ({ ...f, [k]: v }));
  const onTitle = (v: string) => setForm((f) => ({ ...f, title: v, slug: slugTouched ? f.slug : slugify(v) }));

  // ---- Thanh công cụ Markdown ----
  const edit = useCallback((fn: (value: string, start: number, end: number) => { value: string; start: number; end: number }) => {
    const ta = taRef.current;
    if (!ta) return;
    const r = fn(ta.value, ta.selectionStart, ta.selectionEnd);
    setForm((f) => ({ ...f, content: r.value }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.start, r.end);
    });
  }, []);

  const wrap = (before: string, after: string, placeholder: string) =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || placeholder;
      return { value: v.slice(0, s) + before + sel + after + v.slice(e), start: s + before.length, end: s + before.length + sel.length };
    });

  /** Thêm tiền tố cho từng dòng đang chọn (danh sách, tiêu đề, trích dẫn). */
  const prefixLines = (prefix: (i: number) => string, placeholder: string) =>
    edit((v, s, e) => {
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const rawEnd = v.indexOf("\n", e);
      const lineEnd = rawEnd === -1 ? v.length : rawEnd;
      const block = v.slice(lineStart, lineEnd) || placeholder;
      const out = block.split("\n").map((l, i) => prefix(i) + l).join("\n");
      return { value: v.slice(0, lineStart) + out + v.slice(lineEnd), start: lineStart, end: lineStart + out.length };
    });

  const insertBlock = (text: string) =>
    edit((v, s, e) => {
      const before = v.slice(0, s);
      const lead = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const ins = `${lead}${text}\n\n`;
      return { value: before + ins + v.slice(e), start: s + ins.length, end: s + ins.length };
    });

  const addLink = () =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || "chữ hiển thị";
      const url = "https://";
      const md = `[${sel}](${url})`;
      const urlStart = s + sel.length + 3;
      return { value: v.slice(0, s) + md + v.slice(e), start: urlStart, end: urlStart + url.length };
    });

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file, "attachments");
      insertBlock(`![Chú thích ảnh](/api/v1/public/files/${up.id})`);
      showToast("success", "Đã chèn ảnh — sửa phần “Chú thích ảnh” trong ngoặc vuông nếu muốn.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ---- Trợ lý AI ----
  const applyDraft = (out: { title: string; summary: string; content: string }, mode: "replace" | "append") => {
    setUndo({ content: form.content, label: "đưa bản nháp AI vào bài" });
    setForm((f) =>
      mode === "append"
        ? { ...f, content: `${f.content.trimEnd()}\n\n${out.content}` }
        : { ...f, title: out.title, summary: out.summary, content: out.content, slug: slugTouched ? f.slug : slugify(out.title) }
    );
    setDraftSeed(null);
    setTab("write");
    const gaps = countPlaceholders(out.content);
    showToast("success", gaps ? `Đã đưa bản nháp vào bài — còn ${gaps} chỗ [cần bổ sung] bạn cần điền.` : "Đã đưa bản nháp vào bài — đọc lại và chỉnh theo ý bạn nhé.");
  };

  const getImproveTarget = () => {
    const ta = taRef.current;
    const content = form.content;
    if (!content.trim()) return null;
    const s = ta?.selectionStart ?? 0;
    const e = ta?.selectionEnd ?? 0;
    if (e > s) {
      improveRange.current = { start: s, end: e, whole: false };
      return { text: content.slice(s, e), whole: false };
    }
    improveRange.current = { start: 0, end: content.length, whole: true };
    return { text: content, whole: true };
  };

  const applyImprove = (text: string, label: string) => {
    const r = improveRange.current;
    if (!r) return;
    setUndo({ content: form.content, label: label.toLowerCase() });
    setForm((f) => ({ ...f, content: f.content.slice(0, r.start) + text + f.content.slice(r.end) }));
    improveRange.current = null;
  };

  // ---- Chỉ số / danh sách kiểm tra trước khi đăng ----
  const words = useMemo(() => wordCount(form.content), [form.content]);
  const gaps = useMemo(() => countPlaceholders(form.content) + countPlaceholders(form.summary ?? "") + countPlaceholders(form.title), [form.content, form.summary, form.title]);
  const checks = [
    { ok: form.title.trim().length >= 3, text: "Có tiêu đề", required: true },
    { ok: isValidSlug(form.slug), text: "Đường dẫn hợp lệ", required: true },
    { ok: words >= 1, text: "Có nội dung", required: true },
    { ok: !!form.coverFileId, text: "Có ảnh bìa (đẹp khi chia sẻ link)", required: false },
    { ok: (form.summary ?? "").trim().length >= 20, text: "Có tóm tắt 1–2 câu", required: false },
    { ok: words >= 120, text: `Đủ dài để người đọc có ích (${words}/120 từ)`, required: false },
    { ok: gaps === 0, text: gaps ? `Còn ${gaps} chỗ [cần bổ sung] chưa điền` : "Không còn chỗ trống [cần bổ sung]", required: false },
  ];
  const ready = checks.filter((c) => c.required).every((c) => c.ok);

  // ---- Lưu ----
  const validate = (publish: boolean): string | null => {
    if (form.title.trim().length < 3) return "Tiêu đề tối thiểu 3 ký tự.";
    if (!isValidSlug(form.slug)) return "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang (3–120 ký tự).";
    if ((form.summary ?? "").length > 400) return "Tóm tắt tối đa 400 ký tự.";
    if (publish && !form.content.trim()) return "Bài đăng công khai phải có nội dung.";
    return null;
  };

  const save = async (status: "draft" | "published", skipGapCheck = false) => {
    const err = validate(status === "published");
    if (err) {
      showToast("error", err);
      return;
    }
    if (status === "published" && gaps > 0 && !skipGapCheck) {
      setConfirmGaps(true);
      return;
    }
    setSaving(status === "published" ? "publish" : "draft");
    try {
      // Hẹn giờ: chỉ gửi mốc tương lai; đang hẹn mà bỏ hẹn thì đăng ngay; bài đang đăng thì giữ nguyên ngày đăng
      const sched = form.publishedAt && new Date(form.publishedAt).getTime() > Date.now() ? form.publishedAt : null;
      const publishedAt = status === "published" ? (sched ?? (saved.publishedAt ? new Date().toISOString() : undefined)) : undefined;
      const payload: ArticleFormPayload = { ...form, title: form.title.trim(), summary: form.summary?.trim() || null, byline: form.byline?.trim() || null, status, publishedAt };
      const r = isNew ? await articlesApi.create(payload) : await articlesApi.update(id, payload);
      const f = fromArticle(r);
      if (status === "draft") f.publishedAt = form.publishedAt; // nháp vẫn nhớ giờ đã chọn
      setForm(f);
      setSaved(f);
      setUndo(null);
      showToast("success", status === "published" ? (sched ? "Đã hẹn giờ — bài sẽ tự hiện công khai đúng giờ đã chọn." : "Đã đăng bài — mọi người xem được qua đường link công khai.") : "Đã lưu bản nháp.");
      if (isNew) router.replace(`/bai-viet/${r.id}`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  // Ctrl/⌘ + S: lưu (bài đang đăng thì lưu thay đổi, còn lại lưu nháp)
  const saveRef = useRef(save);
  saveRef.current = save;
  const publishedNow = saved.status === "published" && !isNew;
  const scheduledNow = publishedNow && !!saved.publishedAt && new Date(saved.publishedAt).getTime() > Date.now();
  const willSchedule = !!form.publishedAt && new Date(form.publishedAt).getTime() > Date.now();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current(publishedNow ? "published" : "draft");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publishedNow]);

  if (!sessionLoading && !allowed) {
    return <div className="max-w-md mx-auto mt-16 text-center text-sm text-gray-600">Bạn chưa có quyền quản lý bài viết công khai.</div>;
  }
  if (!isNew && isLoading && !article) {
    return <div className="w-full space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-24 rounded-2xl" />)}</div>;
  }
  if (!isNew && error && !article) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="font-bold text-gray-900">Không mở được bài viết</p>
        <p className="text-sm text-gray-500 mt-1">{errorMessage(error)}</p>
        <Link href="/bai-viet" className="inline-block mt-4 text-sm font-bold text-primary">← Về danh sách</Link>
      </div>
    );
  }

  const previewSource = form.content.replaceAll("/api/v1/public/files/", "/api/v1/files/"); // bản nháp: ảnh đọc qua đường dẫn nội bộ
  const category = ARTICLE_CATEGORIES.find((c) => c.code === form.category);

  return (
    <div className="space-y-4 w-full pb-16">
      {/* THANH HÀNH ĐỘNG (dính khi cuộn) */}
      <div className="sticky top-[68px] z-10 px-3 sm:px-4 py-2.5 rounded-2xl bg-surface-container-lowest/95 backdrop-blur-xl border border-purple-100 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/bai-viet" className="p-2 rounded-xl hover:bg-purple-50 text-gray-500 hover:text-primary transition" title="Về danh sách" aria-label="Về danh sách">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-gray-900 truncate">{isNew ? "Viết bài mới" : form.title || "Sửa bài viết"}</h1>
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
              {scheduledNow ? <span className="text-amber-700 font-semibold">⏰ Hẹn giờ đăng</span> : publishedNow ? <span className="text-emerald-700 font-semibold">● Đang công khai</span> : <span>○ Bản nháp — chỉ người quản lý thấy</span>}
              {dirty ? <span className="text-amber-600 font-semibold">· Chưa lưu</span> : !isNew && <span className="text-gray-400">· Đã lưu</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && (
            <button type="button" onClick={() => setHistoryOpen(true)} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition" title="Xem và khôi phục các bản cũ">
              <History className="w-3.5 h-3.5" /> Lịch sử
            </button>
          )}
          {publishedNow && !scheduledNow && (
            <a href={`/tin-tuc/${saved.slug}`} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition">
              <ExternalLink className="w-3.5 h-3.5" /> Xem trang công khai
            </a>
          )}
          {publishedNow ? (
            <>
              <button onClick={() => save("draft")} disabled={!!saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
                {saving === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Gỡ về nháp
              </button>
              <button onClick={() => save("published")} disabled={!!saving || !dirty} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-50">
                {saving === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu thay đổi
              </button>
            </>
          ) : (
            <>
              <button onClick={() => save("draft")} disabled={!!saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
                {saving === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu nháp
              </button>
              <button onClick={() => save("published")} disabled={!!saving || !ready} title={ready ? undefined : "Cần có tiêu đề, đường dẫn và nội dung"} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-50">
                {saving === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : willSchedule ? <CalendarClock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} {willSchedule ? "Hẹn giờ đăng" : "Đăng công khai"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* DẢI HOÀN TÁC SAU KHI AI SỬA */}
      {undo && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-violet-50 border border-violet-100 text-xs text-violet-900" role="status">
          <span>✨ AI vừa {undo.label}. Chưa ưng ý thì hoàn tác nhé.</span>
          <span className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => { set("content", undo.content); setUndo(null); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-violet-200 font-bold text-violet-700 hover:bg-violet-100 transition">
              <Undo2 className="w-3.5 h-3.5" /> Hoàn tác
            </button>
            <button type="button" onClick={() => setUndo(null)} aria-label="Đóng" className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        {/* CỘT CHÍNH */}
        <div className="space-y-4 min-w-0">
          {/* Điện thoại: Trợ lý AI nằm ngay đầu trang soạn (cột phụ bị đẩy xuống cuối) */}
          <div className="lg:hidden">
            <AiAssistCard empty={!form.content.trim()} onDraft={() => setDraftSeed({ topic: form.title.trim().length >= 5 ? form.title.trim() : "" })} onIdeas={() => setIdeasOpen(true)} />
          </div>
          <div className={cn(card, "space-y-4")}>
            <CustomInput
              label="Tiêu đề"
              value={form.title}
              onChange={(e) => onTitle(e.target.value)}
              maxLength={200}
              placeholder="VD: Lưu xá Phanxicô mở đơn đăng ký năm học mới"
              className="!text-base !font-bold !py-3"
            />
            <div>
              <CustomTextarea
                label="Tóm tắt (hiện dưới tiêu đề và khi chia sẻ link)"
                value={form.summary ?? ""}
                onChange={(e) => set("summary", e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="1–2 câu khiến người đọc muốn bấm vào bài"
                className="!text-sm resize-y"
                hint={
                  <span className="flex items-center justify-between gap-3">
                    <MetaSuggest content={form.content} title={form.title} onPickTitle={onTitle} onPickSummary={(s) => set("summary", s)} />
                    <span>{(form.summary ?? "").length}/400</span>
                  </span>
                }
              />
            </div>
          </div>

          {/* TRÌNH SOẠN */}
          <div className="bg-white border border-purple-100 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-purple-50 bg-surface-container-low/60">
              <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Định dạng">
                <button type="button" className={toolBtn} title="Tiêu đề lớn" onClick={() => prefixLines(() => "## ", "Tiêu đề mục")}><Heading2 className="w-4 h-4" /></button>
                <button type="button" className={toolBtn} title="Tiêu đề nhỏ" onClick={() => prefixLines(() => "### ", "Tiêu đề nhỏ")}><Heading3 className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button type="button" className={toolBtn} title="In đậm" onClick={() => wrap("**", "**", "chữ đậm")}><Bold className="w-4 h-4" /></button>
                <button type="button" className={toolBtn} title="In nghiêng" onClick={() => wrap("*", "*", "chữ nghiêng")}><Italic className="w-4 h-4" /></button>
                <button type="button" className={toolBtn} title="Chèn liên kết" onClick={addLink}><LinkIcon className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button type="button" className={toolBtn} title="Danh sách gạch đầu dòng" onClick={() => prefixLines(() => "- ", "Ý thứ nhất")}><List className="w-4 h-4" /></button>
                <button type="button" className={toolBtn} title="Danh sách đánh số" onClick={() => prefixLines((i) => `${i + 1}. `, "Bước thứ nhất")}><ListOrdered className="w-4 h-4" /></button>
                <button type="button" className={toolBtn} title="Trích dẫn" onClick={() => prefixLines(() => "> ", "Câu trích dẫn")}><Quote className="w-4 h-4" /></button>
                <button type="button" className={toolBtn} title="Đường kẻ ngang" onClick={() => insertBlock("---")}><Minus className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button type="button" className={toolBtn} title="Chèn ảnh vào bài" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <ImproveMenu getTarget={getImproveTarget} onApply={applyImprove} />
              </div>
              {/* Chuyển Soạn / Xem trước (màn hình nhỏ) */}
              <div className="inline-flex p-0.5 rounded-lg bg-gray-100 lg:hidden">
                <button type="button" onClick={() => setTab("write")} className={cn("px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1", tab === "write" ? "bg-white text-primary shadow-sm" : "text-gray-500")}><Pencil className="w-3 h-3" /> Soạn</button>
                <button type="button" onClick={() => setTab("preview")} className={cn("px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1", tab === "preview" ? "bg-white text-primary shadow-sm" : "text-gray-500")}><Eye className="w-3 h-3" /> Xem trước</button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 lg:divide-x divide-purple-50">
              <div className={cn("p-3", tab === "preview" && "hidden lg:block")}>
                <CustomTextarea
                  ref={taRef}
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  rows={22}
                  placeholder={"Viết nội dung bài ở đây…\n\n## Tiêu đề mục\nĐoạn văn. Dùng thanh công cụ phía trên để in đậm, chèn ảnh, tạo danh sách — hoặc nhờ Trợ lý AI viết nháp giúp bạn."}
                  className="!text-sm !leading-7 min-h-[420px] lg:min-h-[540px] resize-y"
                  spellCheck
                  aria-label="Nội dung bài viết"
                />
              </div>
              <div className={cn("p-5 min-h-[420px] lg:min-h-[540px] overflow-auto bg-surface/40", tab === "write" && "hidden lg:block")} aria-label="Xem trước">
                {form.content.trim() ? (
                  <ArticleMarkdown source={previewSource} compact className="!text-[15px] !leading-7" />
                ) : (
                  <p className="text-sm text-gray-400 italic">Bản xem trước sẽ hiện ở đây khi bạn bắt đầu viết.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-2 border-t border-purple-50 bg-surface-container-low/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
              <span>{words.toLocaleString("vi-VN")} từ · khoảng {Math.max(1, Math.round(words / 200))} phút đọc</span>
              <span className="hidden sm:inline">Ctrl + S để lưu nhanh</span>
            </div>
          </div>
        </div>

        {/* CỘT PHỤ */}
        <aside className="space-y-4 min-w-0">
          <div className="hidden lg:block">
            <AiAssistCard empty={!form.content.trim()} onDraft={() => setDraftSeed({ topic: form.title.trim().length >= 5 ? form.title.trim() : "" })} onIdeas={() => setIdeasOpen(true)} />
          </div>

          <div className={cn(card, "space-y-3")}>
            <h3 className="text-sm font-extrabold text-gray-900">Sẵn sàng đăng?</h3>
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.text} className={cn("flex items-start gap-2 text-xs", c.ok ? "text-gray-600" : c.required ? "text-rose-600 font-semibold" : "text-amber-700")}>
                  {c.ok ? <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /> : c.required ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={card}>
            <ImageUploadDropzone label="Ảnh bìa" value={form.coverFileId ?? ""} onChange={(v) => set("coverFileId", v || null)} bucket="attachments" helperText="Ảnh ngang (16:10) đẹp nhất. Dùng làm hình khi chia sẻ link lên Zalo/Facebook." />
          </div>

          <div className={cn(card, "space-y-4")}>
            <CustomSelect
              label="Chuyên mục"
              value={form.category}
              onChange={(v) => set("category", v)}
              options={ARTICLE_CATEGORIES.map((c) => ({ value: c.code, label: c.label, subLabel: c.description }))}
            />
            <CustomInput
              label="Đường dẫn công khai"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-"));
              }}
              maxLength={120}
              leftIcon={<Link2 className="w-4 h-4" />}
              hint={
                <>
                  <span className="break-all">{origin}/tin-tuc/{form.slug || "…"}</span>
                  {publishedNow && saved.slug !== form.slug && <span className="block text-amber-600 mt-0.5">Đổi đường dẫn sẽ làm link cũ đã chia sẻ không mở được nữa.</span>}
                  {slugTouched && (
                    <button type="button" onClick={() => { setSlugTouched(false); set("slug", slugify(form.title)); }} className="block font-bold text-primary mt-0.5 hover:underline">
                      Tạo lại từ tiêu đề
                    </button>
                  )}
                </>
              }
            />
            <CustomInput label="Người viết / nguồn (tùy chọn)" value={form.byline ?? ""} onChange={(e) => set("byline", e.target.value)} maxLength={120} placeholder="Để trống = tên lưu xá" />
            <TagsInput value={form.tags} onChange={(t) => set("tags", t)} suggestions={tagSuggestions} />
            <CustomToggle checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} label="Bài nổi bật" description="Hiện lớn ở đầu trang công khai" />
          </div>

          <div className={card}>
            <SchedulePicker value={form.publishedAt ?? null} onChange={(v) => set("publishedAt", v)} />
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-900 leading-relaxed">
            <b>Lưu ý:</b> bài đã đăng ai cũng xem được. Đừng đăng số điện thoại, địa chỉ cá nhân hay hình ảnh của người chưa đồng ý.
          </div>
        </aside>
      </div>

      {draftSeed && (
        <DraftDialog
          category={form.category}
          seed={draftSeed}
          hasContent={!!form.content.trim()}
          onClose={() => setDraftSeed(null)}
          onApply={applyDraft}
        />
      )}
      {ideasOpen && (
        <IdeasDialog
          category={form.category}
          onClose={() => setIdeasOpen(false)}
          onPick={(idea, cat) => {
            set("category", cat);
            setIdeasOpen(false);
            setDraftSeed({ topic: idea.title, keyPoints: idea.angle });
          }}
        />
      )}
      {historyOpen && !isNew && (
        <RevisionsDialog
          articleId={id}
          onClose={() => setHistoryOpen(false)}
          onError={(m) => showToast("error", m)}
          onRestored={(a) => {
            const f = fromArticle(a);
            setForm(f);
            setSaved(f);
            setUndo(null);
            setHistoryOpen(false);
            showToast("success", "Đã khôi phục bản cũ.");
          }}
        />
      )}
      <ConfirmDialog
        isOpen={confirmGaps}
        onClose={() => setConfirmGaps(false)}
        onConfirm={() => {
          setConfirmGaps(false);
          void save("published", true);
        }}
        title="Còn chỗ chưa điền?"
        message={<>Trong bài còn <b>{gaps}</b> chỗ đánh dấu <b>[cần bổ sung…]</b> do AI để trống. Đăng bây giờ thì người ngoài sẽ thấy nguyên các dấu này.</>}
        confirmText="Vẫn đăng"
        cancelText="Quay lại sửa"
        variant="warning"
      />
    </div>
  );
}
