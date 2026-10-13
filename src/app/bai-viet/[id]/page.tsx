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
  Type,
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
import { CustomInput, CustomSelect, CustomTextarea, CustomToggle, ImageUploadDropzone } from "@/components/ui/FormControls";
import { UploadProgress } from "@/components/ui/UploadProgress";
import { uploadErrorMessage, useUploader } from "@/lib/use-uploader";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { TagsInput } from "../_components/TagsInput";
import { SchedulePicker } from "../_components/SchedulePicker";
import { RevisionsDialog } from "../_components/RevisionsDialog";
import { AiAssistCard, DraftDialog, FlagChips, ImproveMenu, IdeasDialog, MetaSuggest, countPlaceholders, type DraftApplyExtra, type DraftSeed } from "../_components/ArticleAi";
import { CoverAiPanel, ImageGenDialog, IllustrateMenu, SuggestIllustrationsDialog } from "../_components/ArticleImageAi";
import { useAiRunner } from "../_components/useAiRunner";
import { activeFlags, SOFT_FLAG_KINDS, type DraftFlag } from "@/lib/article-verify";
import { paragraphAt, splitParagraphs } from "@/lib/article-paragraphs";
import { cn } from "@/lib/utils";

const EMPTY: ArticleFormPayload = { title: "", slug: "", summary: "", content: "", category: "tin-tuc", coverFileId: null, coverIsAi: false, byline: "", isFeatured: false, status: "draft", tags: [], publishedAt: null };

