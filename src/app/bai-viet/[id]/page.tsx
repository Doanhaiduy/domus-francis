"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bold, Eye, ExternalLink, Heading2, Heading3, ImagePlus, Italic, Link as LinkIcon, List, ListOrdered, Loader2, Minus, Pencil, Quote, Save, Send, Undo2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { articlesApi, useArticle, type ArticleFormPayload } from "@/lib/data/articles";
import { isValidSlug, slugify } from "@/lib/articles-format";
import { ARTICLE_CATEGORIES, type ArticleDetail } from "@/lib/types/articles";
import { ImageUploadDropzone, uploadFile } from "@/components/ui/FormControls";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { cn } from "@/lib/utils";

const EMPTY: ArticleFormPayload = { title: "", slug: "", summary: "", content: "", category: "tin-tuc", coverFileId: null, byline: "", isFeatured: false, status: "draft" };

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
});

const label = "block text-xs font-bold text-gray-700 mb-1.5";
const field = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition";

export default function ArticleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "moi";
  const { showToast } = useApp();
  const { can, isLoading: sessionLoading } = useSession();
  const allowed = can("article.manage");
  const { article, isLoading, error } = useArticle(!isNew && allowed ? id : null);

  const [form, setForm] = useState<ArticleFormPayload>(EMPTY);
  const [saved, setSaved] = useState<ArticleFormPayload>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "publish">(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onTitle = (v: string) =>
    setForm((f) => ({ ...f, title: v, slug: slugTouched ? f.slug : slugify(v) }));

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

  // ---- Lưu ----
  const validate = (publish: boolean): string | null => {
    if (form.title.trim().length < 3) return "Tiêu đề tối thiểu 3 ký tự.";
    if (!isValidSlug(form.slug)) return "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang (3–120 ký tự).";
    if ((form.summary ?? "").length > 400) return "Tóm tắt tối đa 400 ký tự.";
    if (publish && !form.content.trim()) return "Bài đăng công khai phải có nội dung.";
    return null;
  };

  const save = async (status: "draft" | "published") => {
    const err = validate(status === "published");
    if (err) {
      showToast("error", err);
      return;
    }
    setSaving(status === "published" ? "publish" : "draft");
    try {
      const payload: ArticleFormPayload = {
        ...form,
        title: form.title.trim(),
        summary: form.summary?.trim() || null,
        byline: form.byline?.trim() || null,
        status,
      };
      const r = isNew ? await articlesApi.create(payload) : await articlesApi.update(id, payload);
      const f = fromArticle(r);
      setForm(f);
      setSaved(f);
      showToast("success", status === "published" ? "Đã đăng bài — mọi người xem được qua đường link công khai." : "Đã lưu bản nháp.");
      if (isNew) router.replace(`/bai-viet/${r.id}`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  if (!sessionLoading && !allowed) {
    return <div className="max-w-md mx-auto mt-16 text-center text-sm text-gray-600">Bạn chưa có quyền quản lý bài viết công khai.</div>;
  }
  if (!isNew && isLoading && !article) {
    return <div className="max-w-5xl space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-24 rounded-2xl" />)}</div>;
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

  const published = saved.status === "published" && !isNew;
  const previewSource = form.content.replaceAll("/api/v1/public/files/", "/api/v1/files/"); // bản nháp: ảnh đọc qua đường dẫn nội bộ
  const toolBtn = "p-2 rounded-lg text-gray-600 hover:bg-purple-50 hover:text-primary transition disabled:opacity-50";

  return (
    <div className="space-y-5 max-w-6xl">
      {/* THANH TRÊN */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/bai-viet" className="p-2 rounded-xl hover:bg-purple-50 text-gray-500 hover:text-primary transition" title="Về danh sách" aria-label="Về danh sách">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-gray-900 truncate">{isNew ? "Viết bài mới" : "Sửa bài viết"}</h1>
            <p className="text-xs text-gray-500">
              {published ? <span className="text-emerald-700 font-semibold">● Đang công khai</span> : <span>○ Bản nháp — chưa ai ngoài Ban điều hành thấy</span>}
              {dirty && <span className="ml-2 text-amber-600 font-semibold">· Chưa lưu</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {published && (
            <a href={`/tin-tuc/${saved.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition">
              <ExternalLink className="w-3.5 h-3.5" /> Xem trang công khai
            </a>
          )}
          {published ? (
            <>
              <button onClick={() => save("draft")} disabled={!!saving} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
                {saving === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Gỡ về bản nháp
              </button>
              <button onClick={() => save("published")} disabled={!!saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
                {saving === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu thay đổi
              </button>
            </>
          ) : (
            <>
              <button onClick={() => save("draft")} disabled={!!saving} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
                {saving === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu nháp
              </button>
              <button onClick={() => save("published")} disabled={!!saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
                {saving === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Đăng công khai
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        {/* CỘT CHÍNH */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white border border-purple-100 rounded-2xl p-4 sm:p-5 space-y-4">
            <div>
              <label className={label} htmlFor="a-title">Tiêu đề</label>
              <input id="a-title" value={form.title} onChange={(e) => onTitle(e.target.value)} maxLength={200} placeholder="VD: Lưu xá Phanxicô mở đơn đăng ký tuyển sinh năm học mới" className={cn(field, "text-base font-bold")} />
            </div>
            <div>
              <label className={label} htmlFor="a-summary">Tóm tắt <span className="font-normal text-gray-400">(hiện dưới tiêu đề và khi chia sẻ link — nên 1–2 câu)</span></label>
              <textarea id="a-summary" value={form.summary ?? ""} onChange={(e) => set("summary", e.target.value)} rows={2} maxLength={400} placeholder="Điều gì khiến người đọc muốn bấm vào bài này?" className={cn(field, "resize-y")} />
              <p className="text-[11px] text-gray-400 text-right mt-0.5">{(form.summary ?? "").length}/400</p>
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
              </div>
              {/* Chuyển Soạn / Xem trước (màn hình nhỏ) */}
              <div className="inline-flex p-0.5 rounded-lg bg-gray-100 lg:hidden">
                <button type="button" onClick={() => setTab("write")} className={cn("px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1", tab === "write" ? "bg-white text-primary shadow-sm" : "text-gray-500")}><Pencil className="w-3 h-3" /> Soạn</button>
                <button type="button" onClick={() => setTab("preview")} className={cn("px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1", tab === "preview" ? "bg-white text-primary shadow-sm" : "text-gray-500")}><Eye className="w-3 h-3" /> Xem trước</button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 lg:divide-x divide-purple-50">
              <div className={cn(tab === "preview" && "hidden lg:block")}>
                <textarea
                  ref={taRef}
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  placeholder={"Viết nội dung bài ở đây…\n\n## Tiêu đề mục\nĐoạn văn. Dùng thanh công cụ phía trên để in đậm, chèn ảnh, danh sách…"}
                  className="w-full min-h-[440px] lg:min-h-[560px] p-4 text-sm leading-7 text-gray-900 bg-transparent placeholder:text-gray-400 focus:outline-none resize-y font-mono"
                  spellCheck
                  aria-label="Nội dung bài viết"
                />
              </div>
              <div className={cn("p-5 min-h-[440px] lg:min-h-[560px] overflow-auto bg-surface/40", tab === "write" && "hidden lg:block")} aria-label="Xem trước">
                {form.content.trim() ? (
                  <ArticleMarkdown source={previewSource} className="!text-base !leading-7" />
                ) : (
                  <p className="text-sm text-gray-400 italic">Bản xem trước sẽ hiện ở đây khi bạn bắt đầu viết.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CỘT PHỤ */}
        <aside className="space-y-4 min-w-0">
          <div className="bg-white border border-purple-100 rounded-2xl p-4 space-y-4">
            <ImageUploadDropzone label="Ảnh bìa" value={form.coverFileId ?? ""} onChange={(v) => set("coverFileId", v || null)} bucket="attachments" helperText="Ảnh ngang (16:10) đẹp nhất. Dùng làm hình khi chia sẻ link lên Zalo/Facebook." />
          </div>

          <div className="bg-white border border-purple-100 rounded-2xl p-4 space-y-4">
            <div>
              <label className={label} htmlFor="a-cat">Chuyên mục</label>
              <select id="a-cat" value={form.category} onChange={(e) => set("category", e.target.value)} className={field}>
                {ARTICLE_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">{ARTICLE_CATEGORIES.find((c) => c.code === form.category)?.description}</p>
            </div>
            <div>
              <label className={label} htmlFor="a-slug">Đường dẫn</label>
              <div className="flex items-stretch rounded-xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-purple-200 focus-within:border-primary transition overflow-hidden">
                <span className="px-2.5 flex items-center text-[11px] text-gray-400 bg-gray-50 border-r border-gray-200 shrink-0">/tin-tuc/</span>
                <input
                  id="a-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-"));
                  }}
                  maxLength={120}
                  className="flex-1 min-w-0 px-2.5 py-2.5 text-xs text-gray-900 bg-transparent focus:outline-none"
                />
              </div>
              {published && saved.slug !== form.slug && <p className="text-[11px] text-amber-600 mt-1">Đổi đường dẫn sẽ làm link cũ đã chia sẻ không mở được nữa.</p>}
              {slugTouched && (
                <button type="button" onClick={() => { setSlugTouched(false); set("slug", slugify(form.title)); }} className="text-[11px] font-bold text-primary mt-1 hover:underline">
                  Tạo lại từ tiêu đề
                </button>
              )}
            </div>
            <div>
              <label className={label} htmlFor="a-by">Người viết / nguồn <span className="font-normal text-gray-400">(tùy chọn)</span></label>
              <input id="a-by" value={form.byline ?? ""} onChange={(e) => set("byline", e.target.value)} maxLength={120} placeholder="Để trống = tên lưu xá" className={field} />
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary" />
              <span>
                <span className="block text-xs font-bold text-gray-900">Bài nổi bật</span>
                <span className="block text-[11px] text-gray-500">Hiện lớn ở đầu trang công khai (bài nổi bật mới nhất được chọn).</span>
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-900 leading-relaxed">
            <b>Lưu ý:</b> bài đã đăng ai cũng xem được. Đừng đăng số điện thoại, địa chỉ cá nhân hay hình ảnh của người chưa đồng ý.
          </div>
        </aside>
      </div>
    </div>
  );
}