const fromArticle = (a: ArticleDetail): ArticleFormPayload => ({
  title: a.title,
  slug: a.slug,
  summary: a.summary ?? "",
  content: a.content,
  category: a.category,
  coverFileId: a.coverFileId,
  coverIsAi: a.coverIsAi,
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
  // Ảnh chèn vào nội dung bài: có tiến độ + nút hủy (data-uploading để ModalGuard cảnh báo khi rời trang)
  const imageUpload = useUploader();
  const uploading = imageUpload.uploading;
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [draftSeed, setDraftSeed] = useState<DraftSeed | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [undo, setUndo] = useState<Snapshot | null>(null);
  const [confirmGaps, setConfirmGaps] = useState(false);
  // Các chỗ AI nêu mà dữ kiện không có (xem article-verify.ts) + hộp thoại ảnh minh họa cho đoạn văn
  const [aiFlags, setAiFlags] = useState<DraftFlag[]>([]);
  const [illustrate, setIllustrate] = useState<{ excerpt: string; at: number } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const captionAi = useAiRunner("content.image_caption");
  const illustrateAi = useAiRunner("content.article_image");
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

  /** Tải ảnh lên (thu nhỏ + nén ngay trên trình duyệt) rồi chèn Markdown tại con trỏ. Trả về true nếu chèn được. */
  const uploadAndInsert = async (file: File): Promise<boolean> => {
    try {
      const up = await imageUpload.run(file, "attachments");
      insertBlock(`![Chú thích ảnh](/api/v1/public/files/${up.id})`);
      return true;
    } catch (e) {
      const msg = uploadErrorMessage(e);
      if (msg) showToast("error", msg);
      return false;
    }
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (await uploadAndInsert(file)) showToast("success", "Đã chèn ảnh — sửa phần “Chú thích ảnh” trong ngoặc vuông nếu muốn.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Nhiều ảnh cùng lúc (dán/kéo thả): tải lần lượt để ảnh nằm đúng thứ tự. */
  const insertImages = async (files: File[]) => {
    if (imageUpload.uploading) {
      showToast("info", "Đang tải một ảnh — đợi xong rồi dán tiếp nhé.");
      return;
    }
    let ok = 0;
    for (const f of files) {
      if (await uploadAndInsert(f)) ok++;
      else break; // lỗi hoặc người dùng bấm Hủy ⇒ dừng, không tải tiếp các ảnh còn lại
    }
    if (ok) showToast("success", ok > 1 ? `Đã chèn ${ok} ảnh — sửa phần “Chú thích ảnh” trong ngoặc vuông nếu muốn.` : "Đã chèn ảnh — sửa phần “Chú thích ảnh” trong ngoặc vuông nếu muốn.");
  };

  const imageFiles = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

  /** Ctrl+V: có ảnh trong bộ nhớ tạm (chụp màn hình, "Sao chép ảnh") mà không có chữ kèm theo ⇒ chèn ảnh. Có cả chữ (vd. sao chép từ Word/Excel) ⇒ dán chữ như bình thường. */
  const onPasteEditor = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = imageFiles(e.clipboardData?.files);
    if (!imgs.length) return;
    if (e.clipboardData.getData("text/plain").trim()) return;
    e.preventDefault();
    void insertImages(imgs);
  };

  const onDragOverEditor = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
  };
  const onDropEditor = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const imgs = imageFiles(e.dataTransfer?.files);
    if (!imgs.length) return;
    e.preventDefault();
    void insertImages(imgs);
  };

  // ---- Trợ lý AI ----
  const applyDraft = (out: { title: string; summary: string; content: string; flags: DraftFlag[] }, mode: "replace" | "append", extra: DraftApplyExtra) => {
    setUndo({ content: form.content, label: "đưa bản nháp AI vào bài" });
    // Nguồn tham khảo người soạn đã chọn ghi cuối bài (liên kết gốc để người đọc kiểm chứng)
    const sourcesMd = extra.sources?.length
      ? `\n\n## Nguồn tham khảo\n${extra.sources.map((s) => `- [${s.title.replace(/[[\]]/g, "")}](${s.url})`).join("\n")}`
      : "";
    const body = out.content + sourcesMd;
    setForm((f) =>
      mode === "append"
        ? { ...f, content: `${f.content.trimEnd()}\n\n${body}` }
        : { ...f, title: out.title, summary: out.summary, content: body, slug: slugTouched ? f.slug : slugify(out.title) }
    );
    setAiFlags((prev) => (mode === "append" ? [...prev, ...out.flags] : out.flags));
    setDraftSeed(null);
    setTab("write");
    const gaps = countPlaceholders(out.content);
    const hard = out.flags.filter((f) => !SOFT_FLAG_KINDS.has(f.kind)).length;
    showToast(
      "success",
      gaps || hard
        ? `Đã đưa bản nháp vào bài — còn ${[gaps ? `${gaps} chỗ [cần bổ sung] cần điền` : "", hard ? `${hard} chi tiết AI nêu cần kiểm lại` : ""].filter(Boolean).join(" và ")}.`
        : "Đã đưa bản nháp vào bài — đọc lại và chỉnh theo ý bạn nhé."
    );
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

  const applyImprove = (text: string, label: string, flags: DraftFlag[]) => {
    const r = improveRange.current;
    if (!r) return;
    setUndo({ content: form.content, label: label.toLowerCase() });
    setForm((f) => ({ ...f, content: f.content.slice(0, r.start) + text + f.content.slice(r.end) }));
    improveRange.current = null;
    if (flags.length) {
      setAiFlags((prev) => [...prev, ...flags]);
      showToast("info", `AI thêm ${flags.length} chi tiết (ngày/giờ/số) mà bản gốc không có — kiểm lại ở mục “AI cần bạn kiểm lại”.`);
    }
  };

  // Bấm một thẻ "cần kiểm lại" ⇒ chọn đúng đoạn đó trong khung soạn
  const focusText = (t: string) => {
    const ta = taRef.current;
    const i = form.content.indexOf(t);
    if (!ta || i < 0) {
      showToast("info", "Chi tiết này nằm ở tiêu đề hoặc tóm tắt — hãy kiểm ở ô phía trên.");
      return;
    }
    setTab("write");
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(i, i + t.length);
      ta.scrollTop = Math.max(0, (form.content.slice(0, i).split("\n").length - 3) * 28);
    });
  };

  // AI gợi ý chú thích cho ảnh: con trỏ đang ở dòng ảnh nào thì ảnh đó; không thì ảnh còn chú thích mặc định; không thì ảnh cuối bài
  const captionImage = async () => {
    const v = form.content;
    const imgs = [...v.matchAll(/!\[([^\]]*)\]\((\/api\/v1\/(?:public\/)?files\/([0-9a-f-]{36})[^)\s]*)\)/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, alt: m[1], url: m[2], id: m[3], raw: m[0] }));
    if (!imgs.length) return showToast("info", "Bài chưa có ảnh nào — hãy chèn ảnh trước, rồi nhờ AI gợi ý chú thích.");
    const cur = taRef.current?.selectionStart ?? 0;
    const target = imgs.find((i) => cur >= i.start && cur <= i.end) ?? imgs.find((i) => !i.alt.trim() || /^Chú thích ảnh$/i.test(i.alt.trim())) ?? imgs[imgs.length - 1];
    // Gửi kèm tiêu đề + đoạn văn ngay trên ảnh (không có thì đoạn ngay dưới) để chú thích gắn ảnh với nội dung bài, không chỉ tả ảnh
    const paras = splitParagraphs(v);
    const at = paras.findIndex((p) => p.kind === "image" && p.start <= target.start && p.end >= target.end);
    const near = at < 0 ? undefined : [...paras.slice(0, at)].reverse().find((p) => p.kind === "text") ?? paras.slice(at + 1).find((p) => p.kind === "text");
    const r = await captionAi.run({ fileId: target.id, title: form.title.trim() || undefined, context: near?.text.slice(0, 700) });
    if (!r) return;
    const cap = r.output.caption.replace(/[[\]()]/g, "").trim();
    const alt = (/^\(AI\)\s*/i.test(target.alt) ? "(AI) " : "") + cap;
    setUndo({ content: form.content, label: "gợi ý chú thích ảnh" });
    setForm((f) => (f.content.includes(target.raw) ? { ...f, content: f.content.replace(target.raw, `![${alt}](${target.url})`) } : f));
    showToast("success", "AI đã gợi ý chú thích — đọc lại, sửa nếu chưa đúng nhé.");
  };

  // Minh họa cho đoạn đang chọn (hoặc đoạn chứa con trỏ): ảnh được chèn NGAY SAU đoạn đó
  const startIllustrate = () => {
    if (form.title.trim().length < 3) return showToast("info", "Hãy nhập tiêu đề bài trước — AI dựa vào tiêu đề và nội dung để chọn hình.");
    const ta = taRef.current;
    const v = form.content;
    const s = ta?.selectionStart ?? 0;
    const e = ta?.selectionEnd ?? 0;
    // Ảnh nằm NGAY DƯỚI đoạn đang chọn. Đoạn = một dòng có chữ (xem article-paragraphs.ts): bài viết hay xuống dòng một lần giữa hai đoạn,
    // không chừa dòng trống — tìm theo dòng trống thì cả bài thành một đoạn và ảnh rơi xuống cuối bài.
    const paras = splitParagraphs(v);
    let excerpt: string;
    let at: number;
    if (e > s) {
      excerpt = v.slice(s, e);
      let end = e;
      while (end > s && /\s/.test(v[end - 1])) end--; // chọn cả dấu xuống dòng ở cuối thì không tính sang đoạn kế
      const last = paragraphAt(paras, Math.max(s, end - 1));
      at = last ? last.end : v.length;
    } else {
      const p = paragraphAt(paras, s);
      excerpt = p?.text ?? v;
      at = p ? p.end : v.length;
    }
    excerpt = excerpt.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/^#{1,3}\s+/gm, "").trim().slice(0, 1200);
    setIllustrate({ excerpt, at });
  };

  // "AI đề xuất chỗ chèn ảnh": cần có bài để AI đọc
  const startSuggest = () => {
    if (form.title.trim().length < 3) return showToast("info", "Hãy nhập tiêu đề bài trước — AI dựa vào tiêu đề và nội dung để chọn chỗ chèn ảnh.");
    if (form.content.trim().length < 80) return showToast("info", "Bài còn quá ngắn để AI đề xuất chỗ chèn ảnh — hãy viết thêm vài đoạn rồi thử lại.");
    setSuggestOpen(true);
  };

  // Chèn nhiều ảnh cùng lúc: đi từ cuối bài lên đầu để vị trí các ảnh phía trên không bị lệch
  const insertIllustrations = (items: { at: number; fileId: string; alt: string }[]) => {
    if (!items.length) return;
    setUndo({ content: form.content, label: "chèn ảnh minh họa" });
    setForm((f) => {
      let v = f.content;
      for (const it of [...items].sort((a, b) => b.at - a.at)) {
        const md = `![${it.alt.replace(/[[\]]/g, "")}](/api/v1/public/files/${it.fileId})`;
        const i = Math.min(it.at, v.length);
        const before = v.slice(0, i).trimEnd();
        const after = v.slice(i).replace(/^\s+/, "");
        v = `${before}\n\n${md}${after ? `\n\n${after}` : "\n"}`;
      }
      return { ...f, content: v };
    });
    setSuggestOpen(false);
    showToast("success", `Đã chèn ${items.length} ảnh minh họa (có nhãn “do AI tạo”) — sửa chú thích nếu muốn.`);
  };

  const insertIllustration = (img: { fileId: string; alt: string }) => {
    const md = `![${img.alt.replace(/[[\]]/g, "")}](/api/v1/public/files/${img.fileId})`;
    const at = illustrate?.at ?? form.content.length;
    setUndo({ content: form.content, label: "chèn ảnh minh họa" });
    setForm((f) => {
      const v = f.content;
      const i = Math.min(at, v.length);
      const before = v.slice(0, i).trimEnd();
      const after = v.slice(i).replace(/^\s+/, "");
      return { ...f, content: [before, md, after].filter(Boolean).join("\n\n") + (after ? "" : "\n") };
    });
    setIllustrate(null);
    showToast("success", "Đã chèn ảnh minh họa (có nhãn “do AI tạo”) — sửa chú thích nếu muốn.");
  };

  // ---- Chỉ số / danh sách kiểm tra trước khi đăng ----
  const words = useMemo(() => wordCount(form.content), [form.content]);
  const gaps = useMemo(() => countPlaceholders(form.content) + countPlaceholders(form.summary ?? "") + countPlaceholders(form.title), [form.content, form.summary, form.title]);
  // Chỗ AI nêu mà dữ kiện không có: chỉ còn hiện khi đoạn đó vẫn nằm trong bài (sửa/xóa rồi thì biến mất)
  const activeAiFlags = useMemo(() => activeFlags(aiFlags, `${form.title}
${form.summary ?? ""}
${form.content}`), [aiFlags, form.title, form.summary, form.content]);
  const hardFlags = activeAiFlags.filter((f) => !SOFT_FLAG_KINDS.has(f.kind)).length;
  const checks = [
    { ok: form.title.trim().length >= 3, text: "Có tiêu đề", required: true },
    { ok: isValidSlug(form.slug), text: "Đường dẫn hợp lệ", required: true },
    { ok: words >= 1, text: "Có nội dung", required: true },
    { ok: !!form.coverFileId, text: "Có ảnh bìa (đẹp khi chia sẻ link)", required: false },
    { ok: (form.summary ?? "").trim().length >= 20, text: "Có tóm tắt 1–2 câu", required: false },
    { ok: words >= 120, text: `Đủ dài để người đọc có ích (${words}/120 từ)`, required: false },
    { ok: gaps === 0, text: gaps ? `Còn ${gaps} chỗ [cần bổ sung] chưa điền` : "Không còn chỗ trống [cần bổ sung]", required: false },
    ...(aiFlags.length ? [{ ok: hardFlags === 0, text: hardFlags ? `Còn ${hardFlags} chi tiết AI nêu (ngày/giờ/số) chưa kiểm lại` : "Các chi tiết AI nêu đã được kiểm lại", required: false }] : []),
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

      <div className="grid gap-5 xl:grid-cols-[1fr_320px] items-start">
        {/* CỘT CHÍNH */}
        <div className="space-y-4 min-w-0">
          {/* Điện thoại: Trợ lý AI nằm ngay đầu trang soạn (cột phụ bị đẩy xuống cuối) */}
          <div className="xl:hidden">
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
                <button type="button" className={toolBtn} title="Chèn ảnh vào bài (hoặc dán ảnh bằng Ctrl+V ngay trong khung soạn)" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <ImproveMenu getTarget={getImproveTarget} onApply={applyImprove} />
                <IllustrateMenu available={illustrateAi.available} reason={illustrateAi.reason} onSingle={startIllustrate} onSuggest={startSuggest} />
                <button type="button" className={toolBtn} title={captionAi.available ? "AI gợi ý chú thích cho ảnh (ảnh ở con trỏ, hoặc ảnh chưa có chú thích)" : `Gợi ý chú thích chưa dùng được${captionAi.reason ? `: ${captionAi.reason}` : ""}`} disabled={!captionAi.available || captionAi.busy} onClick={captionImage}>
                  {captionAi.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
                </button>
              </div>
              {/* Chuyển Soạn / Xem trước (màn hình nhỏ) */}
              <div className="inline-flex p-0.5 rounded-lg bg-gray-100 xl:hidden">
                <button type="button" onClick={() => setTab("write")} className={cn("px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1", tab === "write" ? "bg-white text-primary shadow-sm" : "text-gray-500")}><Pencil className="w-3 h-3" /> Soạn</button>
                <button type="button" onClick={() => setTab("preview")} className={cn("px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1", tab === "preview" ? "bg-white text-primary shadow-sm" : "text-gray-500")}><Eye className="w-3 h-3" /> Xem trước</button>
              </div>
            </div>

            {uploading && (
              <div data-uploading="1" className="px-3 pt-3">
                <UploadProgress state={imageUpload.state} onCancel={imageUpload.cancel} />
              </div>
            )}
            <div className="grid xl:grid-cols-2 xl:divide-x divide-purple-50">
              <div className={cn("p-3", tab === "preview" && "hidden xl:block")}>
                <CustomTextarea
                  ref={taRef}
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  rows={22}
                  placeholder={"Viết nội dung bài ở đây…\n\n## Tiêu đề mục\nĐoạn văn. Dùng thanh công cụ phía trên để in đậm, chèn ảnh (hoặc dán ảnh bằng Ctrl+V), tạo danh sách — hoặc nhờ Trợ lý AI viết nháp giúp bạn."}
                  className="!text-sm !leading-7 min-h-[420px] xl:min-h-[540px] resize-y"
                  spellCheck
                  aria-label="Nội dung bài viết"
                  onPaste={onPasteEditor}
                  onDragOver={onDragOverEditor}
                  onDrop={onDropEditor}
                />
              </div>
              <div className={cn("p-5 min-h-[420px] xl:min-h-[540px] overflow-auto bg-surface/40", tab === "write" && "hidden xl:block")} aria-label="Xem trước">
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
          <div className="hidden xl:block">
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

          {activeAiFlags.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-2.5">
              <h3 className="text-sm font-extrabold text-amber-900">AI cần bạn kiểm lại</h3>
              <p className="text-[11px] text-amber-800 leading-relaxed">Những chi tiết này AI nêu trong bài nhưng dữ kiện bạn đưa không có (hoặc là cụm từ nghe “như văn AI”). Bấm một thẻ để tìm trong bài; sửa hoặc xóa là thẻ tự biến mất.</p>
              <FlagChips flags={activeAiFlags} onPick={focusText} />
            </div>
          )}

          <div className={card}>
            <ImageUploadDropzone label="Ảnh bìa" value={form.coverFileId ?? ""} onChange={(v) => setForm((f) => ({ ...f, coverFileId: v || null, coverIsAi: false }))} bucket="attachments" helperText="Ảnh ngang (16:10) đẹp nhất. Dùng làm hình khi chia sẻ link lên Zalo/Facebook." />
            <CoverAiPanel
              title={form.title}
              summary={form.summary ?? ""}
              category={form.category}
              isAi={!!form.coverIsAi && !!form.coverFileId}
              onCover={(fileId, isAi) => setForm((f) => ({ ...f, coverFileId: fileId, coverIsAi: isAi }))}
            />
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
      {illustrate && (
        <ImageGenDialog
          mode="inline"
          title={form.title}
          summary={form.summary ?? ""}
          category={form.category}
          excerpt={illustrate.excerpt}
          onClose={() => setIllustrate(null)}
          onPick={insertIllustration}
        />
      )}
      {suggestOpen && (
        <SuggestIllustrationsDialog
          title={form.title}
          summary={form.summary ?? ""}
          category={form.category}
          content={form.content}
          onClose={() => setSuggestOpen(false)}
          onInsert={insertIllustrations}
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
